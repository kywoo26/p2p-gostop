// UX-08: 필수 선택을 가리지 않고 마지막 사건 문구를 보존한다.
import { expect, test } from 'vitest';
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
});
