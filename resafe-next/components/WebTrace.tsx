'use client';

import { useRef, useState } from 'react';
import { AppState, TraceCandidate } from '@/lib/types';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

type Hit = {
  id: string; platform: string; pageUrl: string; pageTitle?: string;
  matchType: 'full' | 'partial' | 'similar'; similarity: number | null; method: 'phash' | 'engine'; demo: boolean;
};

const MATCH_LABEL = { full: '완전 일치', partial: '부분 일치(크롭·편집)', similar: '유사 이미지' } as const;
const FLOOR = { full: 90, partial: 70, similar: 45 } as const;

/** 브라우저에서 이미지를 최대 1024px JPEG로 다시 그린다. 이 과정에서 EXIF(촬영 위치 등)가 지워진다. */
async function imageToJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 영상은 검색 API가 직접 받지 못하므로, 브라우저에서 장면 4장을 뽑아 이미지로 검색한다. 영상 파일 자체는 전송하지 않는다. */
async function videoToFrames(file: File, count = 4): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  try {
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('video')); });
    const frames: string[] = [];
    for (let i = 0; i < count; i++) {
      v.currentTime = (v.duration || 1) * (0.1 + (0.8 * i) / Math.max(1, count - 1));
      await new Promise<void>((res) => { v.onseeked = () => res(); });
      const scale = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
      frames.push(c.toDataURL('image/jpeg', 0.85));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 화이트햇 엔진 · 공개 웹 재유포 탐색.
 * 피해자 본인이 가진 사진·영상(받은 합성물 사본이나 원본 사진)으로 공개 웹에 퍼진 복사본을 찾는다.
 */
export default function WebTrace({ update }: { state: AppState; update: (patch: Partial<AppState> | ((p: AppState) => Partial<AppState>)) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [info, setInfo] = useState<{ provider: string; count: number; fetched: number; searched: number } | null>(null);

  async function run() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setMsg('검색할 사진이나 영상을 먼저 골라 주세요.');
    if (!consent) return setMsg('검색 전송에 동의해 주셔야 검색할 수 있어요.');
    setBusy(true);
    setMsg('');
    try {
      const isVideo = file.type.startsWith('video/');
      const images = isVideo ? await videoToFrames(file) : [await imageToJpeg(file)];
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('로그인이 필요해요.');
      const res = await fetch('/api/trace/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ consent: true, mediaType: isVideo ? 'video' : 'image', images }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || '검색에 실패했어요.');

      const at = new Date().toLocaleString();
      const rows: TraceCandidate[] = (out.hits as Hit[]).map((h) => ({
        id: h.id, platform: h.platform, url: h.pageUrl, pageTitle: h.pageTitle,
        score: h.similarity ?? FLOOR[h.matchType],
        type: MATCH_LABEL[h.matchType] + (isVideo ? ' · 영상 장면' : ''),
        at, status: 'pending', source: h.demo ? 'demo' : 'web', method: h.method,
      }));
      update((prev) => {
        const urls = new Set(rows.map((r) => r.url));
        return { traces: [...rows, ...prev.traces.filter((t) => !urls.has(t.url))] };
      });
      setInfo({ provider: out.provider, count: rows.length, fetched: out.fetched, searched: out.searchedImages });
      if (fileRef.current) fileRef.current.value = '';
      setFileName('');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '검색에 실패했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">🛰️ 화이트햇 엔진 · 공개 웹 재유포 탐색</h2>
        <span className="rounded bg-[var(--panel-2)] px-2 py-0.5 text-[10px] text-[var(--muted)]">scope: 본인 콘텐츠 · 공개 웹</span>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
        가지고 계신 사진이나 영상(받은 합성물 사본, 원본 사진)으로 공개 웹에 퍼진 복사본을 찾고, 지각 해시로 유사도를 계산해요.
        공식 이미지 검색 API만 쓰고, 비공개 채널 접근·로그인 우회·사이트 공격은 하지 않아요.
        결과는 후보일 뿐이고, 피해 여부는 직접 판정해 주세요.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-lg border border-[#262f45] px-3 py-2 text-sm hover:bg-[var(--panel-2)]">
          사진·영상 선택
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => setFileName(e.target.files?.[0]?.name || '')} />
        </label>
        <span className="text-xs text-[var(--muted)]">{fileName || '선택된 파일 없음'}</span>
        <button onClick={run} disabled={busy} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold text-white">
          {busy ? '검색 중… (최대 30초)' : '공개 웹 검색'}
        </button>
      </div>

      <label className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-[var(--muted)]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span>
          검색을 위해 고른 사진(영상은 장면 4장)을 위치 정보를 지운 뒤 RE:SAFE 서버와 Google 이미지 검색 API로 보내는 데 동의해요.
          RE:SAFE 서버에는 저장하지 않고, 검색에 쓴 뒤 바로 지워요. 본인 콘텐츠만 검색해 주세요.
        </span>
      </label>

      {msg && <p className="mt-2 text-xs" style={{ color: '#f87171' }}>{msg}</p>}
      {info && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          {info.provider === 'demo'
            ? `DEMO 모드: 검색 API 키가 없어 가상 재유포본 ${info.count}건을 만들어 비교했어요. 유사도 계산은 실제로 수행됐어요.`
            : `공개 웹에서 후보 ${info.count}건을 찾았어요 (검색한 이미지 ${info.searched}장, 직접 비교한 후보 ${info.fetched}건). 아래 추적 결과에 추가했어요.`}
        </p>
      )}
    </div>
  );
}
