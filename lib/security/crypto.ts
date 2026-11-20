import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * 민감 URL(게시물 URL, 유출 콘텐츠 링크 등) 저장용 AES-256-GCM 암호화.
 *
 * 설계 목적: "로그인이 뚫렸다고 해도 사용자가 제시한 URL을 숨기도록."
 * 세션 토큰이나 DB 자체가 유출되더라도, 이 키(URL_ENCRYPTION_KEY)는 서버 환경변수에만
 * 존재하고 클라이언트에는 절대 전달되지 않으므로, 암호문만으로는 원본 URL을 복원할 수 없다.
 * ⚠️ 이것이 "해킹 불가능"을 의미하지는 않는다 — 서버 자체가 완전히 장악되면(RCE 등) 키도
 * 함께 유출될 수 있다. 이는 "여러 겹의 방어(defense in depth)" 중 하나이지 만능 해법이 아니다.
 *
 * 키 발급: 터미널에서 `openssl rand -hex 32` 실행 후 .env.local의 URL_ENCRYPTION_KEY에 붙여넣기.
 */

function getKey(): Buffer {
  const raw = process.env.URL_ENCRYPTION_KEY;
  if (!raw) throw new Error('URL_ENCRYPTION_KEY가 설정되지 않았습니다 (.env.local 확인).');
  // 64자리 hex(32바이트)를 기대하되, 길이가 다르면 scrypt로 32바이트 키를 안전하게 유도한다.
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  return scryptSync(raw, 'resafe-url-encryption-salt', 32);
}

const IV_LENGTH = 12; // GCM 권장 길이

/** 평문 URL → "iv:authTag:ciphertext" 형태의 base64 문자열 (DB에 이 문자열을 저장) */
export function encryptUrl(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

/** encryptUrl()이 만든 문자열을 다시 평문 URL로 복원 (서버에서만 호출, 결과를 그대로 클라이언트 저장소에 남기지 말 것) */
export function decryptUrl(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('암호화된 URL 형식이 올바르지 않습니다.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

/** 마이그레이션 이전 평문 데이터와의 호환을 위해, 암호화 포맷이 아니면 그대로 돌려준다 (복호화 시도 안 함). */
export function isEncryptedFormat(value: string): boolean {
  return /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(value);
}
