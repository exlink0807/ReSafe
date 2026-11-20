import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, requireOwnedCase, logSecurityEvent } from '@/lib/supabase';
import { guardCheck, stripHiddenInstructions, mockAiReply } from '@/lib/ai/guard';
import { callLlm } from '@/lib/ai/llm';
import { checkOutput } from '@/lib/ai/outputGuard';

/**
 * 모든 AI 상담 응답(신고 전 상담의 "AI에게 물어보기" + 추가 상담)이 거치는 단일 진입점.
 *
 * 처리 순서 (AI 보안 레이어 설계 그대로):
 *   1) 세션/권한 확인 (requireUser) — 로그인 안 되어 있으면 즉시 거부
 *   2) caseId가 왔다면 "요청자 본인 소유"인지 서버가 검증 (requireOwnedCase) — 대화 내용이 아니라
 *      DB 조회로 결정. 이 요청 이후 어떤 단계에서도 caseId를 사용자가 말한 다른 값으로 바꿀 수 없다.
 *   3) stripHiddenInstructions — 숨은 지시 제거
 *   4) guardCheck — 위기 신호 / 인젝션 패턴 1차 필터 (규칙 기반)
 *   5) 통과한 입력만 실제 LLM 호출 (lib/ai/llm.ts), 이때 클라이언트가 보낸 history(최근 대화)도
 *      항목별로 다시 숨은 지시 제거를 거친 뒤 함께 전달해 "매 턴이 독립된 1회성 답변"이 되지 않게 한다.
 *      키가 없거나 호출 실패 시 규칙 기반 모의 응답(mockAiReply)로 폴백
 *   6) LLM 응답은 출력 가드(checkOutput)를 거친 뒤에만 사용자에게 반환
 *
 * aiGuard=false(데모용 토글)일 때는 2차 LLM 호출 자체를 건너뛰고 예전처럼 mockAiReply의
 * "유출 데모" 메시지를 그대로 보여준다 — 방어를 껐을 때 어떤 일이 벌어지는지 보여주기 위함이다.
 */
const ReplySchema = z.object({
  text: z.string().min(1).max(4000),
  context: z.enum(['intake', 'consult']),
  caseId: z.string().uuid().optional(),
  aiGuard: z.boolean().default(true),
  // 이전 대화 맥락. 클라이언트가 보내지만 신뢰하지 않고, 아래에서 항목별로 다시
  // stripHiddenInstructions를 거친 뒤에만 LLM에 전달한다(과거 턴에 섞인 인젝션 재유입 방지).
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1000) })).max(12).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { db, user } = auth;

  const body = await req.json();
  const parsed = ReplySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const { text, context, caseId, aiGuard, history } = parsed.data;

  if (caseId) {
    const owned = await requireOwnedCase(db, caseId);
    if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: 403 });
  }

  const stripped = stripHiddenInstructions(text);
  if (stripped.removed > 0) {
    await logSecurityEvent(db, { caseId, userId: user.id, eventType: 'stripped', ruleMatched: stripped.matchedRules.join(','), guardOn: aiGuard });
  }

  const guard = guardCheck(stripped.clean);

  if (guard.verdict === 'crisis') {
    await logSecurityEvent(db, { caseId, userId: user.id, eventType: 'crisis', ruleMatched: guard.matchedRule, guardOn: aiGuard });
    const fallback = mockAiReply(stripped.clean, aiGuard);
    return NextResponse.json({ reply: fallback.html, verdict: 'crisis', source: 'rule' });
  }

  if (guard.verdict === 'risk') {
    if (aiGuard) {
      await logSecurityEvent(db, { caseId, userId: user.id, eventType: 'blocked', ruleMatched: guard.matchedRule, guardOn: aiGuard });
      const fallback = mockAiReply(stripped.clean, aiGuard);
      return NextResponse.json({ reply: fallback.html, verdict: 'blocked', source: 'rule' });
    }
    // aiGuard가 꺼진 데모 상태: 공격이 "그대로 처리된 것처럼" 보여주는 시연 응답 (LLM 호출 안 함)
    await logSecurityEvent(db, { caseId, userId: user.id, eventType: 'leak_demo', ruleMatched: guard.matchedRule, guardOn: aiGuard });
    const fallback = mockAiReply(stripped.clean, aiGuard);
    return NextResponse.json({ reply: fallback.html, verdict: 'leak_demo', source: 'rule' });
  }

  // 과거 턴도 입력과 동일하게 숨은 지시 제거를 거친 뒤에만 LLM에 넘긴다 —
  // 지금 당장은 통과했지만, 저장된 과거 user 턴 안에 인젝션이 섞여 있었을 가능성까지 막는다.
  const safeHistory = (history ?? []).map((h) => ({
    role: h.role,
    content: h.role === 'user' ? stripHiddenInstructions(h.content).clean : h.content,
  }));

  // verdict === 'ok' → 정제된 텍스트만 실제 LLM에 전달
  try {
    const result = await callLlm(stripped.clean, context, safeHistory);
    const checked = checkOutput(result.text, result.canaryToken, stripped.clean);
    if (checked.verdict !== 'ok') {
      await logSecurityEvent(db, { caseId, userId: user.id, eventType: 'output_leak', ruleMatched: checked.verdict, guardOn: aiGuard });
    }
    return NextResponse.json({ reply: checked.sanitized, verdict: checked.verdict, source: 'llm' });
  } catch (err) {
    // ANTHROPIC_API_KEY 미설정 또는 호출 실패 → 규칙 기반 모의 응답으로 자연스럽게 폴백.
    // 왜 모의 응답으로 떨어졌는지 서버 터미널(npm run dev 콘솔)에서 확인할 수 있도록 로그를 남긴다.
    console.error('[ai/reply] callLlm 실패, 모의 응답으로 폴백:', err instanceof Error ? err.message : err);
    const fallback = mockAiReply(stripped.clean, aiGuard);
    return NextResponse.json({ reply: fallback.html, verdict: 'ok', source: 'mock_fallback' });
  }
}
