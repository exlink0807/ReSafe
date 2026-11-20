'use client';

import { AppState } from '@/lib/types';

export default function Recover({ state, update }: { state: AppState; update: (patch: Partial<AppState> | ((p: AppState) => Partial<AppState>)) => void }) {
  function runSession() {
    update((prev) => ({
      eeg: [...prev.eeg, { d: new Date().toISOString().slice(0, 10), a: Math.round(40 + Math.random() * 40), t: Math.round(5 + Math.random() * 10) }],
    }));
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="mb-2 text-sm font-semibold">🧠 회복 지원 (뉴로피드백, SIMULATED)</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          실제 EEG 기기 연동은 구현되어 있지 않습니다. 세션 데이터는 데모용 난수로 생성됩니다. 실제 개발 시
          기기 SDK의 밴드파워 출력을 eeg_sessions.band_power(jsonb)에 저장하는 구조만 유지하면 됩니다.
        </p>
        <button onClick={runSession} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold text-white">
          세션 시작 (데모)
        </button>
      </div>

      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold">세션 기록</h3>
        {state.eeg.length === 0 && <p className="text-sm text-[var(--muted)]">아직 기록이 없습니다.</p>}
        <ul className="space-y-2 text-sm">
          {state.eeg.map((s, i) => (
            <li key={i} className="flex justify-between rounded-lg bg-[var(--panel-2)] px-3 py-2">
              <span>{s.d}</span>
              <span className="text-[var(--muted)]">안정도 {s.a} · {s.t}분</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-5">
        <h3 className="mb-2 text-sm font-semibold">법률·심리 상담 연계</h3>
        <ul className="space-y-1 text-sm">
          <li>· 디지털성범죄피해자지원센터 02-735-8994 (법률·삭제지원 연계)</li>
          <li>· 대한법률구조공단 132</li>
          <li>· 정신건강위기상담전화 1577-0199</li>
        </ul>
      </div>
    </div>
  );
}
