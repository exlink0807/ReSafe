'use client';

import { AppState } from '@/lib/types';

export default function Dashboard({ state }: { state: AppState }) {
  const answered = state.ans.filter(Boolean).length;
  const removedCount = state.rm.filter((r) => r.status === 3).length;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="mb-1 text-lg font-bold">안녕하세요</h2>
        <p className="text-sm text-[var(--muted)]">
          신고부터 삭제요청, 회복까지 한 곳에서 진행 상황을 관리할 수 있어요. 모든 데이터는 데모(SIMULATED)이며
          실제 플랫폼 연동은 아직 없습니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="신고 진행률" value={`${answered}/12`} />
        <Metric label="추적된 게시물" value={String(state.traces.length)} />
        <Metric label="삭제 완료" value={String(removedCount)} />
        <Metric label="증거 보관" value={String(state.ev.length)} />
      </div>

      <div className="card p-5">
        <h3 className="mb-2 text-sm font-semibold">최근 추적 결과</h3>
        <ul className="divide-y divide-[#262f45] text-sm">
          {state.traces.slice(0, 5).map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2">
              <span>{t.platform}</span>
              <span className="text-[var(--muted)]">{t.score}% 유사</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4 text-center">
      <div className="text-2xl font-bold" style={{ color: 'var(--accent-2)' }}>{value}</div>
      <div className="mt-1 text-xs text-[var(--muted)]">{label}</div>
    </div>
  );
}
