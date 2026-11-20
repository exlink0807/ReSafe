-- RE:SAFE schema. 모든 테이블은 RLS로 사용자별 분리.
-- 원본 얼굴 이미지·증거 원문은 저장하지 않고 해시/임베딩/요약만 저장한다.

create table cases(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  case_type text not null,
  incident_date date,
  description text,
  status text not null default 'open',
  created_at timestamptz default now()
);

create table reports(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  report_content jsonb not null,       -- 구조화된 12개 항목 답변
  category text,                        -- categorize() 결과 (디지털 성범죄 / 사이버사기 / ...)
  missing_fields text[] default '{}',
  created_at timestamptz default now()
);

create table media_assets(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  file_name text,
  file_type text,
  hash text,
  uploaded_at timestamptz default now()
);

create table trace_results(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  source_url text,
  platform text,
  similarity_score numeric(4,1),
  detection_type text,
  simulated boolean not null default true,
  verification_status text not null default 'pending',
  page_summary text,                    -- AI 페이지 분석 결과 (숨은 지시 제거 후)
  page_stripped_lines int default 0,
  discovered_at timestamptz default now()
);

create table security_findings(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  target text,
  finding_type text,
  severity text,
  evidence text,
  authorization_scope text not null,    -- 'self-test' | 'authorized-external' | 'public-program'
  created_at timestamptz default now()
);

create table evidence(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  file_id uuid references media_assets,
  storage_path text,
  sha256 text not null,
  source_url text,
  kind text not null default 'binary',  -- 'binary' | 'text'
  ai_summary text,                      -- AI 요약 결과 (원문은 저장하지 않음)
  stripped_lines int default 0,         -- 숨은 지시 제거 줄 수
  collected_at timestamptz default now(),
  verification_status text not null default 'unverified'
);

create table removal_requests(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  trace_result_id uuid references trace_results,
  platform text,
  status text not null default 'prepared'
    check (status in ('prepared','submitted','reviewing','removed','rejected','unknown')),
  requested_at timestamptz default now(),
  resolved_at timestamptz
);

create table monitoring_records(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  fingerprint text not null,            -- perceptual hash (64bit, '0101..' 문자열)
  last_checked_at timestamptz,
  status text default 'active'
);

create table watermarks(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  code text not null unique,            -- 이미지에 삽입한 기록 코드 (예: WM-AB12CD)
  planned_date date,
  destination text,
  purpose text,
  created_at timestamptz default now()
);

create table ai_security_events(
  id bigserial primary key,
  case_id uuid references cases on delete cascade,
  user_id uuid references auth.users,
  event_type text not null,             -- 'blocked' | 'stripped' | 'crisis' | 'leak_demo' | 'output_leak'
  rule_matched text,                    -- 매칭된 가드 규칙명 (원문은 기록하지 않음)
  guard_on boolean not null,
  at timestamptz default now()
);

create table audit_logs(
  id bigserial primary key,
  case_id uuid references cases on delete cascade,
  actor uuid,
  action text not null,
  target text,
  at timestamptz default now()
);

create table eeg_sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  session_date timestamptz default now(),
  band_power jsonb,
  duration int,
  feedback_score numeric
);

create table prevention_records(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  feature_type text,
  created_at timestamptz default now(),
  status text
);

alter table cases enable row level security;
create policy own_cases on cases for all using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$ declare t text; begin
  foreach t in array array[
    'reports','media_assets','trace_results','security_findings',
    'evidence','removal_requests','monitoring_records','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy own_rows on %I for all using (exists(select 1 from cases c where c.id=%I.case_id and c.user_id=auth.uid())) with check (exists(select 1 from cases c where c.id=%I.case_id and c.user_id=auth.uid()))',
      t, t, t
    );
  end loop;
  foreach t in array array['eeg_sessions','prevention_records','watermarks'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy own_rows on %I for all using (user_id=auth.uid()) with check (user_id=auth.uid())', t);
  end loop;
end $$;

alter table ai_security_events enable row level security;
create policy own_or_case_rows on ai_security_events for all
  using (user_id = auth.uid() or exists(select 1 from cases c where c.id = ai_security_events.case_id and c.user_id = auth.uid()))
  with check (user_id = auth.uid() or exists(select 1 from cases c where c.id = ai_security_events.case_id and c.user_id = auth.uid()));

-- Storage: 비공개 버킷 'evidence' (경로: {user_id}/{evidence_id})를 대시보드에서 만들고
-- 본인 폴더만 접근하도록 정책을 설정하세요. 텍스트 증거의 원문은 이 버킷에도, DB에도 저장하지 않는다
-- (서버 메모리에서 AI 요약·숨은 지시 제거를 수행한 뒤 요약만 evidence.ai_summary에 남긴다).
