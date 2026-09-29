import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { HotspotInfo } from '../bridge/bridge.ts';
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
  await expect.element(screen.getByRole('status')).toHaveTextContent('친구 · 연결됨');
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
