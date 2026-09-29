// FR-RP-07: 원격 준비 단계와 원인별 재시도 안내.
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { PROTOCOL_VERSION } from '@p2p-gostop/protocol';
import { RelayHealthError, type RelayHealthErrorCode } from '../net/public-transport.ts';
import { REMOTE_ERROR_MESSAGES, REMOTE_STEPS } from '../p2p/remote-messages.ts';
import type { RemoteHostController } from '../p2p/remote.ts';
import RemoteGuide from './RemoteGuide.svelte';

const health = {
  relay: 'p2p-gostop',
  ready: true,
  controlVersion: 1,
  wireVersion: PROTOCOL_VERSION,
} as const;

function controller(checkHealth: RemoteHostController['checkHealth']): RemoteHostController {
  return {
    snapshot: { state: 'idle', requests: [], peerPresent: false },
    subscribe: () => () => undefined,
    checkHealth,
    createRoom: async () => {
      throw new Error('unused');
    },
    accept: async () => undefined,
    deny: () => undefined,
    retry: () => undefined,
    close: async () => undefined,
  };
}

test('PC 안내에서 확인 중을 거쳐 버전 일치와 초대 단계로 이동한다', async () => {
  let finish: (value: typeof health) => void = () => undefined;
  const checkHealth = vi.fn(
    () =>
      new Promise<typeof health>((resolve) => {
        finish = resolve;
      }),
  );
  const screen = await render(RemoteGuide, { controller: controller(checkHealth) });
  const steps = screen.container.querySelectorAll('ol > li');
  expect(steps).toHaveLength(3);
  expect(steps[0]?.getAttribute('aria-current')).toBe('step');
  await screen.getByRole('button', { name: '연결 확인' }).click();
  await expect.element(screen.getByText('중계 응답 확인 중…')).toBeVisible();
  expect(steps[1]?.getAttribute('aria-current')).toBe('step');
  expect(
    (screen.getByRole('button', { name: '연결 확인' }).element() as HTMLButtonElement).disabled,
  ).toBe(true);
  finish(health);
  await expect
    .element(screen.getByText(`✓ 중계 응답 정상. 게임 버전 ${PROTOCOL_VERSION} 일치.`))
    .toBeVisible();
  expect(steps[2]?.getAttribute('aria-current')).toBe('step');
  expect(checkHealth).toHaveBeenCalledTimes(1);
});

test('health 오류를 원인별 조치로 표시하고 다시 확인한다', async () => {
  const checkHealth = vi
    .fn()
    .mockRejectedValueOnce(new RelayHealthError('cors'))
    .mockResolvedValueOnce(health);
  const screen = await render(RemoteGuide, { controller: controller(checkHealth) });
  await screen.getByRole('button', { name: '연결 확인' }).click();
  await expect.element(screen.getByText(/접속 허용 설정 확인/)).toBeVisible();
  await expect.element(screen.getByText(/start.cmd를 다시 실행/)).toBeVisible();
  await screen.getByRole('button', { name: '다시 확인' }).click();
  await expect.element(screen.getByText(/중계 응답 정상/)).toBeVisible();
  expect(checkHealth).toHaveBeenCalledTimes(2);
});

test('게임 버전이 다르면 초대 단계로 진행하지 않는다', async () => {
  const screen = await render(RemoteGuide, {
    controller: controller(async () => ({ ...health, wireVersion: PROTOCOL_VERSION + 1 })),
  });
  await screen.getByRole('button', { name: '연결 확인' }).click();
  await expect.element(screen.getByText(/중계 버전 불일치/)).toBeVisible();
  expect(screen.container.querySelectorAll('ol > li')[1]?.getAttribute('aria-current')).toBe(
    'step',
  );
});

test('health 코드마다 제목, 원인, 조치가 있고 문구에 em dash가 없다', () => {
  const codes: RelayHealthErrorCode[] = [
    'cancelled',
    'timeout',
    'cors',
    'network',
    'http',
    'invalidResponse',
    'incompatible',
  ];
  for (const code of codes) {
    const message = REMOTE_ERROR_MESSAGES[code];
    expect(message.title.length).toBeGreaterThan(0);
    expect(message.detail.length).toBeGreaterThan(0);
    expect(message.action.length).toBeGreaterThan(0);
  }
  expect(JSON.stringify({ REMOTE_STEPS, REMOTE_ERROR_MESSAGES })).not.toContain('—');
});
