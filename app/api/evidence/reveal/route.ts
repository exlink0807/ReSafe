import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, audit } from '@/lib/supabase';
import { decryptUrl, isEncryptedFormat } from '@/lib/security/crypto';

/** 증거의 source_url 복호화. app/api/trace/reveal/route.ts와 동일한 설계 — 매 열람마다 감사로그. */
const RevealSchema = z.object({ evidenceId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { db, user } = auth;

  const body = await req.json();
  const parsed = RevealSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { data, error } = await db
    .from('evidence')
    .select('id, case_id, source_url')
    .eq('id', parsed.data.evidenceId)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const url = data.source_url && isEncryptedFormat(data.source_url) ? decryptUrl(data.source_url) : data.source_url;

  await audit(db, { caseId: data.case_id, actor: user.id, action: 'url.reveal', target: data.id });
  return NextResponse.json({ url });
}
