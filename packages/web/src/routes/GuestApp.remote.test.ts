import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { FakeRemoteGuest } from '../../test/fakes/remote-guest.ts';
import GuestApp from './GuestApp.svelte';

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
  expect(screen.getByRole('alert').element().textContent).toContain('초대가 만료되었습니다');
  fake.set({ state: 'error', error: 'version', peerPresent: true });
  await expect.element(screen.getByRole('button', { name: '새로고침' })).toBeVisible();
  expect(screen.getByRole('alert').element().textContent).toContain('페이지를 새로고침하고');
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
