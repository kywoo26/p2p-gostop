// UX-15 단계·정지 표와 CSS 토큰이 같은 값인지 확인한다.
import { expect, test } from 'vitest';
import tokensCss from '../styles/tokens.css?raw';
import { DUR, NORMAL_DUR, baseMs, durationMs } from './durations.ts';

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

test('빠름·보통의 모든 이동·정지 토큰이 시간표와 같다', () => {
  const normalBlock = tokensCss.split(":root[data-speed='normal'] {")[1]?.split('}')[0] ?? '';
  for (const [key, ms] of Object.entries(DUR)) {
    expect(tokensCss).toContain(`--dur-${kebab(key)}: calc(${ms}ms * var(--dur-scale));`);
    expect(normalBlock).toContain(
      `--dur-${kebab(key)}: calc(${NORMAL_DUR[key as keyof typeof DUR]}ms * var(--dur-scale));`,
    );
  }
});

test('보통은 독립 시간, 매우 빠름은 빠름 ×0.6, 즉시는 정지까지 0', () => {
  const root = document.documentElement;
  const before = root.dataset['speed'];
  try {
    root.dataset['speed'] = 'normal';
    expect(baseMs('revealHold')).toBe(250);
    expect(durationMs('banner')).toBe(900);
    root.dataset['speed'] = 'very-fast';
    expect(durationMs('flip')).toBe(84);
    expect(durationMs('revealHold')).toBe(0);
    root.dataset['speed'] = 'instant';
    expect(durationMs('banner')).toBe(0);
  } finally {
    if (before === undefined) delete root.dataset['speed'];
    else root.dataset['speed'] = before;
  }
});
