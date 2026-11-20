import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

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
  const token = authHeader?.replace(/^Bearer\s+/i, '') || cookies().get('sb-access-token')?.value;
  if (!token) return { error: 'unauthorized' as const };
  const db = dbFromToken(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { error: 'unauthorized' as const };
  return { db, user: data.user };
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
  params: { caseId?: string; userId: string; eventType: 'blocked' | 'stripped' | 'crisis' | 'leak_demo'; ruleMatched?: string; guardOn: boolean }
) {
  await db.from('ai_security_events').insert({
    case_id: params.caseId ?? null,
    user_id: params.userId,
    event_type: params.eventType,
    rule_matched: params.ruleMatched ?? null,
    guard_on: params.guardOn,
  });
}
