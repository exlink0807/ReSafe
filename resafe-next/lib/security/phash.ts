/**
 * 8x8 평균 해시(perceptual hash) — 재유포 모니터링용.
 * 암호학적 해시(SHA-256)와 달리 '비슷한 이미지'를 찾기 위한 것으로,
 * 한 비트만 달라도 완전히 달라지는 SHA-256과는 목적이 다르다.
 * 클라이언트(브라우저) 전용: Canvas API가 필요하다.
 */
export async function imageHash8(file: File): Promise<string> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, 8, 8);
  const data = ctx.getImageData(0, 0, 8, 8).data;
  const gray: number[] = [];
  for (let i = 0; i < 64; i++) {
    gray.push(0.3 * data[i * 4] + 0.59 * data[i * 4 + 1] + 0.11 * data[i * 4 + 2]);
  }
  const mean = gray.reduce((a, b) => a + b, 0) / 64;
  return gray.map((v) => (v > mean ? '1' : '0')).join('');
}

export function hammingSimilarity(a: string, b: string): { distance: number; similarityPct: number } {
  let d = 0;
  const len = Math.min(a.length, b.length, 64);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) d++;
  return { distance: d, similarityPct: +(((64 - d) / 64) * 100).toFixed(1) };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
