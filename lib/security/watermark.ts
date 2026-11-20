/**
 * 비가시 워터마크 (steganography, LSB).
 * PNG의 블루 채널 최하위 비트에 "RSAF" + 16자 코드를 심는다.
 * 한계(사용자에게 항상 고지): 무손실 PNG에서만 보존된다.
 * JPEG 재압축, 리사이즈, 스크린샷에는 살아남지 않는다 — "100% 유출자 특정"이 아니라
 * "무손실 원본이 그대로 유출됐을 때 추적 가능"한 보조 수단이다.
 */
const MAGIC = 'RSAF';

export function generateWatermarkCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 16; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function textToBits(text: string): number[] {
  const bits: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    for (let b = 7; b >= 0; b--) bits.push((code >> b) & 1);
  }
  return bits;
}

function bitsToText(bits: number[]): string {
  let text = '';
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let code = 0;
    for (let b = 0; b < 8; b++) code = (code << 1) | bits[i + b];
    text += String.fromCharCode(code);
  }
  return text;
}

/** 캔버스 ImageData에 코드를 심어 새 ImageData를 반환한다 (블루 채널 LSB 사용). */
export function embedWatermark(imageData: ImageData, code: string): ImageData {
  const payload = MAGIC + code; // 4 + 16 = 20자 = 160비트
  const bits = textToBits(payload);
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  if (bits.length > out.width * out.height) {
    throw new Error('이미지가 너무 작아 워터마크를 심을 수 없습니다.');
  }
  for (let i = 0; i < bits.length; i++) {
    const pixelIdx = i * 4 + 2; // blue channel
    out.data[pixelIdx] = (out.data[pixelIdx] & 0xfe) | bits[i];
  }
  return out;
}

export interface WatermarkReadResult { found: boolean; code?: string }

export function readWatermark(imageData: ImageData): WatermarkReadResult {
  const bitCount = (MAGIC.length + 16) * 8;
  if (bitCount > imageData.width * imageData.height) return { found: false };
  const bits: number[] = [];
  for (let i = 0; i < bitCount; i++) {
    const pixelIdx = i * 4 + 2;
    bits.push(imageData.data[pixelIdx] & 1);
  }
  const text = bitsToText(bits);
  if (!text.startsWith(MAGIC)) return { found: false };
  return { found: true, code: text.slice(MAGIC.length) };
}
