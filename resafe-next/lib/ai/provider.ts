/**
 * 추적(Trace) 공급자 인터페이스.
 * 기본값은 'simulated' — 실제 플랫폼 크롤링/스크래핑은 구현하지 않는다.
 * 실제 공급자를 연결할 경우에도 반드시: (1) 플랫폼 ToS/robots.txt 준수,
 * (2) 공개 데이터만 조회, (3) 무단 접근·로그인 우회 금지 — 를 지켜야 한다.
 */

export interface TraceHit {
  platform: string;
  url: string;
  score: number;
  type: string;
}

export interface TraceProvider {
  name: string;
  findMatches(fingerprint: string): Promise<TraceHit[]>;
}

export const simulatedProvider: TraceProvider = {
  name: 'simulated',
  async findMatches(_fingerprint: string): Promise<TraceHit[]> {
    // 데모용 고정 결과. 실제 매칭 로직이 아님 — UI 흐름 시연 목적.
    return [
      { platform: 'ShareHub-DEMO', url: 'demo-sharehub.invalid/p/1021', score: 94.2, type: '합성 이미지' },
      { platform: 'ClipBoard-DEMO', url: 'demo-clipboard.invalid/v/88', score: 88.7, type: '영상' },
    ];
  },
};

export function getTraceProvider(): TraceProvider {
  const name = process.env.TRACE_PROVIDER || 'simulated';
  if (name !== 'simulated') {
    throw new Error(`TRACE_PROVIDER='${name}'는 아직 구현되지 않았습니다. 'simulated'만 지원합니다.`);
  }
  return simulatedProvider;
}
