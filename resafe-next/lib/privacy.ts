/**
 * 개인정보/원본 보호 원칙을 코드로 강제하는 헬퍼.
 * - 얼굴 원본 이미지는 서버로 전송하지 않는다 (해시/임베딩만 전송).
 * - 텍스트 증거 원문은 "AI 요약"을 사용자가 명시적으로 누르기 전까지
 *   브라우저 메모리에만 존재하며, localStorage나 DB에 저장하지 않는다.
 */

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 서버로 보내기 전, 원문이 아닌 요약/해시만 담겼는지 확인하는 가드. */
export function assertNoRawText(payload: Record<string, unknown>, forbiddenKeys: string[]) {
  for (const key of forbiddenKeys) {
    if (key in payload) {
      throw new Error(`개인정보 보호 위반 가능성: '${key}' 필드는 서버로 전송되어서는 안 됩니다.`);
    }
  }
}

/** PII로 보일 수 있는 패턴(전화번호, 주민번호 형태)을 로그 문자열에서 마스킹한다. */
export function maskForLog(text: string): string {
  return text
    .replace(/\d{2,3}-\d{3,4}-\d{4}/g, '[전화번호 마스킹]')
    .replace(/\d{6}-\d{7}/g, '[주민번호 형태 마스킹]');
}
