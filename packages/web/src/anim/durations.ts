// 애니메이션 시간 예산 (spec 6.4 "빠름" 기준, ms). tokens.css의 --dur-*와 같은 값이다(durations.test.ts가 대조).
// 보통은 단계별 이동과 정지를 따로 정한다. 빠름은 기존 AC-06 표, 매우 빠름은 빠름 ×0.6.

export const DUR = {
  handToFloor: 120,
  matchHighlight: 80,
  flip: 140,
  capture: 160,
  captureStagger: 30,
  steal: 200,
  banner: 350,
  eventCallout: 1200,
  modal: 150,
  dealTotal: 1200,
  turnBudget: 700,
  playHold: 0,
  matchHold: 0,
  revealHold: 0,
  captureHold: 0,
  aiThink: 250,
} as const;

export const NORMAL_DUR: { readonly [K in keyof typeof DUR]: number } = {
  handToFloor: 270,
  matchHighlight: 100,
  flip: 280,
  capture: 300,
  captureStagger: 40,
  steal: 350,
  banner: 900,
  eventCallout: 1200,
  modal: 225,
  dealTotal: 1800,
  turnBudget: 2200,
  playHold: 100,
  matchHold: 200,
  revealHold: 250,
  captureHold: 160,
  aiThink: 500,
};

export type DurationKey = keyof typeof DUR;

/** 보통은 독립 시간표를 쓰고, 빠름/매우 빠름은 기존 빠름 표를 공유한다. */
export function baseMs(key: DurationKey, el: Element = document.documentElement): number {
  return el.ownerDocument.documentElement.dataset['speed'] === 'normal'
    ? NORMAL_DUR[key]
    : DUR[key];
}

export function durationMs(key: DurationKey, el?: Element): number {
  return scaledMs(baseMs(key, el), el);
}

/** prefers-reduced-motion: reduce일 때의 배율. tokens.css의 미디어 쿼리와 같게 0(즉시)이다. */
const REDUCED_MOTION_SCALE = 0;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * 요소에 적용되는 시간 배율. `--dur-scale`(상속되는 CSS 사용자 속성)을 읽고,
 * 사용자가 동작 줄이기를 켰으면 REDUCED_MOTION_SCALE을 넘지 않게 한다.
 * tokens.css가 없는 환경(단위 테스트)에서도 미디어 쿼리를 직접 확인하므로 같은 결과가 나온다.
 */
export function durScale(el: Element = document.documentElement): number {
  const raw = getComputedStyle(el).getPropertyValue('--dur-scale').trim();
  const parsed = raw === '' ? 1 : Number.parseFloat(raw);
  const scale = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
  return matchMedia(REDUCED_MOTION_QUERY).matches ? Math.min(scale, REDUCED_MOTION_SCALE) : scale;
}

/** 기준 ms에 요소의 배율을 곱한 실제 ms */
export function scaledMs(baseMs: number, el?: Element): number {
  return baseMs * durScale(el);
}
