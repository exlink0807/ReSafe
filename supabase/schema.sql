-- RE:SAFE schema. 모든 테이블은 RLS로 사용자별 분리.
-- 원본 얼굴 이미지·증거 원문은 저장하지 않고 해시/임베딩/요약만 저장한다.
--
-- 이 파일은 몇 번을 다시 실행해도 안전하도록(idempotent) 작성되어 있다 —
-- 이미 있는 테이블/정책/함수는 조용히 건너뛰거나 갱신하고, 에러를 내지 않는다.
-- 그래서 기능이 추가될 때마다 전체 파일을 다시 SQL Editor에 붙여넣고 실행하면 된다.

create table if not exists cases(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  case_type text not null,
  incident_date date,
  description text,
  status text not null default 'open',
  created_at timestamptz default now()
);

create table if not exists reports(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  report_content jsonb not null,       -- 구조화된 16개 항목 답변
  category text,                        -- categorize() 결과 (디지털 성범죄 / 사이버사기 / ...)
  missing_fields text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists media_assets(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  file_name text,
  file_type text,
  hash text,
  uploaded_at timestamptz default now()
);

create table if not exists trace_results(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  source_url text,                      -- 암호화된 문자열로 저장됨 (lib/security/crypto.ts)
  platform text,
  similarity_score numeric(4,1),
  detection_type text,
  simulated boolean not null default true,
  verification_status text not null default 'pending',
  page_summary text,                    -- AI 페이지 분석 결과 (숨은 지시 제거 후)
  page_stripped_lines int default 0,
  discovered_at timestamptz default now()
);

create table if not exists security_findings(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  target text,
  finding_type text,
  severity text,
  evidence text,
  authorization_scope text not null,    -- 'self-test' | 'authorized-external' | 'public-program'
  created_at timestamptz default now()
);

create table if not exists evidence(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  file_id uuid references media_assets,
  storage_path text,
  sha256 text not null,
  source_url text,                      -- 암호화된 문자열로 저장됨 (lib/security/crypto.ts)
  kind text not null default 'binary',  -- 'binary' | 'text'
  ai_summary text,                      -- AI 요약 결과 (원문은 저장하지 않음)
  stripped_lines int default 0,         -- 숨은 지시 제거 줄 수
  collected_at timestamptz default now(),
  verification_status text not null default 'unverified'
);

create table if not exists removal_requests(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  trace_result_id uuid references trace_results,
  platform text,
  status text not null default 'prepared'
    check (status in ('prepared','submitted','reviewing','removed','rejected','unknown')),
  requested_at timestamptz default now(),
  resolved_at timestamptz
);

create table if not exists monitoring_records(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  fingerprint text not null,            -- perceptual hash (64bit, '0101..' 문자열)
  last_checked_at timestamptz,
  status text default 'active'
);

create table if not exists watermarks(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  code text not null unique,            -- 이미지에 삽입한 기록 코드 (예: WM-AB12CD)
  planned_date date,
  destination text,
  purpose text,
  created_at timestamptz default now()
);

create table if not exists ai_security_events(
  id bigserial primary key,
  case_id uuid references cases on delete cascade,
  user_id uuid references auth.users,
  event_type text not null,             -- 'blocked' | 'stripped' | 'crisis' | 'leak_demo' | 'output_leak'
  rule_matched text,                    -- 매칭된 가드 규칙명 (원문은 기록하지 않음)
  guard_on boolean not null,
  at timestamptz default now()
);

create table if not exists audit_logs(
  id bigserial primary key,
  case_id uuid references cases on delete cascade,
  actor uuid,
  action text not null,                 -- 예: 'case.create', 'url.reveal'
  target text,
  at timestamptz default now()
);

create table if not exists eeg_sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  session_date timestamptz default now(),
  band_power jsonb,
  duration int,
  feedback_score numeric
);

create table if not exists prevention_records(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  feature_type text,
  created_at timestamptz default now(),
  status text
);

