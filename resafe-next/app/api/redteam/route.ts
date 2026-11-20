import { NextRequest, NextResponse } from 'next/server';
import { requireUser, audit } from '@/lib/supabase';
import { runRedteam } from '@/lib/ai/redteam';

/**
 * 화이트햇 엔진 · AI 레드팀 자가 점검 (scope: self-test).
 * 우리 서비스의 AI 보안 레이어만 점검한다. 외부 시스템은 대상이 아니다. API 비용이 들지 않는다.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  const out = runRedteam();
  await audit(auth.db, { actor: auth.user.id, action: 'redteam.self_test', target: `detect:${out.summary.detectV2}/${out.summary.attacks}` }).catch(() => {});
  return NextResponse.json({ ...out, scope: 'self-test', at: new Date().toISOString() });
}
