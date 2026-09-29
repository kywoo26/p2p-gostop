import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Hand from '../Hand.svelte';
import { flipCard } from '../../anim/flip.ts';
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
