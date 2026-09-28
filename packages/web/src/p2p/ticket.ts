// 게스트 세션 토큰·이름은 메모리와 URL 프래그먼트에만 둔다 (spec MN-05: 게스트 origin은 세션마다 바뀌어 영속 저장을
// 전제하지 않는다). 새로고침·탭 복원·같은 주소 재방문 때 같은 토큰으로 돌아온다.

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
