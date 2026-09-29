import { describe, expect, it, vi } from 'vitest';
import { PRESETS } from '@p2p-gostop/engine';
import { WsTransport } from '../net/index.ts';
import { GuestGame } from './guest.svelte.ts';
import { HostGame } from './host.svelte.ts';
import { createRemoteGuest, readRemoteInviteLink } from './remote.ts';

const room = 'A'.repeat(22);
const token = 'B'.repeat(43);

class FakeSocket extends EventTarget {
  readyState = 0;
  readonly sent: string[] = [];
  send(value: string): void {
    this.sent.push(value);
  }
  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  receive(value: string): void {
    this.dispatchEvent(new MessageEvent('message', { data: value }));
  }
  close(code = 1000): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent('close', { code }));
  }
}

describe('RP-04B 초대와 참여 경계', () => {
  it('NP-RP-03: 현재 주소의 초대 비밀을 읽고 fragment를 바로 지운다', () => {
    const href = `https://relay.example.test/r/v1/${'a'.repeat(64)}/#/join?room=${room}&t=${token}`;
    let replacement = '';
    const result = readRemoteInviteLink(
      href,
      { href, pathname: `/r/v1/${'a'.repeat(64)}/`, search: '' },
      {
        state: null,
        replaceState: (_state, _unused, url) => {
          replacement = String(url);
        },
      },
    );
    expect(result).toEqual({ origin: 'https://relay.example.test', roomId: room, token });
    expect(replacement).toBe(`/r/v1/${'a'.repeat(64)}/`);
    expect(replacement).not.toContain(token);
  });

  it('NP-RP-03: 비밀이 query에 있거나 잘못된 fragment면 참여하지 않는다', () => {
    expect(readRemoteInviteLink(`https://relay.example.test/?room=${room}&t=${token}`)).toBeNull();
    expect(
      readRemoteInviteLink(`http://relay.example.test/#/join?room=${room}&t=${token}`),
    ).toBeNull();
    expect(
      readRemoteInviteLink(`https://relay.example.test/#/join?room=${room}&t=short`),
    ).toBeNull();
  });

  it('NP-RP-04: 잘못된 코드와 신뢰하지 않은 origin은 소켓을 열지 않는다', async () => {
    let sockets = 0;
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const guest = createRemoteGuest({
      allowedOrigin: 'https://relay.example.test',
      storage,
      socketFactory: () => {
        sockets++;
        throw new Error('unexpected socket');
      },
      onTransport: () => {},
    });
    expect(await guest.joinByCode('https://other.example.test', 'ABCD-EFGH-JKLM', '친구')).toEqual({
      ok: false,
      code: 'invalid',
    });
    expect(await guest.joinByCode('https://relay.example.test', 'invalid', '친구')).toEqual({
      ok: false,
      code: 'invalid',
    });
    expect(sockets).toBe(0);
    expect(guest.snapshot.error).toBe('invalid');
  });

  it('NP-RP-04: 코드 참여 닉네임을 /join의 name query에 인코딩한다', async () => {
    let joinUrl = '';
    const guest = createRemoteGuest({
      allowedOrigin: 'https://relay.example.test',
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      socketFactory: (url) => {
        joinUrl = url;
        return new FakeSocket() as unknown as WebSocket;
      },
      onTransport: () => {},
    });
    const joining = guest.joinByCode('https://relay.example.test', 'ABCD-EFGH-JKLM', ' 친구 이름 ');
    expect(new URL(joinUrl).pathname).toBe('/join');
    expect(new URL(joinUrl).searchParams.get('code')).toBe('ABCDEFGHJKLM');
    expect(new URL(joinUrl).searchParams.get('name')).toBe('친구 이름');
    guest.leave();
    expect(await joining).toEqual({ ok: false, code: 'denied' });
  });

  it('NP-RP-06: 만료된 방별 복귀 토큰은 삭제하고 인증 소켓을 열지 않는다', async () => {
    const values = new Map<string, string>([
      ['p2p-gostop.remote-guest-active.v1', JSON.stringify(room)],
      [
        `p2p-gostop.remote-guest.v1.${room}`,
        JSON.stringify({
          origin: 'https://relay.example.test',
          roomId: room,
          token,
          nickname: '친구',
          expiresAt: 999,
        }),
      ],
    ]);
    const guest = createRemoteGuest({
      allowedOrigin: 'https://relay.example.test',
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
        },
        removeItem: (key) => {
          values.delete(key);
        },
      },
      now: () => 1_000,
      socketFactory: () => {
        throw new Error('unexpected socket');
      },
      onTransport: () => {},
    });
    expect(await guest.resume()).toEqual({ ok: false, code: 'expired' });
    expect(values.size).toBe(0);
  });

  it('FR-RP-04: 주입한 원격 transport의 인증·4001 상태가 HostGame과 GuestGame에 반영된다', () => {
    const hostSocket = new FakeSocket();
    const hostWire = new WsTransport({
      role: 'host',
      url: 'wss://relay.example.test/ws?role=host',
      authToken: token,
      socketFactory: () => hostSocket as unknown as WebSocket,
    });
    const host = new HostGame({
      config: {
        preset: 'standard',
        rules: PRESETS.standard,
        perPoint: 100,
        startBalance: 1_000,
        hostName: '호스트',
      },
      transport: hostWire,
      clock: false,
      persist: false,
    });
    const guestSocket = new FakeSocket();
    const guestWire = new WsTransport({
      role: 'guest',
      url: 'wss://relay.example.test/ws?role=guest',
      authToken: token,
      socketFactory: () => guestSocket as unknown as WebSocket,
    });
    const guest = new GuestGame({
      name: '친구',
      transport: guestWire,
      onTicket: () => {},
      persist: false,
      clock: false,
    });
    try {
      expect(host.link).toBe('connecting');
      expect(guest.link).toBe('connecting');
      hostSocket.open();
      guestSocket.open();
      expect(hostSocket.sent[0]).toContain('relay-auth');
      expect(guestSocket.sent[0]).toContain('relay-auth');
      expect(host.link).toBe('connecting');
      expect(guest.link).toBe('connecting');
      hostSocket.receive('{"t":"relay","peer":"absent"}');
      guestSocket.receive('{"t":"relay","peer":"absent"}');
      expect(host.link).toBe('open');
      expect(guest.link).toBe('open');
      hostSocket.close(4001);
      guestSocket.close(4001);
      expect(host.link).toBe('replaced');
      expect(guest.link).toBe('replaced');
    } finally {
      host.dispose();
      guest.dispose();
      hostWire.dispose();
      guestWire.dispose();
    }
  });

  it('NP-RP-03: 원격 GuestGame은 게임 토큰을 주소 fragment에 쓰지 않는다', () => {
    const original = location.href;
    history.replaceState(history.state, '', '#marker');
    const socket = new FakeSocket();
    const wire = new WsTransport({
      role: 'guest',
      url: 'wss://relay.example.test/ws?role=guest',
      authToken: token,
      socketFactory: () => socket as unknown as WebSocket,
    });
    const game = new GuestGame({
      name: '친구',
      transport: wire,
      persist: false,
      clock: false,
    });
    try {
      game.end();
      expect(location.hash).toBe('#marker');
    } finally {
      game.dispose();
      wire.dispose();
      history.replaceState(history.state, '', original);
    }
  });

  it('NF-RP-05: 자동 재접속은 1초 부근에서 시작하고 수동 종료가 대기를 취소한다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const values = new Map<string, string>([
      ['p2p-gostop.remote-guest-active.v1', JSON.stringify(room)],
      [
        `p2p-gostop.remote-guest.v1.${room}`,
        JSON.stringify({
          origin: 'https://relay.example.test',
          roomId: room,
          token,
          nickname: '친구',
          expiresAt: 10_000_000,
        }),
      ],
    ]);
    const sockets: FakeSocket[] = [];
    const guest = createRemoteGuest({
      allowedOrigin: 'https://relay.example.test',
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
        },
        removeItem: (key) => {
          values.delete(key);
        },
      },
      now: () => 1_000,
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      onTransport: () => {},
    });
    try {
      expect(await guest.resume()).toEqual({ ok: true });
      sockets[0]!.close(1006);
      expect(guest.snapshot.state).toBe('reconnecting');
      await vi.advanceTimersByTimeAsync(800);
      expect(sockets).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(400);
      expect(sockets).toHaveLength(2);
      guest.leave();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(sockets).toHaveLength(2);
    } finally {
      guest.leave();
      vi.useRealTimers();
    }
  });

  it('NP-RP-03: 초대 인증 1008 뒤 retry는 폐기된 transport에 머무르지 않는다', async () => {
    const sockets: FakeSocket[] = [];
    const guest = createRemoteGuest({
      allowedOrigin: 'https://relay.example.test',
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      onTransport: () => {
        throw new Error('unexpected transport');
      },
    });
    const link = `https://relay.example.test/r/v1/${'a'.repeat(64)}/#/join?room=${room}&t=${token}`;
    try {
      const joining = guest.joinByLink(link, '친구');
      sockets[0]!.open();
      sockets[0]!.close(1008);
      expect(await joining).toEqual({ ok: false, code: 'invalid' });
      guest.retry();
      expect(guest.snapshot).toMatchObject({ state: 'error', error: 'invalid' });
      expect(sockets).toHaveLength(1);
    } finally {
      guest.leave();
    }
  });

  it('NP-RP-05: 초대 claim 거절을 받으면 참여를 denied로 끝낸다', async () => {
    const sockets: FakeSocket[] = [];
    const guest = createRemoteGuest({
      allowedOrigin: 'https://relay.example.test',
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      onTransport: () => {
        throw new Error('unexpected transport');
      },
    });
    const link = `https://relay.example.test/r/v1/${'a'.repeat(64)}/#/join?room=${room}&t=${token}`;
    try {
      const joining = guest.joinByLink(link, '친구');
      sockets[0]!.open();
      sockets[0]!.receive('{"t":"relay-claim-pending"}');
      sockets[0]!.receive('{"t":"relay-claim-denied"}');
      expect(await joining).toEqual({ ok: false, code: 'denied' });
      expect(guest.snapshot).toMatchObject({ state: 'ended', error: 'denied' });
      guest.retry();
      expect(guest.snapshot).toMatchObject({ state: 'ended', error: 'denied' });
    } finally {
      guest.leave();
    }
  });

  it('NP-RP-03: 만료 초대 4003은 expired이고 정책 거절 1008은 invalid이다', async () => {
    const sockets: FakeSocket[] = [];
    const guest = createRemoteGuest({
      allowedOrigin: 'https://relay.example.test',
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      onTransport: () => {
        throw new Error('unexpected transport');
      },
    });
    const link = `https://relay.example.test/r/v1/${'a'.repeat(64)}/#/join?room=${room}&t=${token}`;
    try {
      const expired = guest.joinByLink(link, '친구');
      sockets[0]!.open();
      sockets[0]!.close(4003);
      expect(await expired).toEqual({ ok: false, code: 'expired' });
      expect(guest.snapshot).toMatchObject({ state: 'ended', error: 'expired' });
      guest.retry();
      expect(guest.snapshot).toMatchObject({ state: 'ended', error: 'expired' });
      const invalid = guest.joinByLink(link, '친구');
      sockets[1]!.open();
      sockets[1]!.close(1008);
      expect(await invalid).toEqual({ ok: false, code: 'invalid' });
      expect(guest.snapshot).toMatchObject({ state: 'error', error: 'invalid' });
    } finally {
      guest.leave();
    }
  });
});
