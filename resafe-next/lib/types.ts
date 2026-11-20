export type Verification = 'pending' | 'yes' | 'no' | 'more';

export type RemovalStatus =
  | 'prepared'
  | 'submitted'
  | 'reviewing'
  | 'removed'
  | 'rejected'
  | 'unknown';

export const REMOVAL_STATUSES: RemovalStatus[] = [
  'prepared', 'submitted', 'reviewing', 'removed', 'rejected', 'unknown',
];

export interface TraceCandidate {
  id: string;
  platform: string;
  url: string;
  score: number;
  type: string;
  at: string;
  status: Verification;
  pageSummary?: string;
  pageStrippedLines?: number;
}

export interface EvidenceItem {
  id: string;
  name: string;
  src?: string;
  sha: string;
  at: string;
  kind: 'binary' | 'text';
  summary?: string;
  strippedLines?: number;
  log: string[];
}

export interface RemovalRequest {
  platform: string;
  url: string;
  status: number; // index into REMOVAL_STATUSES
  history: string[];
}

export interface WatermarkRecord {
  id: string;
  date: string;      // 게시 예정일 (YYYY-MM-DD)
  where: string;
  purpose: string;
  at: string;         // 실제 등록 시각
  file: string;
}

export interface AiSecurityCounters {
  blocked: number;
  stripped: number;
  crisis: number;
}

export interface ChatMessage {
  role: 'ai' | 'user';
  text: string; // AI 쪽은 신뢰된 고정 문자열, user 쪽은 렌더링 전 반드시 escape
}

/** Report 탭의 12단계 질문 (경찰청 사이버범죄 신고 절차 A~F를 따름). */
export interface IntakeQuestion {
  prompt: string;
  options: string[]; // 빈 배열이면 자유 입력 전용 (스킵 버튼은 항상 노출)
}

export const SKIP_OPTIONS = ['모름', '기억나지 않음', '확인 필요', '답변하고 싶지 않음'];

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  { prompt: '어떤 피해를 겪으셨나요?', options: ['딥페이크', '불법 촬영', '비동의 유포', '유포 협박', '온라인 괴롭힘', '온라인 사기', '기타'] },
  { prompt: '피해를 처음 알게 된 시점은 언제인가요? (실제 발생 시점이 다르면 함께 적어주세요)', options: ['오늘', '최근 1주일', '1개월 이내', '기억나지 않음'] },
  { prompt: '어느 플랫폼에서 발견하셨나요? (직접 입력도 가능)', options: ['SNS', '커뮤니티', '메신저', '모름'] },
  { prompt: '가해자를 알고 계신가요?', options: ['모르는 사람', '아는 사람', '확인 필요'] },
  { prompt: '가해자와는 어떤 관계인가요? (아는 사이가 아니면 "해당 없음")', options: ['지인·친구', '가족', '전 연인', '직장 동료', '온라인에서만 아는 사이', '해당 없음'] },
  { prompt: '가해자를 특정할 수 있는 단서가 있다면 적어주세요. (계정ID, 닉네임, 전화번호 등)', options: [] },
  { prompt: '실제 촬영물인가요, 합성·편집물인가요?', options: ['실제 촬영물', '합성·편집물', '확인 필요'] },
  { prompt: '게시물 URL이나 게시한 계정명을 알고 계신가요?', options: [] },
  { prompt: '같은 콘텐츠가 다른 곳에도 올라오는 재유포 정황이 있나요?', options: ['있음', '없음', '모름'] },
  { prompt: '유포나 추가 피해에 대한 협박이 있었나요?', options: ['있음', '없음', '답변하고 싶지 않음'] },
  { prompt: '이미 경찰에 신고했거나 플랫폼에 삭제 요청을 했다면, 접수번호나 처리 결과를 적어주세요.', options: ['아직 안 함'] },
  { prompt: '원하는 지원을 알려주세요.', options: ['콘텐츠 삭제', '경찰 신고 지원', '법률 상담', '심리 상담', '재유포 모니터링'] },
  // 아래 4개는 실제 경찰 신고서 작성 시 추가로 요구되는 항목으로 보완됨 (README의 "문항 검증" 참고 —
  // 공식 체크리스트로 검증된 것은 아니며, 실제 접수 기관에 재확인을 권장함).
  { prompt: '가해자에 대해 추가로 아는 정보가 있다면 적어주세요. (이름, 연락처, SNS 계정, 생년월일 등 — 모르면 건너뛰어도 됩니다)', options: [] },
  { prompt: '이 피해로 경제적 손해(송금, 결제 등)가 있었나요? 있다면 금액과 계좌 정보를 적어주세요.', options: ['해당 없음'] },
  { prompt: '증거 자료를 어느 정도 갖고 계신가요? (스크린샷 매수, 원본 파일 보유 여부 등)', options: ['원본 파일 보유', '스크린샷만 있음', '증거 없음', '확인 필요'] },
  { prompt: '가해자에 대한 처벌을 원하시나요? (수사 과정에서 번복 가능하며, 지금 답은 참고용입니다)', options: ['처벌을 원함', '아직 결정하지 못함', '처벌을 원하지 않음'] },
];

