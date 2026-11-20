/**
 * 압축·리사이즈에 견디는 비가시 워터마크 (DCT 도메인 QIM).
 *
 * 기존 방식(lib/security/watermark.ts)은 픽셀 최하위 비트(LSB)에 기록해서 JPEG 압축, 카카오톡 전송, 리사이즈를
 * 한 번만 거쳐도 사라졌다. 실제 유출 경로에서는 거의 쓸모가 없었다.
 *
 * 이 방식
 *  1) 이미지를 256×256 기준 해상도로 줄인 밝기(Y) 채널에서
 *  2) 8×8 블록 DCT의 중저주파 계수에 QIM(양자화 색인 변조)으로 비트를 심고
 *  3) 바뀐 양만큼만 원래 해상도로 키워서 원본에 더한다.
 *  검출할 때도 같은 256×256로 줄여서 읽으므로, 리사이즈와 JPEG 압축을 거쳐도 남는다.
 *  비트마다 수십 번 반복해서 심고 다수결로 읽어, 일부가 깨져도 복원된다. CRC로 오검출을 막는다.
 *
 * 한계: 크롭·회전·좌우 반전·화면 캡처 후 큰 편집에는 약하다. 유출자를 100% 특정하는 증거가 아니라 후보를 좁히는 보조 수단이다.
 *
 * 브라우저(Canvas)와 서버(Node, 테스트) 양쪽에서 쓰도록 RGBA 배열만 다룬다.
 */

export interface Rgba { data: Uint8ClampedArray; width: number; height: number }

const N = 256;           // 기준 해상도
const B = 8;             // DCT 블록 크기
const STEP = 28;         // QIM 양자화 간격 (클수록 강건하지만 눈에 띌 수 있음)
const SLOTS: [number, number][] = [[1, 2], [2, 1], [2, 2], [1, 3], [3, 1]]; // 블록당 사용할 계수 위치
const MAGIC = 0xa5;      // 8비트 식별자
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32자 = 5비트, 기존 코드 형식과 동일
const CODE_LEN = 16;
const PAYLOAD_BITS = 8 + CODE_LEN * 5 + 8; // magic + code + crc8 = 96

// ---------- 코드 ↔ 비트 ----------

export function generateCode(): string {
  const r = new Uint32Array(CODE_LEN);
  crypto.getRandomValues(r);
  return [...r].map((v) => CODE_ALPHABET[v % 32]).join('');
}

function crc8(bits: number[]): number {
  let c = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ?? 0);
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

function toBits(n: number, len: number): number[] {
  return Array.from({ length: len }, (_, i) => (n >> (len - 1 - i)) & 1);
}

function encodePayload(code: string): number[] {
  if (code.length !== CODE_LEN || [...code].some((ch) => !CODE_ALPHABET.includes(ch))) throw new Error('잘못된 코드 형식');
  const body = [...toBits(MAGIC, 8), ...[...code].flatMap((ch) => toBits(CODE_ALPHABET.indexOf(ch), 5))];
  return [...body, ...toBits(crc8(body), 8)];
}

function decodePayload(bits: number[]): string | null {
  const body = bits.slice(0, 8 + CODE_LEN * 5);
  const crc = bits.slice(8 + CODE_LEN * 5).reduce((a, b) => (a << 1) | b, 0);
  const magic = body.slice(0, 8).reduce((a, b) => (a << 1) | b, 0);
  if (magic !== MAGIC || crc8(body) !== crc) return null;
  let code = '';
  for (let i = 0; i < CODE_LEN; i++) code += CODE_ALPHABET[body.slice(8 + i * 5, 13 + i * 5).reduce((a, b) => (a << 1) | b, 0)];
  return code;
}

// ---------- 슬롯 배치 (고정 시드로 섞어서 비트를 이미지 전체에 흩뿌림) ----------

let SLOT_MAP: Int32Array | null = null;
function slotMap(): Int32Array {
  if (SLOT_MAP) return SLOT_MAP;
  const total = (N / B) * (N / B) * SLOTS.length;
  const idx = new Int32Array(total);
  for (let i = 0; i < total; i++) idx[i] = i;
  let s = 0x5afe5afe;
  const rand = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = total - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  // idx[k] = k번째 슬롯이 담당할 비트 번호를 정하기 위한 순서. bit = idx[k] % PAYLOAD_BITS
  SLOT_MAP = idx;
  return idx;
}

// ---------- DCT ----------

const COS = (() => {
  const t = new Float64Array(B * B);
  for (let k = 0; k < B; k++) for (let n = 0; n < B; n++) t[k * B + n] = (k === 0 ? Math.sqrt(1 / B) : Math.sqrt(2 / B)) * Math.cos(((2 * n + 1) * k * Math.PI) / (2 * B));
  return t;
})();

/** 블록 하나의 특정 계수 (u,v) 값 */
function coef(img: Float64Array, bx: number, by: number, u: number, v: number): number {
  let s = 0;
  for (let y = 0; y < B; y++) {
    const cy = COS[v * B + y];
    const row = (by * B + y) * N + bx * B;
    for (let x = 0; x < B; x++) s += img[row + x] * COS[u * B + x] * cy;
  }
  return s;
}

