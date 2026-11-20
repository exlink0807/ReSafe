import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, audit, logSecurityEvent } from '@/lib/supabase';
import { getTraceProvider } from '@/lib/ai/provider';
import { guardCheck, stripHiddenInstructions } from '@/lib/ai/guard';
import { encryptUrl } from '@/lib/security/crypto';

const TraceRequestSchema = z.object({
  caseId: z.string().uuid(),
  fingerprint: z.string().min(1),
});

/** 외부 페이지 텍스트를 AI로 요약하기 전, 숨은 지시를 제거하는 전처리 과정을 시연한다. */
const PageAnalyzeSchema = z.object({
  caseId: z.string().uuid(),
  traceResultId: z.string().uuid(),
  pageText: z.string().max(20000),
});

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { db, user } = auth;

  const body = await req.json();
  const parsed = TraceRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { data: owns } = await db.from('cases').select('id').eq('id', parsed.data.caseId).single();
  if (!owns) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const provider = getTraceProvider();
  const hits = await provider.findMatches(parsed.data.fingerprint);

  const rows = hits.map((h) => ({
    case_id: parsed.data.caseId,
    // 유출 게시물 URL도 서버에서만 암호화해 저장 — DB/세션이 뚫려도 즉시 노출되지 않게.
    source_url: encryptUrl(h.url),
    platform: h.platform,
    similarity_score: h.score,
    detection_type: h.type,
    simulated: true,
  }));
  const { data, error } = await db.from('trace_results').insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await audit(db, { caseId: parsed.data.caseId, actor: user.id, action: 'trace.run', target: provider.name });
  return NextResponse.json({ results: data });
}

/** 후보 게시물 페이지 텍스트를 분석하기 전, 숨은 지시(prompt injection) 제거 → AI 가드 검사 순서로 처리. */
export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { db, user } = auth;

  const body = await req.json();
  const parsed = PageAnalyzeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const stripped = stripHiddenInstructions(parsed.data.pageText);
  if (stripped.removed > 0) {
    await logSecurityEvent(db, {
      caseId: parsed.data.caseId, userId: user.id,
      eventType: 'stripped', ruleMatched: stripped.matchedRules.join(','), guardOn: true,
    });
  }
  const guard = guardCheck(stripped.clean);
  if (guard.verdict !== 'ok') {
    await logSecurityEvent(db, {
      caseId: parsed.data.caseId, userId: user.id,
      eventType: guard.verdict === 'crisis' ? 'crisis' : 'blocked', ruleMatched: guard.matchedRule, guardOn: true,
    });
  }

  // 실제 요약은 LLM 연동 시 stripped.clean만 사용한다 (원문·숨은 지시는 전달하지 않음).
  const summary = `[SIMULATED] 페이지 텍스트 ${stripped.clean.length}자 분석, 숨은 지시 ${stripped.removed}줄 제거됨.`;

  const { error } = await db
    .from('trace_results')
    .update({ page_summary: summary, page_stripped_lines: stripped.removed })
    .eq('id', parsed.data.traceResultId)
    .eq('case_id', parsed.data.caseId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ summary, strippedLines: stripped.removed, guardVerdict: guard.verdict });
}
