/**
 * 공개 웹 재유포 탐색 (서버 전용) — 화이트햇 엔진의 OSINT 모듈.
 *
 * 원칙 (README "화이트 해킹 경계"와 동일)
 *  - 피해자가 직접 올린 자기 이미지만 검색한다. 다른 사람을 찾는 용도로 쓰지 않는다.
 *  - 공식 검색 API(Google Cloud Vision Web Detection)만 쓴다. 검색엔진 화면 긁기, 로그인 우회, 비공개 채널 접근은 하지 않는다.
 *  - 후보 이미지는 공개 URL만, SSRF 방어를 거쳐 받고, 해시 계산 후 즉시 버린다.
 *  - AI·알고리즘은 '후보'만 제시한다. 피해 여부 판정은 피해자가 한다.
 *
 * 공급자
 *  - vision: GOOGLE_VISION_API_KEY가 있을 때. 실제 공개 웹 검색
 *  - demo:   키가 없을 때. 검색은 시뮬레이션이지만, 업로드한 이미지를 크롭·압축·밝기 변경한 '가상 재유포본'과
 *            무관한 이미지를 만들어 유사도 계산은 실제로 수행한다 (알고리즘이 진짜 동작함을 보여주기 위함)
 */
import sharp from 'sharp';
import { hashImage, similarity, ImageHashes } from '@/lib/security/imagehash';
import { safeFetchImage } from '@/lib/security/ssrf';

export type MatchType = 'full' | 'partial' | 'similar';

export interface WebHit {
  id: string;
  platform: string;
  pageUrl: string;
  pageTitle?: string;
  matchType: MatchType;
  similarity: number | null; // 지각 해시 유사도. 이미지를 받지 못하면 null
  method: 'phash' | 'engine';
  demo: boolean;
}

export const PROVIDER = process.env.GOOGLE_VISION_API_KEY ? 'vision' : 'demo';

const MATCH_FLOOR: Record<MatchType, number> = { full: 90, partial: 70, similar: 45 };

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'unknown'; }
}

interface RawHit { imageUrl: string; pageUrl: string; pageTitle?: string; matchType: MatchType }

/** Google Cloud Vision Web Detection 호출. 기준 이미지는 이 요청에만 쓰이고 RE:SAFE 서버에는 저장하지 않는다. */
async function visionSearch(jpeg: Buffer): Promise<RawHit[]> {
  const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ image: { content: jpeg.toString('base64') }, features: [{ type: 'WEB_DETECTION', maxResults: 30 }] }],
    }),
  });
  if (!r.ok) throw new Error(`vision ${r.status}`);
  const web = (await r.json()).responses?.[0]?.webDetection || {};
  const hits: RawHit[] = [];
  const seen = new Set<string>();
  // 1) 이미지가 실린 페이지 (가장 쓸모 있음: 삭제 요청에 필요한 게시물 주소)
  for (const p of web.pagesWithMatchingImages || []) {
    const full = p.fullMatchingImages?.[0]?.url;
    const part = p.partialMatchingImages?.[0]?.url;
    const img = full || part;
    if (!img || seen.has(p.url)) continue;
    seen.add(p.url);
    hits.push({ imageUrl: img, pageUrl: p.url, pageTitle: p.pageTitle, matchType: full ? 'full' : 'partial' });
  }
  // 2) 페이지 정보 없이 이미지 주소만 있는 일치 항목
  for (const [list, type] of [[web.fullMatchingImages, 'full'], [web.partialMatchingImages, 'partial'], [web.visuallySimilarImages, 'similar']] as const) {
    for (const im of list || []) {
      if (!im.url || seen.has(im.url)) continue;
      seen.add(im.url);
      hits.push({ imageUrl: im.url, pageUrl: im.url, matchType: type });
    }
  }
  return hits;
}