/** 계수 (u,v)를 d만큼 바꿀 때의 공간 영역 변화량을 delta에 더한다 */
function addBasis(delta: Float64Array, bx: number, by: number, u: number, v: number, d: number) {
  for (let y = 0; y < B; y++) {
    const cy = COS[v * B + y] * d;
    const row = (by * B + y) * N + bx * B;
    for (let x = 0; x < B; x++) delta[row + x] += COS[u * B + x] * cy;
  }
}

// ---------- 리샘플링 ----------

function luminance(img: Rgba): Float64Array {
  const y = new Float64Array(img.width * img.height);
  for (let i = 0; i < y.length; i++) y[i] = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2];
  return y;
}

/** 영역 평균으로 N×N으로 줄인다 (원본보다 작으면 최근접으로 키움) */
function toBase(y: Float64Array, w: number, h: number): Float64Array {
  const out = new Float64Array(N * N);
  for (let ty = 0; ty < N; ty++) {
    const y0 = Math.floor((ty * h) / N), y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * h) / N));
    for (let tx = 0; tx < N; tx++) {
      const x0 = Math.floor((tx * w) / N), x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * w) / N));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += y[yy * w + xx];
      out[ty * N + tx] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/** N×N 변화량을 원본 크기로 펼친다 (쌍선형 보간 — 계단 모양 경계가 생기지 않아 리사이즈 후에도 패턴이 유지된다) */
function fromBase(delta: Float64Array, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h);
  for (let yy = 0; yy < h; yy++) {
    const fy = Math.min(N - 1, Math.max(0, ((yy + 0.5) * N) / h - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(N - 1, y0 + 1), wy = fy - y0;
    for (let xx = 0; xx < w; xx++) {
      const fx = Math.min(N - 1, Math.max(0, ((xx + 0.5) * N) / w - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(N - 1, x0 + 1), wx = fx - x0;
      out[yy * w + xx] =
        (delta[y0 * N + x0] * (1 - wx) + delta[y0 * N + x1] * wx) * (1 - wy) +
        (delta[y1 * N + x0] * (1 - wx) + delta[y1 * N + x1] * wx) * wy;
    }
  }
  return out;
}

// ---------- 공개 함수 ----------

export function minSizeOk(w: number, h: number) { return w >= N && h >= N; }

/** 워터마크를 심은 새 RGBA를 반환한다 */
export function embedRobust(img: Rgba, code: string): Rgba {
  if (!minSizeOk(img.width, img.height)) throw new Error(`이미지가 너무 작아요 (최소 ${N}×${N})`);
  const bits = encodePayload(code);
  const map = slotMap();
  const out = new Uint8ClampedArray(img.data);
  // 반올림·클리핑 손실을 보정하려고 두 번 반복한다
  for (let pass = 0; pass < 3; pass++) {
    const cur: Rgba = { data: out, width: img.width, height: img.height };
    const base = toBase(luminance(cur), img.width, img.height);
    const delta = new Float64Array(N * N);
    let k = 0;
    for (let by = 0; by < N / B; by++) {
      for (let bx = 0; bx < N / B; bx++) {
        for (const [u, v] of SLOTS) {
          const b = bits[map[k++] % PAYLOAD_BITS];
          const c = coef(base, bx, by, u, v);
          const target = Math.round((c - (b * STEP) / 2) / STEP) * STEP + (b * STEP) / 2;
          addBasis(delta, bx, by, u, v, target - c);
        }
      }
    }
    const full = fromBase(delta, img.width, img.height);
    for (let i = 0; i < full.length; i++) {
      const d = full[i];
      out[i * 4] = out[i * 4] + d;
      out[i * 4 + 1] = out[i * 4 + 1] + d;
      out[i * 4 + 2] = out[i * 4 + 2] + d;
    }
  }
  return { data: out, width: img.width, height: img.height };
}

export interface DetectResult { found: boolean; code?: string; confidence: number }

/** 워터마크 코드를 읽는다. confidence는 0~1 (비트 판정이 얼마나 확실했는지) */
export function detectRobust(img: Rgba): DetectResult {
  const base = toBase(luminance(img), img.width, img.height);
  const map = slotMap();
  const votes = new Float64Array(PAYLOAD_BITS);
  let k = 0;
  for (let by = 0; by < N / B; by++) {
    for (let bx = 0; bx < N / B; bx++) {
      for (const [u, v] of SLOTS) {
        const c = coef(base, bx, by, u, v);
        const d0 = Math.abs(c - Math.round(c / STEP) * STEP);
        const d1 = Math.abs(c - (Math.round((c - STEP / 2) / STEP) * STEP + STEP / 2));
        votes[map[k++] % PAYLOAD_BITS] += (d0 - d1) / (STEP / 2); // 양수면 1
      }
    }
  }
  const reps = ((N / B) * (N / B) * SLOTS.length) / PAYLOAD_BITS;
  const bits = [...votes].map((v) => (v > 0 ? 1 : 0));
  const confidence = [...votes].reduce((s, v) => s + Math.min(1, Math.abs(v) / reps), 0) / PAYLOAD_BITS;
  const code = decodePayload(bits);
  return code ? { found: true, code, confidence } : { found: false, confidence };
}

/** 화질 손상 정도 (PSNR, dB). 40dB 이상이면 눈으로 구분하기 어렵다 */
export function psnr(a: Rgba, b: Rgba): number {
  let se = 0;
  const n = a.width * a.height * 3;
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) se += (a.data[i + c] - b.data[i + c]) ** 2;
  const mse = se / n;
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}
