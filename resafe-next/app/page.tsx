'use client';

import { useAppState } from '@/lib/store';
import Nav from '@/components/Nav';
import AiSecurityCard from '@/components/AiSecurityCard';
import Dashboard from '@/components/Dashboard';
import Report from '@/components/Report';
import TraceRemove from '@/components/TraceRemove';
import Recover from '@/components/Recover';
import Prevent from '@/components/Prevent';
import Vault from '@/components/Vault';

export default function Home() {
  const { state, update, hydrated } = useAppState();

  if (!hydrated) {
    return <div className="p-8 text-center text-[var(--muted)]">불러오는 중…</div>;
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 lg:grid lg:grid-cols-[220px_1fr_260px] lg:gap-6">
      <Nav view={state.view} onChange={(view) => update({ view })} />

      <main className="min-h-[70vh]">
        {state.view === 'dash' && <Dashboard state={state} />}
        {state.view === 'report' && <Report state={state} update={update} />}
        {state.view === 'trace' && <TraceRemove state={state} update={update} />}
        {state.view === 'recover' && <Recover state={state} update={update} />}
        {state.view === 'prevent' && <Prevent state={state} update={update} />}
        {state.view === 'vault' && <Vault state={state} update={update} />}
      </main>

      <aside className="mt-6 lg:mt-0">
        <AiSecurityCard state={state} update={update} />
      </aside>

      {/* 진술서 PDF 저장용 인쇄 전용 영역 (lib/pdf/statement.ts) — 평소엔 숨겨져 있음 */}
      <div id="printDoc" />
    </div>
  );
}
