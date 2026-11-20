'use client';

import { guardCheck, mockAiReply } from './guard';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import type { ChatMessage } from '@/lib/types';

export interface AiReplyResponse {
  reply: string;
  verdict: string;
  source: 'rule' | 'llm' | 'mock_fallback' | 'client_fallback';
}

export interface AiHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * state.chat(화면에 보이는 전체 대화)을 LLM에 보낼 history 형식으로 바꾼다.
 * - 최근 N개만 보낸다 (토큰 비용·응답 지연 억제용).
 * - 혹시 남아있을 수 있는 HTML 태그를 제거하고 길이를 자른다(과거에 저장된 긴 텍스트 방어).
 * - 이 history도 서버에서 한 번 더 stripHiddenInstructions를 거친 뒤에만 실제 LLM에 전달된다
 *   (app/api/ai/reply/route.ts) — 과거 턴에 섞여 있었을 수 있는 인젝션 문구가 다시 LLM에
 *   들어가는 것을 막기 위함.
 */
export function toLlmHistory(chat: ChatMessage[], maxMessages = 8): AiHistoryItem[] {
  return chat.slice(-maxMessages).map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: m.text.replace(/<[^>]*>/g, '').slice(0, 1000),
  }));
}

/**
 * 클라이언트에서 AI 응답을 요청하는 단일 진입점.
 * 서버(/api/ai/reply)가 실제 LLM 호출 + 입출력 가드를 전부 처리한다.
 * 로그인 세션이 있으면 그 액세스 토큰을 Authorization 헤더에 실어 보낸다 —
 * 이게 있어야 서버의 requireUser()를 통과해 실제 LLM이 호출된다.
 * 로그인이 안 되어 있거나(토큰 없음), 네트워크 오류, 서버 미기동 등 어떤 이유로든
 * 요청이 실패하면 데모가 끊기지 않도록 클라이언트 쪽 규칙 기반 모의 응답으로 폴백한다.
 *
 * history를 함께 보내면 LLM이 이전 대화 맥락을 기억한 채로 답한다 — 이게 없으면 매 턴이
 * 독립된 1회성 질문·답변처럼 느껴진다(실제 "대화"가 아니라 "질문 하나당 답 하나").
 */
export async function getAiReply(
  text: string,
  context: 'intake' | 'consult',
  aiGuard: boolean,
  history: AiHistoryItem[] = []
): Promise<AiReplyResponse> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('로그인 세션이 없습니다.');

    const res = await fetch('/api/ai/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ text, context, aiGuard, history }),
    });
    if (!res.ok) throw new Error(`서버 응답 실패: ${res.status}`);
    const payload = await res.json();
    return { reply: payload.reply, verdict: payload.verdict, source: payload.source };
  } catch (err) {
    // 미로그인, 네트워크 오류, 서버 미기동 등 — 클라이언트 쪽 모의 응답으로 폴백.
    // 브라우저 개발자 도구(F12) → Console 탭에서 이 로그로 원인을 확인할 수 있다.
    console.error('[ai/client] 서버 호출 실패, 클라이언트 모의 응답으로 폴백:', err instanceof Error ? err.message : err);
    const result = mockAiReply(text, aiGuard);
    return { reply: result.html, verdict: result.verdict, source: 'client_fallback' };
  }
}

export { guardCheck };
