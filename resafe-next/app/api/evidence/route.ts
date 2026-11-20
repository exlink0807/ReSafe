import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, audit, logSecurityEvent } from '@/lib/supabase';
import { stripHiddenInstructions, guardCheck } from '@/lib/ai/guard';

/**
 * 증거 등록: 바이너리 증거는 해시만, 텍스트 증거는 원문을 저장하지 않는다.
 * 텍스트는 이 요청 처리 중에만 메모리에 존재하고, 숨은 지시 제거 후 요약만 DB에 남는다.
 */
const BinaryEvidenceSchema = z.object({
  caseId: z.string().uuid(),
  kind: z.literal('binary'),
  fileName: z.string(),
  fileType: z.string(),
  sha256: z.string().length(64),
  sourceUrl: z.string().url().optional(),
});

const TextEvidenceSchema = z.object({
  caseId: z.string().uuid(),
  kind: z.literal('text'),
  fileName: z.string(),
  rawText: z.string().max(50000), // 요청 처리 중에만 사용, DB에는 저장하지 않음
  sourceUrl: z.string().url().optional(),
});

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { db, user } = auth;

  const body = await req.json();

  if (body.kind === 'text') {
    const parsed = TextEvidenceSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

    const stripped = stripHiddenInstructions(parsed.data.rawText);
    const guard = guardCheck(stripped.clean);
    if (stripped.removed > 0 || guard.verdict !== 'ok') {
      await logSecurityEvent(db, {
        caseId: parsed.data.caseId, userId: user.id,
        eventType: guard.verdict === 'crisis' ? 'crisis' : stripped.removed > 0 ? 'stripped' : 'blocked',
        ruleMatched: guard.matchedRule ?? stripped.matchedRules.join(','), guardOn: true,
      });
    }
    const hash = await sha256Hex(parsed.data.rawText); // 무결성 확인용. 원문은 저장하지 않음.
    const summary = `[SIMULATED 요약] ${stripped.clean.slice(0, 200)}${stripped.clean.length > 200 ? '…' : ''}`;

    const { data, error } = await db
      .from('evidence')
      .insert({
        case_id: parsed.data.caseId,
        sha256: hash,
        source_url: parsed.data.sourceUrl ?? null,
        kind: 'text',
        ai_summary: summary,
        stripped_lines: stripped.removed,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await audit(db, { caseId: parsed.data.caseId, actor: user.id, action: 'evidence.add_text', target: data.id });
    return NextResponse.json({ evidence: data }, { status: 201 });
  }

  const parsed = BinaryEvidenceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { data: media, error: mediaErr } = await db
    .from('media_assets')
    .insert({ case_id: parsed.data.caseId, file_name: parsed.data.fileName, file_type: parsed.data.fileType, hash: parsed.data.sha256 })
    .select()
    .single();
  if (mediaErr) return NextResponse.json({ error: mediaErr.message }, { status: 400 });

  const { data, error } = await db
    .from('evidence')
    .insert({
      case_id: parsed.data.caseId,
      file_id: media.id,
      sha256: parsed.data.sha256,
      source_url: parsed.data.sourceUrl ?? null,
      kind: 'binary',
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await audit(db, { caseId: parsed.data.caseId, actor: user.id, action: 'evidence.add_binary', target: data.id });
  return NextResponse.json({ evidence: data }, { status: 201 });
}
