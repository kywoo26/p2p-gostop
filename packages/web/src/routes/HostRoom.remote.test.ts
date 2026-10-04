import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { HotspotInfo } from '../bridge/bridge.ts';
import type { RemoteState } from '../p2p/remote.ts';
import { FakeRemoteHost } from '../../test/fakes/remote-host.ts';
import HostRoom, { type HostRoomRules } from './HostRoom.svelte';

const hotspot: HotspotInfo = {
  state: 'off',
  ssid: null,
  password: null,
  ip: null,
  port: null,
  error: null,
  lanEnabled: false,
  warning: null,
};
const rules: HostRoomRules = {
  preset: 'standard' as const,
  custom: false,
  perPoint: 100,
  startBalance: 10_000,
  hostName: '방장',
  unit: '원' as const,
  timerDecisionMs: 10_000,
};

test('원격 방의 코드·링크·QR과 만료 시간을 표시한다 (FR-RP-02)', async () => {
  const remote = new FakeRemoteHost();
  const screen = await render(HostRoom, { hotspot, guest: null, rules, remote });
  await screen.getByRole('button', { name: '방 만들기' }).click();
  await expect.element(screen.getByTestId('remote-code')).toHaveTextContent('ABCD-EFGH-JKLM');
  const link = screen.getByRole('textbox', { name: '초대 링크' }).element() as HTMLInputElement;
  expect(link.value).toContain('#invite=test-token');
  link.click();
  expect(link.selectionStart).toBe(0);
  expect(link.selectionEnd).toBe(link.value.length);
  const copy = vi.spyOn(document, 'execCommand').mockReturnValue(true);
  await screen.getByRole('button', { name: '초대 링크 복사' }).click();
  expect(copy).toHaveBeenCalledWith('copy');
  await expect.element(screen.getByText('초대 링크를 복사했습니다.')).toBeVisible();
  copy.mockRestore();
  await expect.element(screen.getByRole('img', { name: '원격 초대 QR' })).toBeVisible();
  expect(screen.getByRole('img', { name: '원격 초대 QR' }).element().getAttribute('data-qr')).toBe(
    link.value,
  );
  await expect.element(screen.getByTestId('invite-countdown')).toBeVisible();
  await expect.element(screen.getByTestId('room-countdown')).toBeVisible();
});

test.each(['false', 'exception'] as const)(
  '초대 링크 복사가 %s이면 전체 선택을 복구한다 (FR-RP-02)',
  async (failure) => {
    const remote = new FakeRemoteHost();
    const screen = await render(HostRoom, { hotspot, guest: null, rules, remote });
    await screen.getByRole('button', { name: '방 만들기' }).click();
    const link = screen.getByRole('textbox', { name: '초대 링크' }).element() as HTMLInputElement;
    const copy = vi.spyOn(document, 'execCommand').mockImplementation(() => {
      link.setSelectionRange(3, 3);
      if (failure === 'exception') throw new Error('copy unavailable');
      return false;
    });
    await screen.getByRole('button', { name: '초대 링크 복사' }).click();
    expect(document.activeElement).toBe(link);
    expect(link.selectionStart).toBe(0);
    expect(link.selectionEnd).toBe(link.value.length);
    await expect
      .element(screen.getByText('복사에 실패했습니다. 선택된 링크를 직접 복사하세요.'))
      .toBeVisible();
    copy.mockRestore();
  },
);

