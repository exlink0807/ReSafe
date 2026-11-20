/**
 * 외부 이미지 안전 수집 (서버 전용).
 *
 * 검색 결과로 받은 이미지 URL을 서버가 대신 열어 지각 해시를 계산한다. 서버가 남의 URL을 대신 여는 기능은
 * 그 자체로 SSRF(서버 측 요청 위조) 공격 통로가 되므로 아래를 강제한다.
 *  - http/https, 기본 포트(80/443)만 허용
 *  - DNS로 풀린 모든 IP가 공인 IP일 때만 접속 (사설망·루프백·링크로컬·클라우드 메타데이터 차단)
 *  - 리다이렉트는 자동으로 따라가지 않고, 매 단계 위 검사를 다시 한다 (최대 3회)
 *  - 시간 제한 6초, 크기 제한 5MB, 이미지 Content-Type만 허용
 *  - 받은 이미지는 메모리에서 해시 계산 후 바로 버린다 (저장·로그 없음)
 *
 * 남은 위험: 검사와 실제 접속 사이에 DNS 응답이 바뀌는 DNS rebinding은 완전히 막지 못한다.
 * 운영 환경에서는 외부 요청 전용 프록시(egress proxy)를 두는 것을 권장한다.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 6000;

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||           // 링크로컬, 클라우드 메타데이터(169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224                               // 멀티캐스트·예약
  );
}

function ipv6Private(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === '::' || x === '::1') return true;
  if (x.startsWith('fc') || x.startsWith('fd')) return true; // 고유 로컬
  if (x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb')) return true; // 링크로컬
  const mapped = x.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  return false;
}

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v === 6) return ipv6Private(ip);
  return true;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
  if (u.username || u.password) throw new Error('credentials');
  if (u.port && u.port !== '80' && u.port !== '443') throw new Error('port');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('host');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('private-ip');
  return u;
}

/** 공개 웹 이미지를 안전하게 받아 Buffer로 반환. 실패하면 null. */
export async function safeFetchImage(raw: string): Promise<Buffer | null> {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try {
      u = await assertPublicUrl(url);
    } catch {
      return null;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(u, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'RE-SAFE-victim-support/0.1 (+self-search by content owner)', Accept: 'image/*' },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return null;
        url = new URL(loc, u).toString();
        continue;
      }
      if (!res.ok) return null;
      const type = res.headers.get('content-type') || '';
      if (!type.startsWith('image/')) return null;
      const len = Number(res.headers.get('content-length') || 0);
      if (len > MAX_BYTES) return null;
      const reader = res.body?.getReader();
      if (!reader) return null;
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) { ctrl.abort(); return null; }
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
