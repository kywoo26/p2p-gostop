import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Hand from '../Hand.svelte';
import { flipCard, flipMove, finishAll } from '../../anim/flip.ts';
import { flipDepth } from './flip-depth.ts';

test('3D 표시는 기존 뒤집기 시간·취소와 최종 앞면을 보존한다 (VU-02·UX-15)', async () => {
  document.documentElement.dataset['visual'] = 'upgrade';
  const screen = await render(Hand, { cards: [0], playable: [0] });
  const adapter = flipDepth(screen.container);
  const inner = screen.container.querySelector<HTMLElement>('.inner')!;
  const animation = flipCard(inner, { duration: 800 });
  const before = animation.effect!.getTiming();
  try {
    await expect.poll(() => inner.dataset['depthFlip']).toBe('true');
    expect((animation.effect as KeyframeEffect).getKeyframes()[0]!['transform']).toContain(
      'rotateY',
    );
    expect(animation.effect!.getTiming()).toEqual(before);
    animation.cancel();
    for (const other of screen.container.getAnimations({ subtree: true })) other.cancel();
    await expect.poll(() => inner.dataset['depthFlip']).toBeUndefined();
    expect(getComputedStyle(inner.querySelector('.back')!).opacity).toBe('0');
  } finally {
    adapter.destroy?.();
    delete document.documentElement.dataset['visual'];
  }
});

test('광택·이동 잔광은 원본 시간과 동기화하고 스킵/취소 때 남지 않는다 (VU-05·KEEP-10)', async () => {
  document.documentElement.dataset['visual'] = 'upgrade';
  document.documentElement.dataset['visualVariant'] = 'rich';
  const screen = await render(Hand, { cards: [0], playable: [0] });
  const adapter = flipDepth(screen.container);
  const card = screen.container.querySelector<HTMLElement>('.card')!;
  const inner = card.querySelector<HTMLElement>('.inner')!;
  const move = flipMove(card, new DOMRect(10, 10, 40, 60), card.getBoundingClientRect(), {
    duration: 800,
    delay: 50,
  });
  const flip = flipCard(inner, { duration: 800 });
  try {
    await expect.poll(() => card.querySelectorAll('.vu-sheen, .vu-motion-trail').length).toBe(2);
    const trail = card.querySelector('.vu-motion-trail')!.getAnimations()[0]!;
    expect(trail.effect!.getTiming().duration).toBe(move.effect!.getTiming().duration);
    expect(trail.effect!.getTiming().delay).toBe(50);
    finishAll(screen.container);
    await expect.poll(() => card.querySelectorAll('.vu-sheen, .vu-motion-trail').length).toBe(0);
    expect(flip.playState).toBe('finished');
  } finally {
    adapter.destroy?.();
    delete document.documentElement.dataset['visual'];
    delete document.documentElement.dataset['visualVariant'];
  }
});
