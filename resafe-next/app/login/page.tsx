'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

/**
 * 이메일/비밀번호 로그인 · 회원가입 페이지.
 *
 * Supabase 기본 설정은 회원가입 시 "이메일 확인" 메일을 보내고, 확인 전까지는
 * 로그인이 막힙니다. 해커톤 데모 중 메일 확인 단계가 번거로우면 Supabase 대시보드
 * → Authentication → Providers → Email → "Confirm email"을 꺼두면 가입 즉시 로그인됩니다
 * (실제 서비스로 갈 땐 다시 켜는 것을 권장합니다).
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setInfo(null);
    if (!email.trim() || !password.trim()) {
      setError('이메일과 비밀번호를 모두 입력해 주세요.');
      return;
    }
    setLoading(true);
    const supabase = getSupabaseBrowserClient();

    if (mode === 'login') {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (err) { setError(err.message); return; }
      router.push('/');
      return;
    }

    const { data, error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    if (data.session) {
      router.push('/'); // "Confirm email" 꺼져 있으면 가입 즉시 세션이 생김
    } else {
      setInfo('가입 확인 메일을 보냈습니다. 메일함을 확인한 뒤 로그인해 주세요.');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-lg font-bold">
          <span style={{ color: 'var(--accent-2)' }}>RE:</span>SAFE
        </h1>
        <p className="mb-5 text-sm text-[var(--muted)]">
          {mode === 'login' ? '로그인하고 상담·신고 내역을 이어서 진행하세요.' : '계정을 만들면 AI 상담 기능을 쓸 수 있어요.'}
        </p>

        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            className="w-full rounded-lg border border-[#262f45] bg-[var(--panel-2)] px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="비밀번호 (6자 이상)"
            className="w-full rounded-lg border border-[#262f45] bg-[var(--panel-2)] px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
        {info && <p className="mt-3 text-xs text-[var(--muted)]">{info}</p>}

        <button onClick={submit} disabled={loading} className="btn-primary mt-4 w-full rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
        </button>

        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setInfo(null); }}
          className="mt-3 w-full text-center text-xs text-[var(--muted)] underline"
        >
          {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
        </button>
      </div>
    </div>
  );
}
