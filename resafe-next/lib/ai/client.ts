'use client';

import { guardCheck, mockAiReply } from './guard';

export interface AiReplyResponse {
  reply: string;
  verdict: string;
  source: 'rule' | 'llm' | 'mock_fallback' | 'client_fallback';
}

/**
 * 클라이언트에서 AI 응답을 요청하는 단일 진입점.
 * 서버(/api/ai/reply)가 실제 LLM 호출 + 입출력 가드를 전부 처리하지만,
 * 아직 로그인(Supabase Auth) 화면이 구현되어 있지 않아 인증 토큰이 없는 상태에서는
 * 서버 요청이 401로 실패한다 — 이 경우에도 데모가 끊기지 않도록 클라이언트 쪽
 * 규칙 기반 모의 응답(mockAiReply)으로 조용히 폴백한다.
 *
 * 로그인 기능이 추가되면 fetch의 Authorization 헤더에 실제 세션 토큰을 넣어야
 * 서버가 LLM을 호출하는 "진짜 대화"가 동작한다. 지금은 그 전 단계 배선만 되어 있다.
 */
export async function getAiReply(
  text: string,
  context: 'intake' | 'consult',
  aiGuard: boolean
): Promise<AiReplyResponse> {
  try {
    const res = await fetch('/api/ai/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, context, aiGuard }),
    });
    if (!res.ok) throw new Error(`서버 응답 실패: ${res.status}`);
    const data = await res.json();
    return { reply: data.reply, verdict: data.verdict, source: data.source };
  } catch {
    // 네트워크 오류, 401(미로그인), 서버 미기동 등 — 클라이언트 쪽 모의 응답으로 폴백
    const result = mockAiReply(text, aiGuard);
    return { reply: result.html, verdict: result.verdict, source: 'client_fallback' };
  }
}

export { guardCheck };
