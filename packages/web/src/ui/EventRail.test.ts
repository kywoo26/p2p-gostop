// UX-08: 필수 선택을 가리지 않고 마지막 사건 문구를 보존한다.
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EventRail from './EventRail.svelte';

test('선택 중 배너·알림은 숨기고 해제 후 한 상태 메시지로 읽는다', async () => {
  const screen = await render(EventRail, {
    blocked: true,
    idle: '내 차례',
    actor: '상대',
    banner: { kind: 'ppeok', text: '뻑', id: 1 },
    toast: { id: 2, text: '피 1장 이동' },
  });
  expect(screen.container.querySelector('.banner')).toBeNull();
  await screen.rerender({ blocked: false, banner: null, toast: null });
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('내 차례 · 상대 뻑 · 피 1장 이동');
  expect(screen.container.querySelectorAll('[role="status"]')).toHaveLength(1);
});

test('고 선언은 횟수와 주체를 예약 레일에 표시하고 원본 배너가 사라져도 잠시 유지한다', async () => {
  const screen = await render(EventRail, {
    idle: '상대 차례',
    viewer: 0,
    banner: { kind: 'go', text: '2고', seat: 1, id: 3 },
  });
  await expect.element(screen.getByRole('status')).toHaveTextContent('상대 2고!');
  await screen.rerender({ banner: null });
  await expect.element(screen.getByRole('status')).toHaveTextContent('상대 2고!');
  await vi.waitFor(() => expect(screen.container.querySelector('.banner')).toBeNull(), {
    timeout: 2500,
  });
});

test('기존 사건 뒤의 연속 완료를 순서대로 보존하고 중복 입력은 무시한다', async () => {
  const screen = await render(EventRail, {
    idle: '내 차례',
    round: 1,
    banner: { kind: 'ppeok', text: '뻑', seat: 1, id: 1 },
    milestones: [],
  });
  const milestones = [
    { id: 1, round: 1, seat: 0 as const, text: '홍단' },
    { id: 2, round: 1, seat: 1 as const, text: '고도리' },
  ];
  await screen.rerender({ milestones, banner: null });
  await screen.rerender({ milestones });
  await expect.element(screen.getByRole('status')).toHaveTextContent('나 홍단!');
  await vi.waitFor(
    () =>
      expect(screen.container.querySelector('[role="status"]')?.textContent).toContain(
        '상대 고도리!',
      ),
    { timeout: 3000 },
  );
  await vi.waitFor(() => expect(screen.container.querySelector('.banner')).toBeNull(), {
    timeout: 3000,
  });
});

test('선택 중 완료를 보류하고 판 교체 때 대기 항목을 폐기한다', async () => {
  const screen = await render(EventRail, {
    idle: '내 차례',
    round: 1,
    blocked: true,
    milestones: [],
  });
  await screen.rerender({ milestones: [{ id: 3, round: 1, seat: 0, text: '초단' }] });
  expect(screen.container.querySelector('.banner')).toBeNull();
  await screen.rerender({ round: 2, blocked: false, milestones: [] });
  expect(screen.container.querySelector('.banner')).toBeNull();
  await screen.rerender({ milestones: [{ id: 4, round: 2, seat: 1, text: '고도리' }] });
  await expect.element(screen.getByRole('status')).toHaveTextContent('상대 고도리!');
});

test('선택 보류 중 연속 완료도 해제 뒤 모두 순서대로 표시한다', async () => {
  const screen = await render(EventRail, { idle: '내 차례', round: 1, blocked: true });
  await screen.rerender({ milestones: [{ id: 1, round: 1, seat: 0, text: '홍단' }] });
  await screen.rerender({
    milestones: [
      { id: 1, round: 1, seat: 0, text: '홍단' },
      { id: 2, round: 1, seat: 1, text: '고도리' },
    ],
  });
  expect(screen.container.querySelector('.banner')).toBeNull();
  await screen.rerender({ blocked: false });
  await expect.element(screen.getByRole('status')).toHaveTextContent('나 홍단!');
  await vi.waitFor(
    () =>
      expect(screen.container.querySelector('[role="status"]')?.textContent).toContain(
        '상대 고도리!',
      ),
    { timeout: 2500 },
  );
});

test('즉시 모드에서도 콜아웃 문구를 읽을 시간 동안 유지한다', async () => {
  const root = document.documentElement;
  const prior = root.dataset['speed'];
  root.dataset['speed'] = 'instant';
  try {
    const screen = await render(EventRail, {
      idle: '내 차례',
      round: 1,
      milestones: [{ id: 10, round: 1, seat: 0, text: '홍단' }],
    });
    await expect.element(screen.getByRole('status')).toHaveTextContent('나 홍단!');
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect.element(screen.getByRole('status')).toHaveTextContent('나 홍단!');
  } finally {
    if (prior === undefined) delete root.dataset['speed'];
    else root.dataset['speed'] = prior;
  }
});

test('표시 중 다음 완료를 추가해도 첫 항목의 읽기 타이머를 다시 시작하지 않는다', async () => {
  const first = { id: 1, round: 1, seat: 0 as const, text: '홍단' };
  const screen = await render(EventRail, { idle: '내 차례', round: 1, milestones: [first] });
  await expect.element(screen.getByRole('status')).toHaveTextContent('나 홍단!');
  await new Promise((resolve) => setTimeout(resolve, 700));
  await screen.rerender({ milestones: [first, { id: 2, round: 1, seat: 1, text: '고도리' }] });
  await vi.waitFor(
    () =>
      expect(screen.container.querySelector('[role="status"]')?.textContent).toContain(
        '상대 고도리!',
      ),
    { timeout: 1000 },
  );
});
