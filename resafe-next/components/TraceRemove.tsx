'use client';

import { AppState, REMOVAL_STATUSES } from '@/lib/types';

export default function TraceRemove({ state, update }: { state: AppState; update: (patch: Partial<AppState> | ((p: AppState) => Partial<AppState>)) => void }) {
  function requestRemoval(traceId: string, platform: string, url: string) {
    update((prev) => ({
      rm: [...prev.rm, { platform, url, status: 0, history: [`${new Date().toLocaleString()} 삭제요청 생성 (SIMULATED)`] }],
    }));
  }

  function advance(index: number) {
    update((prev) => {
      const rm = [...prev.rm];
      const r = { ...rm[index] };
      if (r.status < REMOVAL_STATUSES.length - 1) {
        r.status++;
        r.history = [...r.history, `${new Date().toLocaleString()} → ${REMOVAL_STATUSES[r.status]}`];
      }
      rm[index] = r;
      return { rm };
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">🔍 추적 결과 (SIMULATED)</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          실제 플랫폼 크롤링은 구현되어 있지 않습니다. 추적은 사용자가 업로드한 원본의 perceptual hash를
          기준으로 재유포 후보를 찾는 방식을 시연합니다 (lib/security/phash.ts).
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)]">
              <th className="py-1.5">플랫폼</th><th>유형</th><th>유사도</th><th></th>
            </tr>
          </thead>
          <tbody>
            {state.traces.map((t) => (
              <tr key={t.id} className="border-t border-[#262f45]">
                <td className="py-2">{t.platform}</td>
                <td>{t.type}</td>
                <td>{t.score}%</td>
                <td className="text-right">
                  <button onClick={() => requestRemoval(t.id, t.platform, t.url)} className="rounded-full border border-[#262f45] px-3 py-1 text-xs hover:bg-[var(--panel-2)]">
                    삭제요청
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold">삭제요청 진행 상황</h3>
        {state.rm.length === 0 && <p className="text-sm text-[var(--muted)]">아직 요청한 삭제요청이 없습니다.</p>}
        <ul className="space-y-3">
          {state.rm.map((r, i) => (
            <li key={i} className="rounded-lg bg-[var(--panel-2)] p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">{r.platform}</span>
                <span className="rounded-full bg-[var(--panel)] px-2 py-0.5 text-xs" style={{ color: 'var(--accent-2)' }}>
                  {REMOVAL_STATUSES[r.status]}
                </span>
              </div>
              <ul className="text-xs text-[var(--muted)]">
                {r.history.map((h, hi) => <li key={hi}>· {h}</li>)}
              </ul>
              <button onClick={() => advance(i)} className="mt-2 text-xs underline" style={{ color: 'var(--accent)' }}>
                다음 단계로 (데모)
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