test('코드 참여는 요청을 수락해야 연결 상태가 된다 (FR-RP-02/03)', async () => {
  const remote = new FakeRemoteHost();
  const screen = await render(HostRoom, {
    hotspot,
    guest: { name: '친구', connected: false },
    rules,
    remote,
  });
  remote.set({
    requests: [
      {
        id: 'nameless',
        kind: 'code',
        receivedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
    ],
  });
  await expect.element(screen.getByText(/이름 미입력 · 코드 참여/)).toBeVisible();
  remote.set({
    requests: [
      {
        id: 'one',
        kind: 'code',
        nickname: '친구',
        receivedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
    ],
  });
  await expect.element(screen.getByText(/친구 · 코드 참여/)).toBeVisible();
  await expect.element(screen.getByText(/이름 미입력/)).not.toBeInTheDocument();
  await screen.getByRole('button', { name: '수락' }).click();
  expect(remote.calls).toContain('accept:one');
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('친구 · 연결됨 · 게임 연결 확인 중');
  remote.set({
    requests: [
      {
        id: 'two',
        kind: 'invite',
        nickname: '다른 사람',
        receivedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
    ],
  });
  await screen.getByRole('button', { name: '거절' }).click();
  expect(remote.calls).toContain('deny:two');
});

test('15분 초대 만료 뒤 링크와 QR을 숨기고 새 방 행동을 제공한다 (FR-RP-02/05)', async () => {
  const remote = new FakeRemoteHost();
  const screen = await render(HostRoom, { hotspot, guest: null, rules, remote });
  await remote.createRoom();
  remote.set({
    room: { ...remote.snapshot.room!, expiresAt: Date.now() + (6 * 60 - 15) * 60_000 - 1000 },
  });
  await expect.element(screen.getByText('초대 시간이 끝났습니다.')).toBeVisible();
  await expect.element(screen.getByTestId('remote-code')).not.toBeInTheDocument();
  await expect.element(screen.getByRole('img', { name: '원격 초대 QR' })).not.toBeInTheDocument();
  await screen.getByRole('button', { name: '새 방 만들기' }).click();
  expect(remote.calls).toContain('close');
});

test.each([
  {
    state: 'waiting',
    peerPresent: false,
    connected: false,
    name: null,
    text: '접속 대기',
    fullStatus: '상대 · 접속 대기',
    next: '초대 링크를 보내거나 코드 참여 요청을 수락하세요.',
    waiting: true,
  },
  {
    state: 'admitting',
    peerPresent: false,
    connected: false,
    name: null,
    text: '참가 승인 · 접속 대기',
    fullStatus: '상대 · 참가 승인 · 접속 대기',
    next: '참가 요청을 수락했습니다. 상대의 접속을 기다리고 있습니다.',
    waiting: false,
  },
  {
    state: 'connected',
    peerPresent: true,
    connected: false,
    name: null,
    text: '게임 연결 확인 중',
    fullStatus: '상대 · 연결됨 · 게임 연결 확인 중',
    next: '상대의 게임 연결을 확인하고 있습니다.',
    waiting: false,
  },
  {
    state: 'connected',
    peerPresent: true,
    connected: true,
    name: '친구',
    text: '준비 완료',
    fullStatus: '친구 · 연결됨 · 준비 완료',
    next: '규칙·금액을 확인하고 아래 시작을 누르세요.',
    waiting: false,
  },
  {
    state: 'waiting',
    peerPresent: false,
    connected: false,
    name: '친구',
    text: '상대 재접속 대기',
    fullStatus: '친구 · 상대 재접속 대기',
    next: '상대가 같은 방으로 돌아오면 시작할 수 있습니다.',
    waiting: false,
  },
  {
    state: 'reconnecting',
    peerPresent: false,
    connected: true,
    name: '친구',
    text: '중계 재연결 중',
    fullStatus: '친구 · 중계 재연결 중',
    next: '중계에 다시 연결되면 상대의 게임 연결을 확인합니다.',
    waiting: false,
  },
  {
    state: 'checking',
    peerPresent: true,
    connected: true,
    name: '친구',
    text: '중계 응답 확인 중',
    fullStatus: '친구 · 중계 응답 확인 중',
    next: '중계 응답 확인이 끝나면 상대의 게임 연결을 확인합니다.',
    waiting: false,
  },
  {
    state: 'idle',
    peerPresent: true,
    connected: true,
    name: '친구',
    text: '게임 연결 확인 대기',
    fullStatus: '친구 · 게임 연결 확인 대기',
    next: '중계 연결 상태를 확인한 뒤 상대의 게임 연결을 확인합니다.',
    waiting: false,
  },
  {
    state: 'ended',
    peerPresent: false,
    connected: true,
    name: '친구',
    text: '방 종료',
    fullStatus: '친구 · 방 종료',
    next: '새 방을 만들어 다시 초대하세요.',
    waiting: false,
  },
] as const)(
  'FR-RP-04/05 #242: $state/$text 상태와 시작 권한을 구분한다',
  async ({ state, peerPresent, connected, name, fullStatus, next, waiting }) => {
    const remote = new FakeRemoteHost();
    await remote.createRoom();
    remote.set({
      state: state as RemoteState,
      peerPresent,
      ...(state === 'ended' ? { room: undefined } : {}),
    });
    const screen = await render(HostRoom, {
      hotspot,
      guest: name === null ? null : { name, connected },
      rules,
      remote,
    });
    await expect.element(screen.getByRole('status')).toHaveTextContent(fullStatus);
    await expect.element(screen.getByText(next)).toBeVisible();
    if (waiting) await expect.element(screen.getByText('요청을 기다리는 중…')).toBeVisible();
    else await expect.element(screen.getByText('요청을 기다리는 중…')).not.toBeInTheDocument();
    if (state === 'connected' && peerPresent && connected)
      await expect.element(screen.getByTestId('host-start')).toBeEnabled();
    else await expect.element(screen.getByTestId('host-start')).toBeDisabled();
    if (state === 'ended')
      await expect.element(screen.getByRole('heading', { name: '원격 대전 준비' })).toBeVisible();
    else
      await expect
        .element(screen.getByRole('heading', { name: '원격 대전 준비' }))
        .not.toBeInTheDocument();
    if (state === 'reconnecting') {
      await expect.element(screen.getByRole('button', { name: '다시 연결' })).toBeDisabled();
      expect(remote.calls).not.toContain('retry');
    }
  },
);

test('FR-RP-05 #242: 기존 방 오류에서 다시 연결하고 재연결 중에는 반복 요청을 막는다', async () => {
  const remote = new FakeRemoteHost();
  const room = await remote.createRoom();
  remote.fail('network');
  const screen = await render(HostRoom, {
    hotspot,
    guest: { name: '친구', connected: true },
    rules,
    remote,
  });
  await expect.element(screen.getByRole('status')).toHaveTextContent('친구 · 연결 확인 필요');
  await expect.element(screen.getByText('연결 안내를 확인한 뒤 다시 연결하세요.')).toBeVisible();
  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent(
      '중계에 연결할 수 없음. 주소 입력과 인터넷을 확인한 뒤 PC 전원, Docker Desktop, Funnel과 인증서를 차례로 확인하세요.',
    );
  await expect.element(screen.getByTestId('host-start')).toBeDisabled();
  await expect.element(screen.getByRole('button', { name: '다시 연결' })).toBeEnabled();
  await screen.getByRole('button', { name: '다시 연결' }).click();
  expect(remote.calls.filter((call) => call === 'retry')).toHaveLength(1);
  expect(remote.snapshot.room).toBe(room);
  expect(remote.calls).not.toContain('close');
  expect(remote.calls.filter((call) => call === 'createRoom')).toHaveLength(1);
  // 실제 retry의 동기 reconnecting 투영을 주입한다. 네트워크 재연결 검증은 아니다.
  remote.set({ state: 'reconnecting', peerPresent: false, error: undefined });
  await expect.element(screen.getByRole('button', { name: '다시 연결' })).toBeDisabled();
  (screen.getByRole('button', { name: '다시 연결' }).element() as HTMLButtonElement).click();
  expect(remote.calls.filter((call) => call === 'retry')).toHaveLength(1);
  expect(remote.snapshot.room).toBe(room);
});

test('FR-RP-04 #242: 설정 왕복으로 다시 마운트해도 연결 상태를 투영하고 이전 controller 알림을 해제한다', async () => {
  const previous = new FakeRemoteHost();
  await previous.createRoom();
  previous.set({ state: 'connected', peerPresent: true });
  let screen = await render(HostRoom, {
    hotspot,
    guest: { name: '친구', connected: true },
    rules,
    remote: previous,
  });
  await expect.element(screen.getByRole('status')).toHaveTextContent('친구 · 연결됨 · 준비 완료');
  await screen.unmount();
  screen = await render(HostRoom, {
    hotspot,
    guest: { name: '친구', connected: true },
    rules,
    remote: previous,
  });
  await expect.element(screen.getByRole('status')).toHaveTextContent('친구 · 연결됨 · 준비 완료');
  await expect.element(screen.getByText('요청을 기다리는 중…')).not.toBeInTheDocument();
  const current = new FakeRemoteHost();
  await current.createRoom();
  await screen.rerender({ remote: current, guest: null });
  previous.set({ state: 'connected', peerPresent: true });
  await expect.element(screen.getByRole('status')).toHaveTextContent('상대 · 접속 대기');
  await expect.element(screen.getByTestId('host-start')).toBeDisabled();
  current.set({ state: 'connected', peerPresent: true });
  await screen.rerender({ guest: { name: '친구', connected: true } });
  await expect.element(screen.getByRole('status')).toHaveTextContent('친구 · 연결됨 · 준비 완료');
});

test('방 생성 응답 오류는 주소·코드를 고치라는 안내와 구분한다 (FR-RP-01/07)', async () => {
  const remote = new FakeRemoteHost();
  const screen = await render(HostRoom, { hotspot, guest: null, rules, remote });
  remote.set({ state: 'error', error: 'room-create' });
  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent(
      '방 만들기 실패. 앱과 중계를 같은 최신 버전으로 업데이트한 뒤 다시 시도하세요.',
    );
  expect(screen.getByRole('alert').element().textContent).not.toContain('주소와 코드를');
});
