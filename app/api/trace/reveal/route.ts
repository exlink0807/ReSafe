import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, audit } from '@/lib/supabase';
import { decryptUrl, isEncryptedFormat } from '@/lib/security/crypto';

/**
 * 추적 결과의 원본 URL은 평소 암호화된 채로만 저장/전송된다(app/api/trace/route.ts 참고).
 * 사용자가 실제로 "URL 보기"를 눌렀을 때만 이 엔드포인트가 복호화해서 돌려주고,
 * 그 사실을 audit_logs에 'url.reveal'로 남긴다 — 세션이 탈취됐을 때 짧은 시간에
 * URL을 대량으로 열람하는 비정상 패턴이 로그에 남아 추적 가능하도록 하기 위함이다.
 * (사전 차단은 아니며, 사후 탐지를 위한 흔적 남기기다 — README에 한계를 명시했다.)
 */
const RevealSchema = z.object({ traceResultId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { db, user } = auth;

  const body = await req.json();
  const parsed = RevealSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  // RLS 덕분에 본인 소유 case에 속한 row만 조회된다 (남의 trace_result는 아예 안 보임).
  const { data, error } = await db
    .from('trace_results')
    .select('id, case_id, source_url')
    .eq('id', parsed.data.traceResultId)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const url = data.source_url && isEncryptedFormat(data.source_url) ? decryptUrl(data.source_url) : data.source_url;

  await audit(db, { caseId: data.case_id, actor: user.id, action: 'url.reveal', target: data.id });
  return NextResponse.json({ url });
}
