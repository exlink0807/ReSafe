'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * 브라우저 전용 Supabase 클라이언트 (싱글톤).
 * 로그인 세션을 localStorage에 유지하고, 토큰 만료 시 자동 갱신한다.
 * 서버(API 라우트)에서는 이 파일을 쓰지 않는다 — 서버는 lib/supabase.ts의
 * dbFromToken()으로 "요청에 실린 사용자 토큰" 기준 클라이언트를 매번 새로 만든다.
 */
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: true, autoRefreshToken: true } }
    );
  }
  return browserClient;
}
