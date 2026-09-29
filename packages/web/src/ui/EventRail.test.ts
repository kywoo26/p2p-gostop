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
  await expect.element(screen.getByRole('status')).toHaveTextContent('내 차례 · 상대 뻑 · 피 1장 이동');
  expect(screen.container.querySelectorAll('[role="status"]')).toHaveLength(1);
});
