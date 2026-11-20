/**
 * 서버용 지각 해시 (sharp 사용). 기준 이미지와 후보 이미지를 같은 함수로 계산해야 비교가 공정하다.
 *  - aHash(평균 해시, 64비트): 밝기 변화·압축에 강함
 *  - dHash(차분 해시, 64비트): 크롭·리사이즈에 상대적으로 강함
 * 두 해시의 해밍 유사도를 평균 내 0~100%로 표시한다. "동일 인물일 확률"이 아니라 "같은 이미지의 변형일 가능성"이다.
 */
import sharp from 'sharp';

export interface ImageHashes { a: string; d: string }

export async function hashImage(buf: Buffer): Promise<ImageHashes> {
  const a8 = await sharp(buf, { failOn: 'none' }).rotate().resize(8, 8, { fit: 'fill' }).grayscale().raw().toBuffer();
  const mean = a8.reduce((s, v) => s + v, 0) / a8.length;
  const a = [...a8].map((v) => (v > mean ? '1' : '0')).join('');

  const d9 = await sharp(buf, { failOn: 'none' }).rotate().resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer();
  let d = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) d += d9[y * 9 + x] < d9[y * 9 + x + 1] ? '1' : '0';
  return { a, d };
}

function hamming(x: string, y: string): number {
  let n = 0;
  for (let i = 0; i < 64; i++) if (x[i] !== y[i]) n++;
  return n;
}

/** 0~100 유사도. 여러 기준 이미지(영상 장면 여러 장)가 있으면 가장 높은 값을 쓴다. */
export function similarity(refs: ImageHashes[], cand: ImageHashes): number {
  let best = 0;
  for (const r of refs) {
    const s = ((64 - hamming(r.a, cand.a)) / 64 + (64 - hamming(r.d, cand.d)) / 64) / 2;
    if (s > best) best = s;
  }
  return Math.round(best * 1000) / 10;
}
