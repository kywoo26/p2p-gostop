// 세션이 쓰는 전송 (NP-01·NP-05, NF-04·NF-05): src/net WsTransport(v2)의 연결 사건을 화면 상태로 줄인다.
// 재접속·하트비트·4001 교체 멈춤·중계 알림 거르기는 WsTransport가 한다(docs/protocol.md 2장).
import type { RelayPeerState, Role } from '@p2p-gostop/protocol';
import { WsTransport, type ConnectionEvent } from '../net/index.ts';
import { relayAddress, type RelayAddress } from './role.ts';

export type RelayPeer = RelayPeerState;
/** 화면에 보이는 연결 상태. replaced: 다른 창·기기가 같은 역할로 붙어 이 연결을 멈췄다(4001) */
export type LinkState = 'connecting' | 'open' | 'closed' | 'replaced' | 'stopped';

/** 연결 사건 → 화면 상태 (바뀌지 않으면 null) */
export function linkStateOf(event: ConnectionEvent): LinkState | null {
  switch (event.type) {
    case 'connecting':
    case 'pongTimeout':
      return 'connecting';
    case 'open':
      return 'open';
    case 'close':
      return event.retryInMs === null ? null : 'closed';
    case 'stopped':
      return event.reason === 'replaced' ? 'replaced' : 'stopped';
    default:
      return null;
  }
}

export interface LinkOptions {
  readonly role: Role;
  readonly address?: RelayAddress;
  readonly log?: (line: string) => void;
  readonly onState?: (state: LinkState) => void;
}

/** 역할별 WebSocket 전송을 연다 (중계 주소는 페이지 주소, 개발은 ?relay=) */
export function openLink(options: LinkOptions): WsTransport {
  const address = options.address ?? relayAddress();
  const transport = new WsTransport({
    role: options.role,
    host: address.host,
    port: address.port,
    log: options.log ?? (() => {}),
  });
  const onState = options.onState;
  if (onState) {
    transport.onConnection((event) => {
      const state = linkStateOf(event);
      if (state !== null) onState(state);
    });
  }
  return transport;
}
