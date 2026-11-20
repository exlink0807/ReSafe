'use client';

import { useRef, useState } from 'react';
import { AppState, WatermarkRecord } from '@/lib/types';
import { generateCode, embedRobust, detectRobust, psnr, minSizeOk, Rgba } from '@/lib/security/robustWatermark';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

const CHECKLIST = ['프로필 사진 공개 범위 확인', '얼굴 인식 차단 기술 적용', '지인에게만 공유되는 Trusted Circle 설정', '2차 유포 모니터링 등록'];
const MAX_SIDE = 2048; // 브라우저에서 처리할 최대 크기 (SNS 업로드용으로 충분)

type Output = { code: string; recipient?: string; url: string; psnr: number };
type Robust = { name: string; ok: boolean; confidence: number }[];

async function fileToRgba(file: File | Blob, maxSide = MAX_SIDE): Promise<{ img: Rgba; canvas: HTMLCanvasElement }> {
  const url = URL.createObjectURL(file);
  try {
    const el = new Image();
    el.src = url;
    await el.decode();
    const scale = Math.min(1, maxSide / Math.max(el.width, el.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(el.width * scale);
    canvas.height = Math.round(el.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { img: { data: d.data, width: d.width, height: d.height }, canvas };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rgbaToCanvas(img: Rgba): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), type, q));

async function authHeader(): Promise<Record<string, string> | null> {
  try {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : null;
  } catch {
    return null;
  }
}

export default function Prevent({ state, update }: { state: AppState; update: (patch: Partial<AppState> | ((p: AppState) => Partial<AppState>)) => void }) {
  const [date, setDate] = useState('');
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('');
  const [recipients, setRecipients] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [robust, setRobust] = useState<Robust | null>(null);
  const [verify, setVerify] = useState<{ found: boolean; code?: string; confidence: number; record?: WatermarkRecord | { destination?: string; purpose?: string; planned_date?: string }; mine: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const verifyRef = useRef<HTMLInputElement>(null);
  const lastWm = useRef<Rgba | null>(null);

  function toggle(i: number) {
    update((prev) => {
      const prev2 = [...prev.prev];
      prev2[i] = !prev2[i];
      return { prev: prev2 };
    });
  }

  /** 받는 사람마다 다른 코드를 넣은 사본을 만든다. 처리는 전부 브라우저 안에서 하고 사진은 서버로 보내지 않는다. */
  async function embed() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setMsg('이미지를 선택해 주세요.');
    setBusy(true);
    setMsg('');
    setRobust(null);
    outputs.forEach((o) => URL.revokeObjectURL(o.url));
    try {
      const { img } = await fileToRgba(file);
      if (!minSizeOk(img.width, img.height)) throw new Error('이미지가 너무 작아요. 가로·세로 256px 이상이어야 해요.');
      const names = recipients.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
      const list = names.length ? names : [undefined];
      const made: Output[] = [];
      const records: WatermarkRecord[] = [];
      const auth = await authHeader();
      for (const recipient of list) {
        const code = generateCode();
        const wm = embedRobust(img, code);
        lastWm.current = wm;
        const blob = await toBlob(rgbaToCanvas(wm), 'image/jpeg', 0.92);
        made.push({ code, recipient, url: URL.createObjectURL(blob), psnr: psnr(img, wm) });
        records.push({ id: code, date, where: destination, purpose, recipient, at: new Date().toISOString(), file: file.name, method: 'robust' });
        // 로그인했으면 서버에도 기록 (본인만 조회 가능, RLS). 실패해도 이 기기 기록은 남는다.
        if (auth) {
          fetch('/api/watermark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...auth },
            body: JSON.stringify({
              code, plannedDate: date || undefined,
              destination: [destination, recipient && `받는 사람: ${recipient}`].filter(Boolean).join(' · ') || undefined,
              purpose: purpose || undefined,
            }),
          }).catch(() => {});
        }
      }
      setOutputs(made);
      update((prev) => ({ wmRecords: [...prev.wmRecords, ...records] }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '워터마크를 넣지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  /** 방금 만든 이미지를 압축·리사이즈해 보고 워터마크가 살아남는지 브라우저에서 바로 확인한다 */
  async function robustnessTest() {
    const wm = lastWm.current;
    const code = outputs[outputs.length - 1]?.code;
    if (!wm || !code) return;
    setBusy(true);
    const base = rgbaToCanvas(wm);
    const cases: [string, number, number][] = [
      ['PNG 원본', 1, 0], ['JPEG 품질 90', 1, 0.9], ['JPEG 품질 70', 1, 0.7], ['JPEG 품질 50', 1, 0.5],
      ['메신저식 (75% 축소 + 품질 75)', 0.75, 0.75], ['절반 축소 + 품질 60', 0.5, 0.6],
    ];
    const rows: Robust = [];
    for (const [name, scale, q] of cases) {
      const c = document.createElement('canvas');
      c.width = Math.round(base.width * scale);
      c.height = Math.round(base.height * scale);
      c.getContext('2d')!.drawImage(base, 0, 0, c.width, c.height);
      const blob = q ? await toBlob(c, 'image/jpeg', q) : await toBlob(c, 'image/png');
      const { img } = await fileToRgba(blob, 99999);
      const r = detectRobust(img);
      rows.push({ name, ok: r.found && r.code === code, confidence: r.confidence });
    }
    setRobust(rows);
    setBusy(false);
  }

  /** 유출된 것으로 보이는 이미지에서 코드를 읽고, '내 기록'에서만 찾아본다 (남의 기록은 조회되지 않음) */
  async function check() {
    const file = verifyRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setVerify(null);
    try {
      const { img } = await fileToRgba(file, 4096);
      const r = detectRobust(img);
      if (!r.found) return setVerify({ found: false, confidence: r.confidence, mine: false });
      const local = state.wmRecords.find((w) => w.id === r.code);
      if (local) return setVerify({ ...r, record: local, mine: true });
      const auth = await authHeader();
      if (auth) {
        const res = await fetch('/api/watermark', { headers: auth });
        if (res.ok) {
          const { watermarks } = await res.json();
          const hit = (watermarks || []).find((w: { code: string }) => w.code === r.code);
          if (hit) return setVerify({ ...r, record: hit, mine: true });
        }
      }
      setVerify({ ...r, mine: false });
    } catch {
      setMsg('이미지를 읽지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  const rec = verify?.record as (WatermarkRecord & { destination?: string; planned_date?: string }) | undefined;

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
        <h3 className="mb-1 text-sm font-semibold">🔏 비가시 워터마크 (압축·리사이즈에 강한 방식)</h3>
        <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
          사진을 올리거나 보내기 전에, 눈에 보이지 않는 기록 번호를 심어요. 카카오톡·SNS의 압축과 리사이즈를 거쳐도 남도록
          주파수 영역(DCT)에 넣어요. <b>받는 사람</b>을 쉼표로 여러 명 적으면 사람마다 다른 번호를 넣은 사본을 따로 만들어요.
          나중에 사진이 유출되면 어느 사본에서 나갔는지 좁힐 수 있어요. 사진은 이 브라우저 안에서만 처리하고 서버로 보내지 않아요.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input type="file" accept="image/png,image/jpeg,image/webp" ref={fileRef} className="text-sm" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-[#262f45] bg-[var(--panel)] px-3 py-2 text-sm" />
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="게시·전송할 곳 (예: 인스타그램, 동아리 단톡방)" className="rounded-lg border border-[#262f45] bg-[var(--panel)] px-3 py-2 text-sm" />
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="목적 (예: 프로필 사진)" className="rounded-lg border border-[#262f45] bg-[var(--panel)] px-3 py-2 text-sm" />
          <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="받는 사람 (선택, 쉼표로 구분: 민수, 지현, 동아리)" className="rounded-lg border border-[#262f45] bg-[var(--panel)] px-3 py-2 text-sm sm:col-span-2" />
        </div>
        <button onClick={embed} disabled={busy} className="btn-primary mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white">
          {busy ? '처리 중…' : '워터마크 넣기'}
        </button>
        {msg && <p className="mt-2 text-xs" style={{ color: '#f87171' }}>{msg}</p>}

        {outputs.length > 0 && (
          <div className="mt-4 space-y-2">
            {outputs.map((o) => (
              <div key={o.code} className="flex flex-wrap items-center gap-3 rounded-lg bg-[var(--panel-2)] p-2 text-xs">
                <img src={o.url} alt="워터마크 적용본" className="h-16 rounded" />
                <div>
                  <div className="font-mono">{o.code}</div>
                  <div className="text-[var(--muted)]">{o.recipient ? `받는 사람: ${o.recipient}` : '공용'} · 화질 손상 PSNR {o.psnr.toFixed(1)}dB</div>
                </div>
                <a href={o.url} download={`resafe_${o.recipient || 'photo'}_${o.code.slice(0, 4)}.jpg`} className="underline" style={{ color: 'var(--accent)' }}>
                  다운로드
                </a>
              </div>
            ))}
            <p className="text-[11px] text-[var(--muted)]">PSNR 40dB 안팎이면 눈으로 원본과 구분하기 어려워요.</p>
            <button onClick={robustnessTest} disabled={busy} className="rounded-lg border border-[#262f45] px-3 py-1.5 text-xs hover:bg-[var(--panel-2)]">
              압축·리사이즈 견딤 시험
            </button>
            {robust && (
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {robust.map((r) => (
                    <tr key={r.name} className="border-t border-[#262f45]">
                      <td className="py-1">{r.name}</td>
                      <td style={{ color: r.ok ? 'var(--accent-2)' : '#f87171' }}>{r.ok ? '검출 성공' : '검출 실패'}</td>
                      <td className="text-[var(--muted)]">신뢰도 {(r.confidence * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="card p-5">
        <h3 className="mb-1 text-sm font-semibold">🔎 유출 이미지 워터마크 확인</h3>
        <p className="mb-3 text-xs text-[var(--muted)]">
          유출된 것으로 보이는 이미지를 올리면 숨은 번호를 읽고, <b>내 기록</b>에서만 찾아봐요. 다른 사람의 기록은 조회되지 않아요.
          크롭·회전·좌우 반전이 크게 된 이미지는 읽지 못할 수 있어요.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" accept="image/*" ref={verifyRef} className="text-sm" />
          <button onClick={check} disabled={busy} className="rounded-lg border border-[#262f45] px-3 py-2 text-sm hover:bg-[var(--panel-2)]">워터마크 확인</button>
        </div>
        {verify && (
          <div className="mt-3 rounded-lg bg-[var(--panel-2)] p-3 text-sm">
            {!verify.found && <p>워터마크를 찾지 못했어요. 워터마크가 없거나, 크롭·회전 등으로 손상됐을 수 있어요.</p>}
            {verify.found && verify.mine && rec && (
              <>
                <p className="font-semibold" style={{ color: 'var(--accent-2)' }}>내 기록과 일치해요 · {verify.code}</p>
                <ul className="mt-1 text-xs text-[var(--muted)]">
                  {'recipient' in rec && rec.recipient && <li>받는 사람: <b className="text-[var(--text)]">{rec.recipient}</b> (이 사람에게 보낸 사본에서 나왔을 가능성이 있어요)</li>}
                  <li>게시·전송한 곳: {rec.where || rec.destination || '-'}</li>
                  <li>목적: {rec.purpose || '-'}</li>
                  <li>예정일: {rec.date || rec.planned_date || '-'}</li>
                </ul>
                <p className="mt-2 text-[11px] text-[var(--muted)]">
                  이 결과는 유출 경로를 좁히는 참고 정보예요. 사본이 다시 전달됐을 수 있으니 특정인을 단정하지 말고, 증거 보관함에 저장한 뒤 수사기관·지원센터와 상의하세요.
                </p>
              </>
            )}
            {verify.found && !verify.mine && <p>워터마크 번호({verify.code})는 읽었지만 내 기록에는 없어요. 다른 기기에서 만들었거나 다른 사람이 넣은 번호일 수 있어요.</p>}
          </div>
        )}
      </div>

      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold">워터마크 등록 기록</h3>
        {state.wmRecords.length === 0 && <p className="text-sm text-[var(--muted)]">아직 등록된 기록이 없습니다.</p>}
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[var(--muted)]"><th className="py-1">코드</th><th>받는 사람</th><th>게시 예정일</th><th>곳</th></tr></thead>
          <tbody>
            {state.wmRecords.map((w) => (
              <tr key={w.id} className="border-t border-[#262f45]">
                <td className="py-1.5 font-mono text-xs">{w.id}{w.method !== 'robust' && <span className="ml-1 text-[10px] text-[var(--muted)]">(구버전)</span>}</td>
                <td>{w.recipient || '-'}</td>
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
