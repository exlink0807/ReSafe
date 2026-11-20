'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppState, defaultState } from './types';

const KEY = 'resafe_state_v2';

/**
 * 클라이언트 전역 상태 훅. HTML 데모의 S/save()/def() 패턴을 React로 포팅.
 * localStorage에 과거 버전 데이터가 있어도(필드 누락) Object.assign(default, saved)로
 * 누락 필드를 기본값으로 채워 렌더 크래시를 막는다 (Report 탭 미열림 버그의 근본 수정 사항).
 */
export function useAppState() {
  const [state, setState] = useState<AppState>(() => defaultState());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) setState(Object.assign(defaultState(), JSON.parse(saved)));
    } catch {
      setState(defaultState());
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // 저장 실패는 치명적이지 않음 (예: 용량 초과, 프라이빗 모드)
    }
  }, [state, hydrated]);

  const update = useCallback((patch: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => {
    setState((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
  }, []);

  return { state, setState, update, hydrated };
}
