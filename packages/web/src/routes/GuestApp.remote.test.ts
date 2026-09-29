import { PRESETS } from '@p2p-gostop/engine';
import { createMemoryTransportPair } from '@p2p-gostop/protocol';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { FakeRemoteGuest } from '../../test/fakes/remote-guest.ts';
import { fixtures } from '../lib/fixtures.ts';
import { HostGame } from '../p2p/host.svelte.ts';
import { createRemoteGuest } from '../p2p/remote.ts';
import { p2p } from '../p2p/store.svelte.ts';
import GuestApp from './GuestApp.svelte';

class RemoteTestSocket extends EventTarget {
  readyState = 0;
  send(): void {}
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

test('링크 참여에서 이름을 입력하고 승인 대기를 취소한다 (FR-RP-02)', async () => {
  const fake = new FakeRemoteGuest();
  const screen = await render(GuestApp, {
    remoteController: fake,
    invitationUrl: 'https://relay.example/r/v/h/#/join?room=x&invite=secret',
  });
  await screen.getByRole('textbox', { name: '이름' }).fill('동료');
  await screen.getByRole('button', { name: '참여하기' }).click();
  await expect.element(screen.getByText(/호스트 승인 대기/)).toBeVisible();
  expect(fake.calls).toContain('link:https://relay.example/r/v/h/#/join?room=x&invite=secret:동료');
  await screen.getByRole('button', { name: '요청 취소' }).click();
  expect(fake.calls).toContain('leave');
});

test('코드는 대소문자와 하이픈을 정규화해 전달한다 (FR-RP-02)', async () => {
  const fake = new FakeRemoteGuest();
  const screen = await render(GuestApp, {
    remoteController: fake,
    initialRemoteOrigin: 'https://relay.example',
  });
  await screen.getByRole('textbox', { name: '이름' }).fill('게스트');
  await screen.getByRole('textbox', { name: '12자리 방 코드' }).fill('abcd-efgh-jkmn');
  await expect
    .element(screen.getByRole('textbox', { name: '12자리 방 코드' }))
    .toHaveValue('ABCD-EFGH-JKMN');
  await screen.getByRole('button', { name: '참여하기' }).click();
  expect(fake.calls).toContain('code:https://relay.example:ABCDEFGHJKMN:게스트');
});

test('공백으로 나눈 12자리 코드도 잘리지 않고 전달한다 (FR-RP-02)', async () => {
  const fake = new FakeRemoteGuest();
  const screen = await render(GuestApp, {
    remoteController: fake,
    initialRemoteOrigin: 'https://relay.example',
  });
  await screen.getByRole('textbox', { name: '이름' }).fill('게스트');
  await screen.getByRole('textbox', { name: '12자리 방 코드' }).fill('ab cd ef gh jk mn');
  await expect
    .element(screen.getByRole('textbox', { name: '12자리 방 코드' }))
    .toHaveValue('ABCD-EFGH-JKMN');
  await screen.getByRole('button', { name: '참여하기' }).click();
  expect(fake.calls).toContain('code:https://relay.example:ABCDEFGHJKMN:게스트');
});

test('저장된 복귀 자격은 이어하기가 우선이다 (FR-RP-04)', async () => {
  const fake = new FakeRemoteGuest();
  const screen = await render(GuestApp, { remoteController: fake, hasRemoteResume: true });
  await screen.getByRole('button', { name: '이어하기' }).click();
  expect(fake.calls).toContain('resume');
  await expect.element(screen.getByText(/로비에 연결되었습니다/)).toBeVisible();
});

test('입력한 중계 주소로 컨트롤러를 바꿔 코드 참여한다 (FR-RP-02)', async () => {
  const first = new FakeRemoteGuest();
  const second = new FakeRemoteGuest();
  const screen = await render(GuestApp, {
    remoteController: first,
    initialRemoteOrigin: 'https://first.example',
    createRemoteController: () => second,
  });
  await screen.getByRole('textbox', { name: '이름' }).fill('동료');
  await screen.getByRole('textbox', { name: '중계 주소' }).fill('https://second.example/');
  await screen.getByRole('textbox', { name: '12자리 방 코드' }).fill('abcd-efgh-jkmn');
  await screen.getByRole('button', { name: '참여하기' }).click();
  expect(second.calls).toContain('code:https://second.example:ABCDEFGHJKMN:동료');
});

test('만료와 버전 오류를 구분하고 재시도할 수 있다 (FR-RP-05, NF-RP-06)', async () => {
  const fake = new FakeRemoteGuest();
  const screen = await render(GuestApp, { remoteController: fake });
  fake.set({ state: 'error', error: 'expired', peerPresent: false });
  await expect.element(screen.getByRole('alert')).toBeVisible();
  expect(screen.getByRole('alert').element().textContent).toContain('초대 만료');
  fake.set({ state: 'error', error: 'version', peerPresent: true });
  await expect.element(screen.getByRole('button', { name: '새로고침' })).toBeVisible();
  expect(screen.getByRole('alert').element().textContent).toContain('같은 배포 버전으로 업데이트');
  fake.set({ state: 'reconnecting', error: 'network', peerPresent: false, reconnectAttempt: 2 });
  await screen.getByRole('button', { name: '다시 시도' }).click();
  expect(fake.calls).toContain('retry');
});

test('승인 대기와 호스트 부재를 구별한다 (FR-RP-05)', async () => {
  const fake = new FakeRemoteGuest();
  const screen = await render(GuestApp, { remoteController: fake });
  fake.set({ state: 'waiting', error: 'host-absent', peerPresent: false });
  await expect.element(screen.getByText(/호스트 응답 대기/)).toBeVisible();
  await expect.element(screen.getByText(/호스트 승인 대기/)).not.toBeInTheDocument();
  await screen.getByRole('button', { name: '다시 시도' }).click();
  expect(fake.calls).toContain('retry');
});

test('무효 초대는 새 링크를 안내하고 같은 링크 재시도로 대기하지 않는다 (FR-RP-02)', async () => {
  const fake = new FakeRemoteGuest();
  const screen = await render(GuestApp, {
    remoteController: fake,
    invitationUrl: 'https://relay.example/r/v/h/#/join?room=x&t=secret',
  });
  fake.set({ state: 'error', error: 'invalid', peerPresent: false });
  await expect.element(screen.getByRole('alert')).toBeVisible();
  expect(screen.getByRole('alert').element().textContent).toContain('새 초대 링크를 요청하세요');
  await expect.element(screen.getByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  expect(fake.calls).toEqual([]);
});

test.each(['게임 메뉴', '정산 종료'] as const)(
  '%s로 나가면 원격 자격과 소켓이 사라지고 이어하기가 제시되지 않는다 (FR-RP-04)',
  async (exitPath) => {
    const room = 'A'.repeat(22);
    const activeKey = 'p2p-gostop.remote-guest-active.v1';
    const roomKey = `p2p-gostop.remote-guest.v1.${room}`;
    sessionStorage.setItem(activeKey, JSON.stringify(room));
    sessionStorage.setItem(
      roomKey,
      JSON.stringify({
        origin: 'https://relay.example',
        roomId: room,
        token: 'B'.repeat(43),
        nickname: '동료',
        expiresAt: Date.now() + 60_000,
      }),
    );
    const [hostWire, guestWire] = createMemoryTransportPair();
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
    let socket: RemoteTestSocket | null = null;
    const controller = createRemoteGuest({
      allowedOrigin: 'https://relay.example',
      storage: sessionStorage,
      socketFactory: () => {
        socket = new RemoteTestSocket();
        return socket as unknown as WebSocket;
      },
      onTransport: () => {
        p2p.join({ name: '동료', transport: guestWire, persist: false, clock: false });
      },
    });
    try {
      const screen = await render(GuestApp, {
        remoteController: controller,
        hasRemoteResume: true,
        initialRemoteOrigin: 'https://relay.example',
      });
      await screen.getByRole('button', { name: '이어하기' }).click();
      expect(socket).not.toBeNull();
      const opened = socket as RemoteTestSocket | null;
      opened?.open();
      opened?.receive('{"t":"relay","peer":"present"}');
      expect(host.start()).toBe(true);
      await expect.element(screen.getByTestId('match')).toBeVisible();

      if (exitPath === '게임 메뉴') {
        await screen.getByTestId('game-menu').click();
        await screen.getByRole('button', { name: '나가기' }).click();
        expect(screen.getByRole('alert').element().textContent).toContain('새 초대나 방 코드');
        await screen.getByRole('button', { name: '나가기 (한 번 더 누르기)' }).click();
      } else {
        p2p.guest!.playback.settlement = {
          view: fixtures.settlement,
          instant: [],
          nextCarry: null,
        };
        await screen.getByRole('button', { name: '종료' }).click();
      }

      expect(sessionStorage.getItem(activeKey)).toBeNull();
      expect(sessionStorage.getItem(roomKey)).toBeNull();
      expect(opened?.readyState).toBe(3);
      await expect
        .element(screen.getByRole('button', { name: '이어하기' }))
        .not.toBeInTheDocument();
      await expect.element(screen.getByRole('heading', { name: '코드로 참여' })).toBeVisible();
      await screen.unmount();
      const reopened = await render(GuestApp, {
        remoteController: createRemoteGuest({
          allowedOrigin: 'https://relay.example',
          storage: sessionStorage,
          onTransport: () => {
            throw new Error('종료한 방에 다시 연결하면 안 됩니다');
          },
        }),
        hasRemoteResume: sessionStorage.getItem(activeKey) !== null,
        initialRemoteOrigin: 'https://relay.example',
      });
      await expect
        .element(reopened.getByRole('button', { name: '이어하기' }))
        .not.toBeInTheDocument();
      await expect.element(reopened.getByRole('heading', { name: '코드로 참여' })).toBeVisible();
    } finally {
      controller.leave();
      p2p.leave();
      host.dispose();
      sessionStorage.removeItem(activeKey);
      sessionStorage.removeItem(roomKey);
    }
  },
);