/** 키 없이 돌리는 데모. 가상 재유포본을 만들어 실제 해시 유사도를 계산한다. */
async function demoCandidates(ref: Buffer): Promise<{ hit: RawHit; buf: Buffer }[]> {
  const meta = await sharp(ref).metadata();
  const w = meta.width || 512, h = meta.height || 512;
  const variants: { name: string; type: MatchType; make: () => Promise<Buffer> }[] = [
    { name: 'sharehub-demo.invalid/p/1021', type: 'full', make: () => sharp(ref).resize(Math.round(w * 0.6)).jpeg({ quality: 35 }).toBuffer() },
    { name: 'forumx-demo.invalid/t/5531', type: 'partial', make: () => sharp(ref).extract({ left: Math.round(w * 0.1), top: Math.round(h * 0.1), width: Math.round(w * 0.8), height: Math.round(h * 0.8) }).toBuffer() },
    { name: 'clipboard-demo.invalid/v/88', type: 'partial', make: () => sharp(ref).modulate({ brightness: 1.25, saturation: 0.7 }).jpeg({ quality: 60 }).toBuffer() },
    { name: 'picnest-demo.invalid/a/9', type: 'partial', make: () => sharp(ref).blur(6).toBuffer() }, // 흐림 처리본
    { name: 'chatroom-demo.invalid/m/17', type: 'similar', make: () => sharp(ref).flop().toBuffer() }, // 좌우 반전: 지각 해시가 약한 변형 (한계를 보여주는 사례)
    {
      name: 'unrelated-demo.invalid/x/3', type: 'similar',
      make: () => sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 40, g: 120, b: 200 } } })
        .composite([{ input: Buffer.from('<svg width="256" height="256"><circle cx="80" cy="170" r="60" fill="#f4d35e"/></svg>') }]).png().toBuffer(),
    },
  ];
  const out: { hit: RawHit; buf: Buffer }[] = [];
  for (const v of variants) {
    out.push({ hit: { imageUrl: '', pageUrl: `https://${v.name}`, matchType: v.type }, buf: await v.make() });
  }
  return out;
}

/**
 * refs: 피해자가 올린 기준 이미지들(JPEG). 영상은 브라우저에서 뽑은 장면 여러 장.
 * 각 기준 이미지로 검색하고, 후보를 합친 뒤 지각 해시 유사도로 정렬한다.
 */
export async function searchWeb(refs: Buffer[], maxResults = 15): Promise<{ provider: string; hits: WebHit[]; fetched: number }> {
  const refHashes: ImageHashes[] = await Promise.all(refs.map(hashImage));
  const hits: WebHit[] = [];
  let fetched = 0;

  if (PROVIDER === 'demo') {
    const cands = await demoCandidates(refs[0]);
    for (const [i, c] of cands.entries()) {
      const sim = similarity(refHashes, await hashImage(c.buf));
      hits.push({ id: `WEB-DEMO-${i + 1}`, platform: hostOf(c.hit.pageUrl), pageUrl: c.hit.pageUrl, matchType: c.hit.matchType, similarity: sim, method: 'phash', demo: true });
    }
  } else {
    const raw: RawHit[] = [];
    const seen = new Set<string>();
    for (const ref of refs) {
      for (const h of await visionSearch(ref)) {
        if (seen.has(h.pageUrl)) continue;
        seen.add(h.pageUrl);
        raw.push(h);
      }
    }
    const top = raw.slice(0, 25);
    const results = await Promise.all(top.map(async (h, i) => {
      const buf = await safeFetchImage(h.imageUrl);
      let sim: number | null = null;
      if (buf) {
        fetched++;
        try { sim = similarity(refHashes, await hashImage(buf)); } catch { sim = null; }
      }
      // buf는 이 함수가 끝나면 버려진다 (저장하지 않음)
      return {
        id: `WEB-${Date.now().toString(36)}-${i + 1}`,
        platform: hostOf(h.pageUrl), pageUrl: h.pageUrl, pageTitle: h.pageTitle?.replace(/<[^>]*>/g, '').slice(0, 120),
        matchType: h.matchType, similarity: sim, method: sim === null ? 'engine' : 'phash', demo: false,
      } as WebHit;
    }));
    hits.push(...results);
  }

  const score = (h: WebHit) => h.similarity ?? MATCH_FLOOR[h.matchType];
  hits.sort((a, b) => score(b) - score(a));
  return { provider: PROVIDER, hits: hits.slice(0, maxResults), fetched };
}