export const INTAKE_FIELDS = [
  '피해 유형', '인지 시점', '발견 플랫폼', '가해자 인지 여부', '가해자와의 관계',
  '가해자 특정 단서', '촬영물 성격', '게시물 URL·계정명', '재유포 정황',
  '협박 여부', '기존 신고·삭제요청 이력', '희망 지원',
  '가해자 추가 정보', '경제적 피해', '증거 보유 현황', '처벌 의사',
];

export interface AppState {
  view: 'dash' | 'report' | 'trace' | 'recover' | 'prevent' | 'vault';
  chat: ChatMessage[];
  chat2: ChatMessage[];
  ans: string[];
  traces: TraceCandidate[];
  ev: EvidenceItem[];
  rm: RemovalRequest[];
  fp: string | null;            // 재유포 모니터링 기준 perceptual hash
  mon: { msg: string }[];
  eeg: { d: string; a: number; t: number }[];
  wmRecords: WatermarkRecord[];
  prev: boolean[];               // 예방 체크리스트
  circle: string[];               // Trusted Circle 초대 링크 (DEMO)
  aiGuard: boolean;
  aiSec: AiSecurityCounters;
}

export function defaultState(): AppState {
  return {
    view: 'dash',
    chat: [{ role: 'ai', text: '안녕하세요. 한 번만 말씀해 주시면 제가 정리해 둘게요. 답하기 어려운 항목은 건너뛰어도 괜찮아요.' },
           { role: 'ai', text: INTAKE_QUESTIONS[0].prompt }],
    chat2: [{ role: 'ai', text: '추가로 궁금한 점이 있으면 편하게 적어 주세요. 이 창은 의심스러운 입력을 걸러내는 보안 레이어를 시연합니다.' }],
    ans: [],
    traces: [
      ['ShareHub-DEMO', 'demo-sharehub.invalid/p/1021', 94.2, '합성 이미지'],
      ['ClipBoard-DEMO', 'demo-clipboard.invalid/v/88', 88.7, '영상'],
      ['ForumX-DEMO', 'demo-forumx.invalid/t/5531', 76.1, '합성 이미지'],
      ['PicNest-DEMO', 'demo-picnest.invalid/a/9', 63.4, '이미지'],
      ['ChatRoom-DEMO', 'demo-chatroom.invalid/m/17', 41.0, '이미지'],
    ].map(([platform, url, score, type], i) => ({
      id: `TR-${i + 1}`, platform: platform as string, url: url as string,
      score: score as number, type: type as string,
      at: `2026-11-1${i + 1} 09:30`, status: 'pending' as const,
    })),
    ev: [], rm: [], fp: null, mon: [], eeg: [], wmRecords: [],
    prev: [false, false, false, false], circle: [],
    aiGuard: true,
    aiSec: { blocked: 0, stripped: 0, crisis: 0 },
  };
}
