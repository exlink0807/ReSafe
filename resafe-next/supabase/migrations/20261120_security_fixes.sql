-- 이미 schema.sql을 적용한 Supabase 프로젝트에서 실행하는 보안 수정분.
-- 새로 만드는 프로젝트는 schema.sql만 실행하면 된다.

-- 1) 감사 로그: 수정·삭제 불가, 조회·추가만
drop policy if exists own_rows on audit_logs;
create policy audit_select on audit_logs for select
  using (exists(select 1 from cases c where c.id = audit_logs.case_id and c.user_id = auth.uid()) or actor = auth.uid());
create policy audit_insert on audit_logs for insert
  with check (actor = auth.uid() and (case_id is null or exists(select 1 from cases c where c.id = audit_logs.case_id and c.user_id = auth.uid())));

-- 2) 보안 이벤트: 남의 케이스에 이벤트를 넣지 못하게, 수정·삭제 불가
drop policy if exists own_or_case_rows on ai_security_events;
create policy sec_select on ai_security_events for select
  using (user_id = auth.uid() or exists(select 1 from cases c where c.id = ai_security_events.case_id and c.user_id = auth.uid()));
create policy sec_insert on ai_security_events for insert
  with check (user_id = auth.uid() and (case_id is null or exists(select 1 from cases c where c.id = ai_security_events.case_id and c.user_id = auth.uid())));

-- 3) 삭제 요청이 다른 케이스의 추적 결과를 가리키지 못하게
create or replace function check_removal_trace() returns trigger language plpgsql as $$
begin
  if new.trace_result_id is not null and not exists(
    select 1 from trace_results t where t.id = new.trace_result_id and t.case_id = new.case_id) then
    raise exception 'trace_result_id does not belong to this case';
  end if;
  return new;
end $$;
drop trigger if exists removal_trace_same_case on removal_requests;
create trigger removal_trace_same_case before insert or update on removal_requests
  for each row execute function check_removal_trace();
