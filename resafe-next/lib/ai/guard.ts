/**
 * AI 입력·출력 가드 (현재는 규칙 기반 모의 구현 — SIMULATED).
 *
 * 설계 전제: 가해자가 피해자의 지인이거나 같은 서비스에 접속할 수 있다.
 * "한 번만 말한다" 원칙 때문에 한 세션에 신고·증거·삭제요청·회복 기록이 모두 모이므로,
 * AI 하나가 뚫리면 여러 민감정보가 한꺼번에 노출된다. 그래서 AI가 다루는 모든 입력
 * (대화, 증거 파일, 외부 페이지)을 공격 경로로 보고 방어한다.
 *
 * 화이트햇 엔진의 AI 레드팀 자가 점검(lib/ai/redteam.ts)으로 v1 규칙의 오탐·미탐을 찾아 v2로 고쳤다.
 * 다음 단계:
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

/** 비교 전에 우회용 변형(전각 문자, 제로폭 문자, 여러 공백)을 정리한다. */
export function normalize(text: string): string {
  return (text || '')
    .normalize('NFKC')
    .replace(/[​-‍﻿­]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const REQ = '(보여|알려|출력|조회|말해|읽어|넘겨|공개|print|show|reveal|list|dump)';

/**
 * 인젝션·탈옥·2차 가해 유도 패턴 (v2, AI 레드팀 자가 점검 결과 반영 — lib/ai/redteam.ts).
 * 단어 하나가 아니라 "지시 + 대상 + 요청 동사" 조합으로 탐지해, 피해자의 일반 문장이 막히지 않게 한다.
 * 이름(name)은 로그에 남기되 원문은 남기지 않는다.
 */
export const INJECTION_RULES: Rule[] = [
  { name: 'instruction_override_ko', pattern: /(이전|앞|위|기존|원래)\s*(의\s*)?(모든\s*)?(지시|명령|규칙|설정|프롬프트)\S*\s*.{0,12}(무시|잊어|잊고|따르지\s*마)/ },
  { name: 'instruction_override_ko2', pattern: /(지시|명령|규칙|프롬프트)\s*(는|을|를|은)?\s*(모두|전부|다)?\s*(무시하고|무시해|잊어버려|잊고)/ },
  { name: 'instruction_override_en', pattern: /\b(ignore|disregard|forget|override|bypass)\b.{0,20}\b(previous|prior|above|earlier|all|your|the)\b.{0,15}\b(instructions?|rules?|prompts?|guidelines?)\b/i },
  { name: 'system_prompt_probe', pattern: /(시스템|system|내부|숨겨진|hidden)\s*(프롬프트|prompt|지시문|메시지|instructions?)/i },
  { name: 'rules_probe', pattern: new RegExp(`(너의|네|당신의|your)\\s*(규칙|지시문|설정|원칙|rules|instructions).{0,10}${REQ}`, 'i') },
  { name: 'privilege_escalation', pattern: /(관리자|개발자|디버그|탈옥|운영자|admin|developer|debug|god|jailbreak|dan)\s*(모드|mode|권한|access)/i },
  { name: 'role_override', pattern: /(너는|넌|당신은)\s*이제|지금부터\s*(너는|넌|당신은)|\b(act as|pretend to be|you are now)\b/i },
  { name: 'roleplay_bypass', pattern: /(소설|역할극|롤플레이|시나리오|roleplay|fiction).{0,30}(실제|저장된|진짜).{0,10}(기록|상담|사례|정보)/i },
  { name: 'cross_case_lookup', pattern: new RegExp(`(다른|타|모든|전체)\\s*(사용자|피해자|이용자|사람|분)(들)?(의)?\\s*(상담|신고|기록|대화|정보|사례|진행|케이스).{0,15}${REQ}`) },
  { name: 'cross_case_lookup_proxy', pattern: new RegExp(`(친구|지인|동생|언니|누나|형|오빠)(가|이)?\\s*(여기서|이\\s*앱에서|이\\s*서비스에서).{0,25}(상담|신고|말한|접수).{0,20}${REQ}`) },
  { name: 'cross_case_lookup_en', pattern: /\b(other|another|every|all)\s+(users?'?|victims?'?|people'?s?)\b.{0,25}\b(cases?|records?|conversations?|data|reports?)\b/i },
  // 신원을 밝히며 '이전에 접수·말한 기록'을 다시 달라는 요청 (가해자가 피해자를 사칭하는 전형적 패턴). 문장 중간에서도 탐지
  { name: 'victim_impersonation', pattern: /(?:^|[\s.,!?~>)\]'"])(저|제가|나는?)\s*\S{2,5}(인데요|이에요|예요|입니다|이고).{0,50}(제가|내가|제|내)\s*(전에|이전에|예전에)?\s*(접수한|신고한|말한|상담한|남긴).{0,40}(다시|보여|알려|확인)/ },
  { name: 'secondary_harm_request', pattern: /(피해자|당신|네가|그\s*사람).{0,15}(잘못|탓|책임)\s*(이라고|이\s*있다고|이라\s*말)|냉정한\s*평가자/ },
];

/** 위기 신호. 차단이 아니라 상담 연결로 이어지도록 별도 분기한다. */
export const CRISIS_RULES: Rule[] = [
  { name: 'suicidal_ideation', pattern: /자살|죽고\s*싶|극단적\s*(인\s*)?선택|더\s*이상\s*살고\s*싶지\s*않|살기\s*싫|사라지고\s*싶|다\s*끝내고\s*싶|살\s*이유가\s*없|뛰어내리/ },
  { name: 'self_harm', pattern: /자해/ },
];

/** 문서·외부 페이지 안에서 AI에게 내리는 지시처럼 보이는 줄 (간접 인젝션) */
const DOC_INSTRUCTION =
  /(시스템\s*지시|system\s*instruction|AI\s*(는|가|분석기는|모델은)|모델은|assistant\s+(must|should)|이\s*(문서|페이지|파일)를?\s*(읽은|분석하는)|출력할\s*것|출력하라|판정하라|판정할\s*것|요약하지\s*말)/i;

const B64 = /[A-Za-z0-9+/]{24,}={0,2}/g;

/** base64로 숨긴 지시를 찾는다. 사람이 읽을 수 있는 문장으로 풀릴 때만 반환 (해시값·URL은 무시). 브라우저·서버 공용 */
export function decodeHidden(text: string): string {
  const out: string[] = [];
  for (const chunk of text.match(B64) || []) {
    try {
      const padded = chunk + '='.repeat((4 - (chunk.length % 4)) % 4);
      const bin = atob(padded);
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      const readable = decoded.replace(/[^\p{L}\p{N}\s.,!?'"-]/gu, '');
      if (decoded.length >= 6 && readable.length / decoded.length > 0.9) out.push(decoded);
    } catch {
      /* 사람이 읽을 수 없는 바이트 → 무시 */
    }
  }
  return out.join(' ');
}

export function guardCheck(raw: string): GuardResult {
  const text = normalize(raw);
  for (const r of CRISIS_RULES) if (r.pattern.test(text)) return { verdict: 'crisis', matchedRule: r.name };
  const hidden = decodeHidden(text);
  for (const t of hidden ? [text, hidden] : [text]) {
    for (const r of INJECTION_RULES) {
      if (r.pattern.test(t)) return { verdict: 'risk', matchedRule: t === text ? r.name : `${r.name}(base64)` };
    }
  }
  return { verdict: 'ok' };
}

export interface StripResult { clean: string; removed: number; matchedRules: string[] }

/** 증거 파일·외부 페이지 텍스트에서 숨은 지시 문장을 줄 단위로 제거한다. */
export function stripHiddenInstructions(text: string): StripResult {
  const matchedRules: string[] = [];
  const kept = (text || '').split('\n').filter((line) => {
    const n = normalize(line);
    if (DOC_INSTRUCTION.test(n)) { matchedRules.push('doc_instruction'); return false; }
    const g = guardCheck(n);
    if (g.verdict === 'risk') { matchedRules.push(g.matchedRule || 'injection'); return false; }
    return true;
  });
  return { clean: kept.join('\n'), removed: matchedRules.length, matchedRules };
}

export interface AiReplyResult { blocked: boolean; html: string }

const CRISIS_MESSAGE =
  '지금 많이 힘드실 것 같아요. 혼자 견디지 않으셔도 됩니다. 109(자살예방 상담전화, 24시간)로 연락해 보세요. 위험이 급하면 112·119로, 피해 영상 삭제 지원은 디지털성범죄피해자지원센터(02-735-8994)에서 도와드려요. 원하시면 상담사와 바로 이어드립니다.';
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
