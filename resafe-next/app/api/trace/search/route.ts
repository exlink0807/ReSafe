import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import sharp from 'sharp';
import { requireUser, audit } from '@/lib/supabase';
import { searchWeb, PROVIDER } from '@/lib/trace/webSearch';

/**
 * 화이트햇 엔진 · 공개 웹 재유포 탐색.
 *  - 로그인한 피해자 본인만 사용 (requireUser)
 *  - 피해자의 명시적 동의(consent=true)가 있어야 실행
 *  - 기준 이미지는 서버에서 메타데이터(EXIF, 위치 정보)를 지우고 다시 인코딩한 뒤 검색에만 쓰고 저장하지 않는다
 *  - 감사 로그에는 '검색했다'는 사실과 건수만 남기고, 이미지·URL은 남기지 않는다
 */
const Body = z.object({
  consent: z.literal(true),
  mediaType: z.enum(['image', 'video']),
  images: z.array(z.string().max(3_500_000)).min(1).max(4), // base64 JPEG, 장당 약 2.5MB 이하
});

const recent = new Map<string, number[]>();
const LIMIT = 6; // 사용자당 10분에 6회 (검색 API 비용과 남용 방지)

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  const { db, user } = auth;

  const now = Date.now();
  const arr = (recent.get(user.id) || []).filter((t) => now - t < 600_000);
  if (arr.length >= LIMIT) return NextResponse.json({ error: '검색이 너무 잦아요. 10분 뒤에 다시 시도해 주세요.' }, { status: 429 });
  arr.push(now);
  recent.set(user.id, arr);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '이미지와 동의 여부를 확인해 주세요.' }, { status: 422 });

  let refs: Buffer[];
  try {
    refs = await Promise.all(parsed.data.images.map(async (b64) => {
      const raw = Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      // 이미지가 맞는지 확인하고, EXIF·위치 정보를 지운 1024px JPEG로 다시 만든다
      return sharp(raw, { failOn: 'error' }).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    }));
  } catch {
    return NextResponse.json({ error: '이미지를 읽을 수 없어요.' }, { status: 422 });
  }

  try {
    const out = await searchWeb(refs);
    await audit(db, { actor: user.id, action: 'trace.web_search', target: `${out.provider}:${parsed.data.mediaType}:${out.hits.length}` }).catch(() => {});
    return NextResponse.json({ ...out, searchedImages: refs.length, at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: PROVIDER === 'vision' ? '검색 API 호출에 실패했어요. API 키와 사용량을 확인해 주세요.' : '검색 중 오류가 났어요.' }, { status: 502 });
  }
}
