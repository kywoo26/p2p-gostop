// 게스트 세션 토큰·이름은 메모리와 URL 프래그먼트에만 둔다 (spec MN-05: 게스트 origin은 세션마다 바뀌어 영속 저장을
// 전제하지 않는다). 새로고침·탭 복원·같은 주소 재방문 때 같은 토큰으로 돌아온다.
import type { GuestSessionState } from '@p2p-gostop/protocol';

/** URL 프래그먼트의 토큰·이름 (#g=<token>&n=<name>) */
export interface GuestTicket {
  readonly token: string | null;
  readonly name: string | null;
}

export function readTicket(hash: string = location.hash): GuestTicket {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('g');
  const name = params.get('n');
  return {
    token: token !== null && /^[0-9a-f]{16,128}$/.test(token) ? token : null,
    name: name !== null && name.trim() !== '' ? name.slice(0, 12) : null,
  };
}

export function writeTicket(ticket: GuestTicket): void {
  const params = new URLSearchParams();
  if (ticket.token !== null) params.set('g', ticket.token);
  if (ticket.name !== null) params.set('n', ticket.name);
  const hash = params.toString();
  try {
    history.replaceState(
      history.state,
      '',
      `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`,
    );
  } catch {
    // 일부 환경은 replaceState를 막는다: 메모리에만 둔다
  }
}

const GUEST_STATE_KEY = 'gostop.guest.v2';

function tabStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** 새로고침 뒤 검증을 이어 가도록 GuestSession.toJSON()을 탭 수명 저장소에 둔다 (docs/protocol.md 6장) */
export function saveGuestState(name: string, state: GuestSessionState | null): void {
  const storage = tabStorage();
  try {
    if (state === null) storage?.removeItem(GUEST_STATE_KEY);
    else storage?.setItem(GUEST_STATE_KEY, JSON.stringify({ name, state }));
  } catch {
    // 용량 초과·차단: 그 판은 '검증 불가'로 표시된다
  }
}

export function loadGuestState(name: string): GuestSessionState | null {
  try {
    const raw = tabStorage()?.getItem(GUEST_STATE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { name?: unknown; state?: GuestSessionState };
    return value.name === name && value.state?.v === 1 ? value.state : null;
  } catch {
    return null;
  }
}
