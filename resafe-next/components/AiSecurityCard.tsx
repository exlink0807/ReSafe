'use client';

import { useState } from 'react';
import { AppState } from '@/lib/types';
import { setDemoToken, hasDemoToken } from '@/lib/ai/client';

/**
 * 항상 보이는 AI 보안 현황 카드.
 * "AI도 공격받는다" 원칙의 가시화 — 가드 on/off 토글과 지금까지의 차단/제거/위기감지 건수를 보여준다.
 */
export default function AiSecurityCard({
  state,
  update,
}: {
  state: AppState;
  update: (patch: Partial<AppState>) => void;
}) {
  const [token, setToken] = useState('');
  const [applied, setApplied] = useState(hasDemoToken());
  return (
    <div className="card sticky top-6 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">🧯 AI 보안 현황</h3>
        <span className="rounded bg-[var(--panel-2)] px-2 py-0.5 text-[10px] text-[var(--muted)]">서버 판정</span>
      </div>

      <label className="mb-3 flex items-center justify-between rounded-lg bg-[var(--panel-2)] px-3 py-2 text-sm">
        <span>AI 가드 {state.aiGuard ? '켜짐' : '꺼짐 (데모용)'}</span>
        <input
          type="checkbox"
          checked={state.aiGuard}
          onChange={(e) => update({ aiGuard: e.target.checked })}
          className="h-4 w-4"
        />
      </label>

      {!state.aiGuard && (
        <div className="mb-3 rounded-lg border border-dashed border-[#262f45] p-2 text-[11px] text-[var(--muted)]">
          서버의 데모 토큰(DEMO_TOKEN)을 넣어야 실제로 꺼져요. 토큰이 없으면 서버가 가드를 켠 채로 처리해요. 토큰은 저장되지 않아요.
          <div className="mt-1 flex gap-1">
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="데모 토큰"
              className="w-full rounded border border-[#262f45] bg-[var(--panel)] px-2 py-1" />
            <button onClick={() => { setDemoToken(token); setApplied(!!token); }} className="rounded border border-[#262f45] px-2">적용</button>
          </div>
          {applied && <div className="mt-1">토큰 적용됨</div>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="차단" value={state.aiSec.blocked} />
        <Stat label="숨은 지시 제거" value={state.aiSec.stripped} />
        <Stat label="위기 감지" value={state.aiSec.crisis} />
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        가해자가 피해자의 지인이거나 같은 서비스를 쓸 수 있다는 전제로, AI(챗봇)에 들어가는 모든 입력(대화·증거·외부
        페이지)을 공격 경로로 보고 서버에서 검사합니다. 숫자는 이 기기 기준이에요.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--panel-2)] py-2">
      <div className="text-base font-bold" style={{ color: 'var(--accent-2)' }}>{value}</div>
      <div className="text-[var(--muted)]">{label}</div>
    </div>
  );
}
