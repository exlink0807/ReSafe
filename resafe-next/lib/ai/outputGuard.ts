/**
 * 출력 가드 (Output Guard) — "AI도 공격받는다" 설계의 두 번째 축.
 * 입력 가드(guard.ts)가 "나쁜 입력이 AI에 들어가는 것"을 막는다면,
 * 이 파일은 "AI 응답이 나쁜 내용을 들고 나오는 것"을 막는다.
 *
 * 다루는 두 가지 유출 유형:
 *  1. 시스템 프롬프트 유출 — canary 토큰이 응답에 그대로 나오면, 공격자가 시스템 프롬프트를
 *     추출하는 데 성공했다는 신호로 간주한다.
 *  2. 미동의 개인정보 노출 — 다른 사용자의 식별정보로 보이는 패턴(이메일, 전화번호, 케이스 ID 형태)이
 *     "이번 대화에서 사용자 본인이 입력하지 않은 형태로" 응답에 등장하면 의심 신호로 본다.
 *     (완전히 정확한 탐지는 아니며, 과탐지가 있을 수 있다 — 보수적으로 막는 것이 목표다.)
 */

export type OutputVerdict = 'ok' | 'canary_leak' | 'possible_pii_leak' | 'secondary_harm';

export interface OutputCheckResult {
  verdict: OutputVerdict;
  sanitized: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /0\d{1,2}-?\d{3,4}-?\d{4}/;
const CASE_ID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i; // uuid 형태

/** 피해자를 탓하는 2차 가해 표현. 탈옥으로 끌어낸 응답이 그대로 나가지 않게 한다 */
const HARM_PHRASES = ['피해자 잘못', '피해자에게도 책임', '당신에게도 책임', '자업자득', '조심했어야', '보낸 게 잘못', '왜 그런 사진을'];

const SAFE_FALLBACK = '죄송해요, 지금 답변에 문제가 있어 보여 안전을 위해 다시 정리했어요. 질문을 조금 다르게 말씀해 주시겠어요?';

/**
 * @param output LLM이 생성한 원 응답
 * @param canaryToken 이번 호출에 심었던 canary 토큰
 * @param userText 이번 턴에 사용자가 직접 입력한 텍스트 (본인이 말한 정보는 오탐 방지를 위해 허용)
 */
export function checkOutput(output: string, canaryToken: string, userText: string): OutputCheckResult {
  if (output.includes(canaryToken)) {
    return { verdict: 'canary_leak', sanitized: SAFE_FALLBACK };
  }

  if (HARM_PHRASES.some((p) => output.includes(p))) {
    return { verdict: 'secondary_harm', sanitized: SAFE_FALLBACK };
  }

  const patterns = [EMAIL_RE, PHONE_RE, CASE_ID_RE];
  for (const re of patterns) {
    const match = output.match(re);
    if (match && !userText.includes(match[0])) {
      // 사용자가 이번 턴에 직접 말하지 않은 식별정보 형태가 응답에 등장 → 다른 사용자 정보일 가능성
      return { verdict: 'possible_pii_leak', sanitized: SAFE_FALLBACK };
    }
  }

  return { verdict: 'ok', sanitized: output };
}
