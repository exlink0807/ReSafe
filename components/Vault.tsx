'use client';

import { useRef } from 'react';
import { AppState } from '@/lib/types';
import { sha256Hex } from '@/lib/security/phash';
import { stripHiddenInstructions } from '@/lib/ai/guard';

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export default function Vault({ state, update }: { state: AppState; update: (patch: Partial<AppState> | ((p: AppState) => Partial<AppState>)) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function addBinary() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const hash = await sha256Hex(buf);
    update((prev) => ({
      ev: [...prev.ev, {
        id: `EV-${Date.now()}`, name: file.name, sha: hash, at: new Date().toLocaleString(),
        kind: 'binary' as const, log: ['업로드됨 (원본은 서버로 전송하지 않음, 해시만 전송)'],
      }],
    }));
  }

  function addText(raw: string) {
    if (!raw.trim()) return;
    // 원문은 상태(브라우저 메모리)에만 보관하고, "AI 요약"을 눌러야 요약만 생성됨 (DB/localStorage에 원문 저장 안 함).
    update((prev) => ({
      ev: [...prev.ev, {
        id: `EV-${Date.now()}`, name: '텍스트 증거', sha: '', at: new Date().toLocaleString(),
        kind: 'text' as const, summary: undefined, log: ['텍스트 입력됨 (원문은 로컬에만, AI 요약 전까지 저장되지 않음)'],
      }],
    }));
  }

  function summarize(id: string, raw: string) {
    const stripped = stripHiddenInstructions(raw);
    update((prev) => ({
      ev: prev.ev.map((e) => e.id === id
        ? { ...e, summary: `[SIMULATED 요약] ${stripped.clean.slice(0, 200)}`, strippedLines: stripped.removed, log: [...e.log, `AI 요약 생성 (숨은 지시 ${stripped.removed}줄 제거)`] }
        : e),
    }));
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="mb-2 text-sm font-semibold">🗂️ 증거 보관함</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          이미지·영상 원본은 브라우저에서 SHA-256 해시만 계산해 전송합니다. 텍스트 증거의 원문은 "AI 요약"을
          누르기 전까지 저장되지 않습니다 (판단은 항상 피해자 본인의 것).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" ref={fileRef} className="text-sm" />
          <button onClick={addBinary} className="rounded-lg border border-[#262f45] px-3 py-2 text-sm hover:bg-[var(--panel-2)]">파일 증거 추가</button>
          <TextAdder onAdd={addText} />
        </div>
      </div>

      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold">보관된 증거</h3>
        {state.ev.length === 0 && <p className="text-sm text-[var(--muted)]">아직 증거가 없습니다.</p>}
        <ul className="space-y-2 text-sm">
          {state.ev.map((e) => (
            <li key={e.id} className="rounded-lg bg-[var(--panel-2)] p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{esc(e.name)}</span>
                <span className="text-xs text-[var(--muted)]">{e.at}</span>
              </div>
              {e.sha && <div className="mt-1 font-mono text-[11px] text-[var(--muted)]">{e.sha.slice(0, 16)}…</div>}
              {e.kind === 'text' && !e.summary && (
                <button onClick={() => summarize(e.id, '(데모용 원문 — 실제로는 입력창의 원문을 전달)')} className="mt-2 text-xs underline" style={{ color: 'var(--accent)' }}>
                  AI 요약
                </button>
              )}
              {e.summary && <p className="mt-2 text-xs text-[var(--muted)]">{esc(e.summary)}</p>}
              <ul className="mt-2 text-[11px] text-[var(--muted)]">
                {e.log.map((l, i) => <li key={i}>· {esc(l)}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TextAdder({ onAdd }: { onAdd: (text: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex gap-2">
      <input ref={ref} placeholder="텍스트 증거(대화 캡처 내용 등) 입력" className="w-64 rounded-lg border border-[#262f45] bg-[var(--panel)] px-3 py-2 text-sm" />
      <button onClick={() => { if (ref.current) { onAdd(ref.current.value); ref.current.value = ''; } }} className="rounded-lg border border-[#262f45] px-3 py-2 text-sm hover:bg-[var(--panel-2)]">
        텍스트 증거 추가
      </button>
    </div>
  );
}
