'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

type Row = { id: string; category: string; kind: string; expect: 'block' | 'allow' | 'crisis'; v1: string; v2: string; rule?: string; v1Pass: boolean; v2Pass: boolean };
type OutRow = { id: string; category: string; expect: string; got: string; verdict: string; pass: boolean };
type Summary = {
  attacks: number; benign: number; crisis: number; outputCases: number;
  detectV1: number; detectV2: number; falsePosV1: number; falsePosV2: number; crisisV1: number; crisisV2: number; outputPass: number;
};

const LABEL: Record<string, string> = { block: '차단', allow: '통과', crisis: '위기 안내' };

/**
 * 화이트햇 엔진 · AI 레드팀 자가 점검.
 * 대상은 우리 서비스의 AI 보안 레이어뿐이다 (scope: self-test).
 */
export default function WhiteHat() {
  const [data, setData] = useState<{ results: Row[]; output: OutRow[]; summary: Summary; at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function run() {
    setBusy(true);
    setErr('');
    try {
      const { data: s } = await getSupabaseBrowserClient().auth.getSession();
      if (!s.session) throw new Error('로그인이 필요해요.');
      const r = await fetch('/api/redteam', { method: 'POST', headers: { Authorization: `Bearer ${s.session.access_token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '실패');
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실패');
    } finally {
      setBusy(false);
    }
  }

  const s = data?.summary;
  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">🛡️ 화이트햇 엔진 · AI 레드팀 자가 점검</h3>
        <span className="rounded bg-[var(--panel-2)] px-2 py-0.5 text-[10px] text-[var(--muted)]">scope: self-test</span>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
        우리 서비스의 AI에 공격 문장 15종(인젝션, 피해자 사칭, 우회 기법, 숨은 지시), 정상 상담 17종, 위기 표현 3종을 직접 넣고,
        위험한 AI 응답 6종으로 출력 가드도 점검합니다. 외부 사이트나 다른 시스템은 대상으로 삼지 않습니다.
      </p>
      <button onClick={run} disabled={busy} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold text-white">
        {busy ? '점검 중…' : '자가 점검 실행'}
      </button>
      {err && <p className="mt-2 text-xs" style={{ color: '#f87171' }}>{err}</p>}

      {s && data && (
        <>
          <div className="mb-2 mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
            <Metric label="공격 탐지" before={`${s.detectV1}/${s.attacks}`} after={`${s.detectV2}/${s.attacks}`} />
            <Metric label="정상 상담 오탐" before={`${s.falsePosV1}/${s.benign}`} after={`${s.falsePosV2}/${s.benign}`} />
            <Metric label="위기 신호 감지" before={`${s.crisisV1}/${s.crisis}`} after={`${s.crisisV2}/${s.crisis}`} />
            <Metric label="출력 가드" after={`${s.outputPass}/${s.outputCases}`} />
          </div>
          <p className="mb-2 text-[11px] text-[var(--muted)]">
            왼쪽: 자가 점검 전 규칙(v1) · 오른쪽: 현재 규칙(v2) · {new Date(data.at).toLocaleString()}.
            v2는 이 문장 세트를 보며 고쳤으므로, 처음 보는 문장으로도 따로 확인이 필요합니다.
          </p>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-[var(--muted)]"><tr><th className="py-1">ID</th><th>유형</th><th>기대</th><th>v1</th><th>v2</th></tr></thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.id} className="border-t border-[#262f45]">
                    <td className="py-1">{r.id}</td>
                    <td>{r.category}</td>
                    <td>{LABEL[r.expect]}</td>
                    <td style={{ color: r.v1Pass ? 'var(--muted)' : '#f87171' }}>{LABEL[r.v1]}</td>
                    <td style={{ color: r.v2Pass ? 'var(--accent-2)' : '#f87171' }} title={r.rule}>{LABEL[r.v2]}</td>
                  </tr>
                ))}
                {data.output.map((o) => (
                  <tr key={o.id} className="border-t border-[#262f45]">
                    <td className="py-1">{o.id}</td>
                    <td>출력 · {o.category}</td>
                    <td>{LABEL[o.expect]}</td>
                    <td className="text-[var(--muted)]">-</td>
                    <td style={{ color: o.pass ? 'var(--accent-2)' : '#f87171' }} title={o.verdict}>{LABEL[o.got]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, before, after }: { label: string; before?: string; after: string }) {
  return (
    <div className="rounded-lg bg-[var(--panel-2)] p-2">
      <div className="text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-sm">
        {before && <><span className="text-[var(--muted)]">{before}</span> → </>}
        <b style={{ color: 'var(--accent-2)' }}>{after}</b>
      </div>
    </div>
  );
}
