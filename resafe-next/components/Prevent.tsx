'use client';

import { useRef, useState } from 'react';
import { AppState } from '@/lib/types';
import { generateWatermarkCode, embedWatermark } from '@/lib/security/watermark';

const CHECKLIST = ['프로필 사진 공개 범위 확인', '얼굴 인식 차단 기술 적용', '지인에게만 공유되는 Trusted Circle 설정', '2차 유포 모니터링 등록'];

export default function Prevent({ state, update }: { state: AppState; update: (patch: Partial<AppState> | ((p: AppState) => Partial<AppState>)) => void }) {
  const [date, setDate] = useState('');
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function toggle(i: number) {
    update((prev) => {
      const prev2 = [...prev.prev];
      prev2[i] = !prev2[i];
      return { prev: prev2 };
    });
  }

  async function embed() {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert('이미지를 선택해 주세요.');
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = generateWatermarkCode();
    const watermarked = embedWatermark(imageData, code);
    ctx.putImageData(watermarked, 0, 0);
    setPreviewUrl(canvas.toDataURL('image/png'));

    update((prev) => ({
      wmRecords: [...prev.wmRecords, { id: code, date, where: destination, purpose, at: new Date().toISOString(), file: file.name }],
    }));
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="mb-2 text-sm font-semibold">🛡️ 예방 체크리스트</h2>
        <ul className="space-y-2 text-sm">
          {CHECKLIST.map((item, i) => (
            <li key={item} className="flex items-center gap-2">
              <input type="checkbox" checked={state.prev[i]} onChange={() => toggle(i)} className="h-4 w-4" />
              <span className={state.prev[i] ? 'text-[var(--muted)] line-through' : ''}>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-5">
        <h3 className="mb-1 text-sm font-semibold">🔏 비가시 워터마크</h3>
        <p className="mb-3 text-xs text-[var(--muted)]">
          업로드 전, 언제·어디에·어떤 목적으로 게시할지 기록을 이미지에 육안상 보이지 않게 심습니다. 지인 범죄를
          억제하고, 유출 시 후보를 좁히는 보조 수단입니다. PNG 무손실 보존 시에만 유효하며, 100% 추적을
          보장하지 않습니다.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input type="file" accept="image/png,image/jpeg" ref={fileRef} className="text-sm" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-[#262f45] bg-[var(--panel)] px-3 py-2 text-sm" placeholder="게시 예정일" />
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="게시 예정 플랫폼" className="rounded-lg border border-[#262f45] bg-[var(--panel)] px-3 py-2 text-sm" />
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="게시 목적" className="rounded-lg border border-[#262f45] bg-[var(--panel)] px-3 py-2 text-sm" />
        </div>
        <button onClick={embed} className="btn-primary mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white">
          워터마크 심기
        </button>
        {previewUrl && (
          <div className="mt-3">
            <img src={previewUrl} alt="워터마크 적용 결과" className="max-h-60 rounded-lg" />
            <a href={previewUrl} download="watermarked.png" className="mt-2 inline-block text-xs underline" style={{ color: 'var(--accent)' }}>
              다운로드
            </a>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold">워터마크 등록 기록</h3>
        {state.wmRecords.length === 0 && <p className="text-sm text-[var(--muted)]">아직 등록된 기록이 없습니다.</p>}
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[var(--muted)]"><th className="py-1">코드</th><th>게시 예정일</th><th>플랫폼</th></tr></thead>
          <tbody>
            {state.wmRecords.map((w) => (
              <tr key={w.id} className="border-t border-[#262f45]">
                <td className="py-1.5 font-mono text-xs">{w.id}</td>
                <td>{w.date || '-'}</td>
                <td>{w.where || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
