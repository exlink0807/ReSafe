'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

/**
 * 이메일/비밀번호 로그인 · 회원가입 페이지.
 *
 * 이 서비스는 팀 내부 도구가 아니라 불특정 다수의 피해자가 가입하는 공개 서비스이므로,
 * 가입 자체를 막는 허용목록 방식은 쓰지 않는다. 대신:
 *  - 로그인 실패 카운팅 — 로그인 시도 전 recent_failed_attempts()로 최근 15분 내 실패
 *    횟수를 확인하고, 5회 이상이면 시도 자체를 막는다(무차별 대입 공격 완화). 이건 가입을
 *    누구에게 열어두든 상관없이 유효한 방어다. 모든 시도(성공/실패)는 login_attempts에 기록된다.
 *  - 실제 운영 시 추가로 켜는 것을 권장: Supabase 대시보드 → Authentication →
 *    Providers → Email → "Confirm email"을 켜서 가짜 이메일 대량 가입(어뷰징)을 막고,
 *    Authentication → Attack Protection에서 CAPTCHA(hCaptcha)를 연결해 봇 가입을 막을 것.
 *    (해커톤 데모 중에는 Confirm email을 꺼두면 가입 즉시 로그인되어 테스트가 편합니다.)
 *
 * ⚠️ recent_failed_attempts()는 service_role이 아니라 "일반 사용자도 호출 가능한
 * SECURITY DEFINER 함수"로 구현되어 있다 — 로그 테이블 전체를 읽게 하지 않으면서
 * 필요한 횟수만 노출하기 위함이다.
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

    if (mode === 'signup') {
      const { data, error: err } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (err) { setError(err.message); return; }
      if (data.session) {
        router.push('/');
      } else {
        setInfo('가입 확인 메일을 보냈습니다. 메일함을 확인한 뒤 로그인해 주세요.');
      }
      return;
    }

    // mode === 'login'
    const { data: failCount } = await supabase.rpc('recent_failed_attempts', {
      p_email: email,
      p_window_minutes: WINDOW_MINUTES,
    });
    if (typeof failCount === 'number' && failCount >= MAX_FAILED_ATTEMPTS) {
      setLoading(false);
      setError(`로그인 시도가 너무 많습니다. ${WINDOW_MINUTES}분 후 다시 시도해 주세요.`);
      return;
    }

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    // 성공/실패 모두 기록 (브루트포스 탐지용). 실패해도 이 insert 자체는 막지 않는다.
    await supabase.from('login_attempts').insert({ email, success: !err });
    setLoading(false);
    if (err) { setError('이메일 또는 비밀번호가 올바르지 않습니다.'); return; }
    router.push('/');
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
