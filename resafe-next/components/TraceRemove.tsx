'use client';

import { AppState, REMOVAL_STATUSES, Verification } from '@/lib/types';
import WebTrace from '@/components/WebTrace';
import WhiteHat from '@/components/WhiteHat';

const VERDICT: Record<Verification, string> = { pending: '확인 대기', yes: '피해 확인', no: '관련 없음', more: '추가 확인' };

export default function TraceRemove({ state, update }: { state: AppState; update: (patch: Partial<AppState> | ((p: AppState) => Partial<AppState>)) => void }) {
  function requestRemoval(traceId: string, platform: string, url: string) {
    update((prev) => ({
      rm: [...prev.rm, { platform, url, status: 0, history: [`${new Date().toLocaleString()} 삭제요청 생성 (SIMULATED)`] }],
    }));
  }

  /** 피해 여부 판정은 알고리즘이 아니라 피해자가 한다 */
  function judge(id: string, status: Verification) {
    update((prev) => ({ traces: prev.traces.map((t) => (t.id === id ? { ...t, status } : t)) }));
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
      <WebTrace state={state} update={update} />

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">🔍 추적 결과</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          <b>웹 검색</b> 표시는 공개 웹에서 실제로 찾은 후보, <b>DEMO</b> 표시는 시뮬레이션 데이터예요. 유사도는 같은 이미지의 변형일
          가능성이지 동일 인물일 확률이 아니에요. 게시물 링크를 열면 피해 콘텐츠가 바로 보일 수 있으니 주의하세요.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)]">
                <th className="py-1.5">플랫폼</th><th>유형</th><th>유사도</th><th>판정</th><th></th>
              </tr>
            </thead>
            <tbody>
              {state.traces.map((t) => (
                <tr key={t.id} className="border-t border-[#262f45] align-top">
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      {t.platform}
                      <span className="rounded bg-[var(--panel-2)] px-1.5 text-[10px]" style={{ color: t.source === 'web' ? 'var(--accent-2)' : 'var(--muted)' }}>
                        {t.source === 'web' ? '웹 검색' : 'DEMO'}
                      </span>
                    </div>
                    {t.source === 'web' && (
                      <a href={t.url} target="_blank" rel="noopener noreferrer nofollow" className="block max-w-[220px] truncate text-[11px] underline text-[var(--muted)]">
                        {t.pageTitle || t.url}
                      </a>
                    )}
                  </td>
                  <td className="py-2">{t.type}</td>
                  <td className="py-2">
                    {t.score}%
                    {t.method && <div className="text-[10px] text-[var(--muted)]">{t.method === 'phash' ? '지각 해시 비교' : '검색엔진 판정 기준 추정'}</div>}
                  </td>
                  <td className="py-2">
                    <div className="mb-1 text-xs" style={{ color: t.status === 'yes' ? 'var(--accent-2)' : 'var(--muted)' }}>{VERDICT[t.status]}</div>
                    <div className="flex gap-1">
                      <button onClick={() => judge(t.id, 'yes')} className="rounded-full border border-[#262f45] px-2 py-0.5 text-[11px] hover:bg-[var(--panel-2)]">피해 확인</button>
                      <button onClick={() => judge(t.id, 'no')} className="rounded-full border border-[#262f45] px-2 py-0.5 text-[11px] hover:bg-[var(--panel-2)]">무관</button>
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      disabled={t.status !== 'yes'}
                      title={t.status !== 'yes' ? '피해 확인 후 요청할 수 있어요' : ''}
                      onClick={() => requestRemoval(t.id, t.platform, t.url)}
                      className="rounded-full border border-[#262f45] px-3 py-1 text-xs hover:bg-[var(--panel-2)] disabled:opacity-40"
                    >
                      삭제요청
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

      <WhiteHat />
    </div>
  );
}
