'use client';

import { guardCheck, mockAiReply } from './guard';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

export interface AiReplyResponse {
  reply: string;
  verdict: string;
  source: 'rule' | 'llm' | 'mock_fallback' | 'client_fallback';
}

/**
 * 클라이언트에서 AI 응답을 요청하는 단일 진입점.
 * 서버(/api/ai/reply)가 실제 LLM 호출 + 입출력 가드를 전부 처리한다.
 * 로그인 세션이 있으면 그 액세스 토큰을 Authorization 헤더에 실어 보낸다 —
 * 이게 있어야 서버의 requireUser()를 통과해 실제 LLM이 호출된다.
 * 로그인이 안 되어 있거나(토큰 없음), 네트워크 오류, 서버 미기동 등 어떤 이유로든
 * 요청이 실패하면 데모가 끊기지 않도록 클라이언트 쪽 규칙 기반 모의 응답으로 폴백한다.
 */
export async function getAiReply(
  text: string,
  context: 'intake' | 'consult',
  aiGuard: boolean
): Promise<AiReplyResponse> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('로그인 세션이 없습니다.');

    const res = await fetch('/api/ai/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ text, context, aiGuard }),
    });
    if (!res.ok) throw new Error(`서버 응답 실패: ${res.status}`);
    const payload = await res.json();
    return { reply: payload.reply, verdict: payload.verdict, source: payload.source };
  } catch {
    // 미로그인, 네트워크 오류, 서버 미기동 등 — 클라이언트 쪽 모의 응답으로 폴백
    const result = mockAiReply(text, aiGuard);
    return { reply: result.html, verdict: result.verdict, source: 'client_fallback' };
  }
}

export { guardCheck };