-- 로그인 시도 기록 (성공/실패 모두). 비로그인 상태에서도 기록해야 하므로 INSERT는 열어두되,
-- SELECT는 막아서 "누가 로그인 시도를 했는지"를 다른 사용자가 조회하지 못하게 한다.
create table if not exists login_attempts(
  id bigserial primary key,
  email text not null,
  success boolean not null,
  at timestamptz default now()
);

-- ============================================================================
-- RLS: 모든 테이블은 "본인 소유"만 접근 가능. drop-then-create로 재실행해도 안전하게.
-- ============================================================================

alter table cases enable row level security;
drop policy if exists own_cases on cases;
create policy own_cases on cases for all using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$ declare t text; begin
  foreach t in array array[
    'reports','media_assets','trace_results','security_findings',
    'evidence','removal_requests','monitoring_records','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists own_rows on %I', t);
    execute format(
      'create policy own_rows on %I for all using (exists(select 1 from cases c where c.id=%I.case_id and c.user_id=auth.uid())) with check (exists(select 1 from cases c where c.id=%I.case_id and c.user_id=auth.uid()))',
      t, t, t
    );
  end loop;
  foreach t in array array['eeg_sessions','prevention_records','watermarks'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists own_rows on %I', t);
    execute format('create policy own_rows on %I for all using (user_id=auth.uid()) with check (user_id=auth.uid())', t);
  end loop;
end $$;

alter table ai_security_events enable row level security;
drop policy if exists own_or_case_rows on ai_security_events;
create policy own_or_case_rows on ai_security_events for all
  using (user_id = auth.uid() or exists(select 1 from cases c where c.id = ai_security_events.case_id and c.user_id = auth.uid()))
  with check (user_id = auth.uid() or exists(select 1 from cases c where c.id = ai_security_events.case_id and c.user_id = auth.uid()));

alter table login_attempts enable row level security;
drop policy if exists insert_only on login_attempts;
create policy insert_only on login_attempts for insert with check (true);
-- select 정책 없음 → anon/authenticated 모두 직접 조회 불가. recent_failed_attempts()로만 집계 확인.

-- Storage: 비공개 버킷 'evidence' (경로: {user_id}/{evidence_id})를 대시보드에서 만들고
-- 본인 폴더만 접근하도록 정책을 설정하세요. 텍스트 증거의 원문은 이 버킷에도, DB에도 저장하지 않는다
-- (서버 메모리에서 AI 요약·숨은 지시 제거를 수행한 뒤 요약만 evidence.ai_summary에 남긴다).

-- ============================================================================
-- 로그인 보안 함수
-- ============================================================================
-- 이 서비스는 팀 내부 도구가 아니라 불특정 다수 피해자가 가입하는 공개 서비스이므로
-- "허용목록만 가입 가능" 방식은 쓰지 않는다 (실제 운영 시엔 Supabase의 이메일 확인·CAPTCHA로
-- 어뷰징을 막는 것을 권장 — app/login/page.tsx 상단 주석 참고).
-- 혹시 예전 버전을 이미 실행해서 team_allowlist / is_email_allowed()가 남아있다면 정리한다.
drop function if exists is_email_allowed(text);
drop table if exists team_allowlist;

-- SECURITY DEFINER 함수: 로그 테이블 전체를 노출하지 않고 "최근 실패 횟수"만 반환.
create or replace function recent_failed_attempts(p_email text, p_window_minutes int default 15)
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int from login_attempts
  where lower(email) = lower(p_email)
    and success = false
    and at > now() - (p_window_minutes || ' minutes')::interval;
$$;
grant execute on function recent_failed_attempts(text, int) to anon, authenticated;

-- 민감 URL 암호화 안내: evidence.source_url, trace_results.source_url에는 평문 URL이 아니라
-- lib/security/crypto.ts의 encryptUrl()로 암호화한 문자열을 저장한다 (컬럼 타입은 그대로 text).
-- 복호화는 app/api/*/reveal/route.ts를 통해서만, 매번 audit_logs에 'url.reveal' 기록을 남기며 수행된다.
