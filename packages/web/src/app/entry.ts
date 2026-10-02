import { detectMode } from '../p2p/role.ts';
let invitation: string | null = null;
export function takeInvitation() {
  const value = invitation;
  invitation = null;
  return value;
}
export function captureEntry() {
  const hash = location.hash;
  if (/^#\/join(?:\?|$)/.test(hash)) {
    if (new URLSearchParams(hash.split('?')[1] ?? '').has('t')) invitation = location.href;
    history.replaceState(history.state, '', location.pathname + location.search + '#/join');
  } else if (detectMode() === 'guest' && !hash.startsWith('#/dev/gallery')) {
    const ticket = hash.startsWith('#/guest#')
      ? hash.slice('#/guest#'.length)
      : hash.startsWith('#g=')
        ? hash.slice(1)
        : '';
    history.replaceState(
      history.state,
      '',
      location.pathname + location.search + '#/guest' + (ticket ? '#' + ticket : ''),
    );
  }
}

/** 캡처한 초대의 방 ID만 읽는다. 비밀 문자열은 반응형 상태에 넣지 않는다. */
export function invitationRoom(url: string | null): string | null {
  return url === null
    ? null
    : new URLSearchParams(new URL(url).hash.split('?')[1] ?? '').get('room');
}
