'use client';

import { AppState } from '@/lib/types';

const ITEMS: { key: AppState['view']; label: string; icon: string }[] = [
  { key: 'dash', label: '대시보드', icon: '🏠' },
  { key: 'report', label: '신고·상담', icon: '📝' },
  { key: 'trace', label: '추적·삭제요청', icon: '🔍' },
  { key: 'recover', label: '회복(뉴로피드백)', icon: '🧠' },
  { key: 'prevent', label: '예방', icon: '🛡️' },
  { key: 'vault', label: '증거 보관함', icon: '🗂️' },
];

export default function Nav({ view, onChange }: { view: AppState['view']; onChange: (v: AppState['view']) => void }) {
  return (
    <nav className="card mb-6 flex gap-2 overflow-x-auto p-2 lg:mb-0 lg:flex-col lg:p-3">
      <div className="mb-2 hidden px-2 py-1 text-lg font-bold lg:block">
        <span style={{ color: 'var(--accent-2)' }}>RE:</span>SAFE
      </div>
      {ITEMS.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
            view === item.key ? 'btn-primary font-semibold text-white' : 'text-[var(--muted)] hover:bg-[var(--panel-2)]'
          }`}
        >
          <span>{item.icon}</span>
          <span className="whitespace-nowrap">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
