/**
 * AI 입력·출력 가드 (현재는 규칙 기반 모의 구현 — SIMULATED).
 *
 * 설계 전제: 가해자가 피해자의 지인이거나 같은 서비스에 접속할 수 있다.
 * "한 번만 말한다" 원칙 때문에 한 세션에 신고·증거·삭제요청·회복 기록이 모두 모이므로,
 * AI 하나가 뚫리면 여러 민감정보가 한꺼번에 노출된다. 그래서 AI가 다루는 모든 입력
 * (대화, 증거 파일, 외부 페이지)을 공격 경로로 보고 방어한다.
 *
 * 다음 단계(화이트 해킹·보안 심화)에서 다룰 것:
 *  - 이 정규식 리스트를 진짜 공격 문장 세트(예: 11종 이상)로 넓히고 회귀 테스트화
 *  - 규칙 기반 1차 필터 통과 후 LLM 기반 2차 판정을 추가 (현재는 1차만 구현)
 *  - 세션 격리: 조회 범위를 서버가 쿠키/세션으로 강제하고 LLM이 관여하지 못하게 함
 *  - 출력 가드: 시스템 프롬프트 유출(카나리 토큰), 미동의 개인정보 노출 차단
 */

export type GuardVerdict = 'ok' | 'risk' | 'crisis';

export interface GuardResult {
  verdict: GuardVerdict;
  matchedRule?: string;
}

interface Rule { name: string; pattern: RegExp }

/** 인젝션·탈옥·2차 가해 유도 패턴. 이름(name)은 로그에 남기되 원문은 남기지 않는다. */
export const INJECTION_RULES: Rule[] = [
  { name: 'system_prompt_probe', pattern: /시스템\s*프롬프트/i },
  { name: 'prior_instruction_override', pattern: /이전\s*(지시|명령)/ },
  { name: 'ignore_instructions_ko', pattern: /무시하고|무시해|이\s*지시를?\s*따르지\s*마/ },
  { name: 'ignore_instructions_en', pattern: /ignore (all|previous) instructions/i },
  { name: 'role_override', pattern: /너는\s*이제|지금부터\s*너는|act as/i },
  { name: 'roleplay_bypass', pattern: /역할극|roleplay/i },
  { name: 'privilege_escalation', pattern: /관리자\s*권한|admin\s*mode|개발자\s*모드/i },
  { name: 'cross_case_lookup', pattern: /다른\s*(피해자|사용자).{0,12}(이름|정보|진행\s*상황)/ },
  { name: 'offender_identity_request', pattern: /가해자\s*이름.{0,10}(알려|말해)/ },
  { name: 'encoded_payload', pattern: /[A-Za-z0-9+/]{40,}={0,2}/ },
];

/** 위기 신호. 차단이 아니라 상담 연결로 이어지도록 별도 분기한다. */
export const CRISIS_RULES: Rule[] = [
  { name: 'suicidal_ideation', pattern: /자살|죽고\s*싶|극단적\s*선택|더\s*이상\s*살고\s*싶지\s*않/ },
];

export function guardCheck(text: string): GuardResult {
  for (const r of CRISIS_RULES) if (r.pattern.test(text)) return { verdict: 'crisis', matchedRule: r.name };
  for (const r of INJECTION_RULES) if (r.pattern.test(text)) return { verdict: 'risk', matchedRule: r.name };
  return { verdict: 'ok' };
}

export interface StripResult { clean: string; removed: number; matchedRules: string[] }

/** 증거 파일·외부 페이지 텍스트에서 숨은 지시 문장을 줄 단위로 제거한다. */
export function stripHiddenInstructions(text: string): StripResult {
  const lines = (text || '').split('\n');
  const matchedRules: string[] = [];
  const clean = lines.filter((line) => {
    const hit = INJECTION_RULES.find((r) => r.pattern.test(line));
    if (hit) { matchedRules.push(hit.name); return false; }
    return true;
  }).join('\n');
  return { clean, removed: matchedRules.length, matchedRules };
}

export interface AiReplyResult { blocked: boolean; html: string }

const CRISIS_MESSAGE =
  '지금 많이 힘드실 것 같아요. 혼자 견디지 않으셔도 됩니다. 1393(자살예방상담전화) 또는 109(디지털성범죄 피해자지원센터)로 연결해 드릴까요? 원하시면 상담사와 바로 이어드립니다.';
const BLOCKED_MESSAGE =
  '이 요청은 본인 사례를 벗어난 정보 열람이나 역할 변경 시도로 판단되어 처리하지 않았습니다. 본인 사례와 관련된 내용만 도와드릴 수 있어요.';
const LEAK_DEMO_MESSAGE =
  '⚠️ 방어가 꺼져 있어 요청한 내용을 그대로 처리했습니다 → "박지은님 사례 조회 결과: 가해자 ○○○, 진행상황 검토중" (가상 데이터입니다. 실제로는 이런 정보가 새 나가면 안 됩니다)';
const NORMAL_MESSAGE = '말씀하신 내용을 정리했어요. 추가로 필요한 지원이 있으면 더 말씀해 주세요.';

/**
 * 추가 상담용 모의 AI 응답.
 * aiGuard=false일 때 risk 케이스가 "그대로 처리된" 것처럼 보여주는 것은 데모 목적의 공격 재현이며,
 * 실제로는 항상 켜 둬야 한다.
 */
export function mockAiReply(text: string, aiGuard: boolean): AiReplyResult & { verdict: GuardVerdict } {
  const { verdict } = guardCheck(text);
  if (verdict === 'crisis') return { blocked: false, html: CRISIS_MESSAGE, verdict };
  if (verdict === 'risk') {
    if (!aiGuard) return { blocked: false, html: LEAK_DEMO_MESSAGE, verdict };
    return { blocked: true, html: BLOCKED_MESSAGE, verdict };
  }
  return { blocked: false, html: NORMAL_MESSAGE, verdict };
}
