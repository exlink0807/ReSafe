import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 서버에서 사용할 Supabase 클라이언트는 반드시 '사용자의 JWT'로 만든다.
 * service_role 키는 RLS를 무시하므로 API 라우트에서 절대 사용하지 않는다
 * (RLS가 곧 테넌트 격리이자 최후 방어선 — service_role 사용은 그 방어선을 통째로 끄는 것).
 */
export function dbFromToken(accessToken: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
}

export async function requireUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const headerToken = authHeader?.replace(/^Bearer\s+/i, '');
  const token = headerToken || cookies().get('sb-access-token')?.value;
  if (!token) return { error: 'unauthorized' as const };
  // 쿠키로 인증하는 상태 변경 요청은 같은 출처에서 온 것만 허용 (CSRF 방어).
  // Authorization 헤더 방식은 다른 사이트가 붙일 수 없으므로 검사하지 않는다.
  if (!headerToken && !['GET', 'HEAD'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    if (!origin || !host || new URL(origin).host !== host) return { error: 'unauthorized' as const };
  }
  const db = dbFromToken(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { error: 'unauthorized' as const };
  return { db, user: data.user };
}

/**
 * 세션/권한 격리 헬퍼.
 *
 * 핵심 원칙: 어떤 case_id를 조회할지는 "대화 내용(AI나 사용자가 입력한 문장)"이 아니라
 * 항상 "서버가 DB에서 검증한 소유권"으로 결정한다. AI(LLM)가 대화 중에 다른 case_id나
 * 다른 사용자 이름을 언급하더라도, 그 값은 쿼리에 절대 쓰이지 않는다 — 클라이언트가 보낸
 * caseId는 여기서 소유권을 확인한 뒤에만 사용되고, 확인에 실패하면 즉시 에러로 막는다.
 * RLS가 최후 방어선이지만, 이 함수는 "AI 레이어가 실수로/공격당해서 잘못된 case_id를
 * 만들어내는 것"까지 한 겹 더 막기 위한 명시적 체크다.
 */
export async function requireOwnedCase(
  db: SupabaseClient,
  caseId: string
): Promise<{ ok: true } | { ok: false; error: 'forbidden' | 'not_found' }> {
  const { data, error } = await db.from('cases').select('id').eq('id', caseId).maybeSingle();
  if (error) return { ok: false, error: 'not_found' };
  if (!data) return { ok: false, error: 'forbidden' }; // RLS 때문에 남의 case는 조회 자체가 안 됨 → null
  return { ok: true };
}

export async function audit(
  db: SupabaseClient,
  params: { caseId?: string; actor: string; action: string; target?: string }
) {
  await db.from('audit_logs').insert({
    case_id: params.caseId ?? null,
    actor: params.actor,
    action: params.action,
    target: params.target ?? null,
  });
}

export async function logSecurityEvent(
  db: SupabaseClient,
  params: { caseId?: string; userId: string; eventType: 'blocked' | 'stripped' | 'crisis' | 'leak_demo' | 'output_leak'; ruleMatched?: string; guardOn: boolean }
) {
  await db.from('ai_security_events').insert({
    case_id: params.caseId ?? null,
    user_id: params.userId,
    event_type: params.eventType,
    rule_matched: params.ruleMatched ?? null,
    guard_on: params.guardOn,
  });
}

/**
 * DB 오류 원문(테이블·컬럼·제약 조건 이름)을 응답에 그대로 내보내지 않는다. 원문은 서버 로그에만 남긴다.
 */
export function safeError(error: { message?: string; code?: string } | null, status = 400) {
  console.error('[db]', error?.code, error?.message);
  return NextResponse.json({ error: '요청을 처리하지 못했어요.' }, { status });
}
