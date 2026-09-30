// FLIP 헬퍼 테스트 (Vitest 브라우저 모드, Chromium + WebKit의 실제 레이아웃).
import { afterEach, describe, expect, test, vi } from 'vitest';
import tokensCss from '../styles/tokens.css?raw';
import { DUR, durScale } from './durations.ts';
import { finishAll, flipCard, flipMove, sequence } from './flip.ts';

const TOLERANCE_PX = 0.75;

let root: HTMLDivElement | null = null;

/** 문서 왼쪽 위에 고정된 무대와 그 안의 절대 배치 상자(= FLIP의 "마지막" 자리) */
function stage(scale: string | null, box = { left: 200, top: 150, width: 40, height: 60 }) {
  root = document.createElement('div');
  root.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:400px;';
  if (scale !== null) root.style.setProperty('--dur-scale', scale);
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;background:red;`;
  root.append(el);
  document.body.append(root);
  return el;
}

function expectRect(actual: DOMRectReadOnly, expected: DOMRectReadOnly) {
  expect(Math.abs(actual.left - expected.left)).toBeLessThan(TOLERANCE_PX);
  expect(Math.abs(actual.top - expected.top)).toBeLessThan(TOLERANCE_PX);
  expect(Math.abs(actual.width - expected.width)).toBeLessThan(TOLERANCE_PX);
  expect(Math.abs(actual.height - expected.height)).toBeLessThan(TOLERANCE_PX);
}

afterEach(() => {
  root?.remove();
  root = null;
  vi.restoreAllMocks();
});

describe('시간 배율 (--dur-scale, spec 6.4)', () => {
  test('tokens.css의 --dur-*와 DUR 상수가 같다', () => {
    const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    for (const [key, ms] of Object.entries(DUR)) {
      expect(tokensCss).toContain(
        key === 'eventCallout'
          ? `--dur-event-callout: ${ms}ms;`
          : `--dur-${kebab(key)}: calc(${ms}ms * var(--dur-scale));`,
      );
    }
  });

  test.each([
    ['1', 1],
    ['1.5', 1.5],
    ['0.6', 0.6],
    ['0', 0],
  ])('--dur-scale %s → 재생 시간 ×%s', (scale, factor) => {
    const el = stage(scale);
    const move = flipMove(el, new DOMRect(0, 0, 40, 60), el.getBoundingClientRect(), {
      duration: 100,
      delay: 20,
    });
    const flip = flipCard(el);
    expect(move.effect?.getTiming().duration).toBeCloseTo(100 * factor);
    expect(move.effect?.getTiming().delay).toBeCloseTo(20 * factor);
    expect(flip.effect?.getTiming().duration).toBeCloseTo(DUR.flip * factor);
    move.cancel();
    flip.cancel();
  });

  test('--dur-scale이 없으면 1 (빠름)', () => {
    const el = stage(null);
    expect(durScale(el)).toBe(1);
    const move = flipMove(el, new DOMRect(0, 0, 40, 60), el.getBoundingClientRect());
    expect(move.effect?.getTiming().duration).toBe(DUR.handToFloor);
    move.cancel();
  });

  test('보통 시간표는 단순 배율이 아닌 단계별 이동 시간을 쓴다', () => {
    const before = document.documentElement.dataset['speed'];
    document.documentElement.dataset['speed'] = 'normal';
    try {
      const el = stage(null);
      const move = flipMove(el, new DOMRect(0, 0, 40, 60), el.getBoundingClientRect());
      const flip = flipCard(el);
      expect(move.effect?.getTiming().duration).toBe(270);
      expect(flip.effect?.getTiming().duration).toBe(280);
      move.cancel();
      flip.cancel();
    } finally {
      if (before === undefined) delete document.documentElement.dataset['speed'];
      else document.documentElement.dataset['speed'] = before;
    }
  });

  test('prefers-reduced-motion이면 즉시(0)', () => {
    const real = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
      query.includes('prefers-reduced-motion')
        ? ({ ...real(query), matches: true } as MediaQueryList)
        : real(query),
    );
    const el = stage('1.5');
    expect(durScale(el)).toBe(0);
    const move = flipMove(el, new DOMRect(0, 0, 40, 60), el.getBoundingClientRect());
    expect(move.effect?.getTiming().duration).toBe(0);
    move.cancel();
  });
});

describe('flipMove: 실제 레이아웃에서 시작·끝 자리', () => {
  test('시작은 from 자리, 끝나면 to 자리 (위치·크기 모두)', async () => {
    const el = stage('1');
    const to = el.getBoundingClientRect();
    const from = new DOMRect(10, 20, 80, 120);
    const anim = flipMove(el, from, to, { duration: 200, easing: 'linear' });

    anim.pause();
    anim.currentTime = 0;
    expectRect(el.getBoundingClientRect(), from);

    anim.currentTime = 100; // 절반: 가운데 점도 중간
    const mid = el.getBoundingClientRect();
    const midCenterX = mid.left + mid.width / 2;
    expect(midCenterX).toBeCloseTo((from.left + from.width / 2 + to.left + to.width / 2) / 2, 0);

    anim.play();
    await anim.finished;
    expectRect(el.getBoundingClientRect(), to);
  });

  test('기존 transform을 유지한 채 이동한다', async () => {
    const el = stage('1');
    el.style.transform = 'translateX(30px)';
    const to = el.getBoundingClientRect();
    const from = new DOMRect(0, 0, 40, 60);
    const anim = flipMove(el, from, to, { duration: 50 });
    anim.pause();
    anim.currentTime = 0;
    expectRect(el.getBoundingClientRect(), from);
    anim.play();
    await anim.finished;
    expectRect(el.getBoundingClientRect(), to);
  });

  test('스태거 지연 동안 from 자리에 머문다 (fill: backwards)', () => {
    const el = stage('1');
    const to = el.getBoundingClientRect();
    const from = new DOMRect(0, 0, 40, 60);
    const anim = flipMove(el, from, to, { duration: DUR.capture, delay: DUR.captureStagger * 3 });
    anim.pause();
    anim.currentTime = DUR.captureStagger; // 아직 지연 구간
    expectRect(el.getBoundingClientRect(), from);
    anim.cancel();
  });

  test('--dur-scale 0이면 곧바로 to 자리에서 끝난다', async () => {
    const el = stage('0');
    const to = el.getBoundingClientRect();
    const anim = flipMove(el, new DOMRect(0, 0, 10, 10), to, { duration: 500 });
    await anim.finished;
    expectRect(el.getBoundingClientRect(), to);
  });

  test('opacity만 추가로 보간한다', () => {
    const el = stage('1');
    const anim = flipMove(el, el.getBoundingClientRect(), el.getBoundingClientRect(), {
      opacity: [0, 1],
      easing: 'linear',
      duration: 100,
    });
    anim.pause();
    anim.currentTime = 50;
    expect(Number(getComputedStyle(el).opacity)).toBeCloseTo(0.5, 1);
    anim.cancel();
  });
});

describe('will-change는 움직이는 동안만', () => {
  test('시작할 때 걸고 끝나면 지운다', async () => {
    const el = stage('1');
    const anim = flipMove(el, new DOMRect(0, 0, 40, 60), el.getBoundingClientRect(), {
      duration: 30,
    });
    expect(el.style.willChange).toBe('transform, opacity');
    await anim.finished;
    await Promise.resolve();
    expect(el.style.willChange).toBe('');
  });

  test('겹친 애니메이션은 마지막 것이 끝날 때 지우고, 취소도 끝으로 친다', async () => {
    const el = stage('1');
    const short = flipMove(el, new DOMRect(0, 0, 40, 60), el.getBoundingClientRect(), {
      duration: 20,
    });
    const long = flipCard(el, { duration: 400 });
    await short.finished;
    await Promise.resolve();
    expect(el.style.willChange).toBe('transform, opacity');
    const longFinished = long.finished; // cancel()은 finished를 새 Promise로 바꾼다
    long.cancel();
    await longFinished.catch(() => undefined);
    await Promise.resolve();
    expect(el.style.willChange).toBe('');
  });

  test('원래 인라인 will-change 값을 돌려놓는다', async () => {
    const el = stage('1');
    el.style.willChange = 'opacity';
    const anim = flipCard(el, { duration: 20 });
    expect(el.style.willChange).toBe('transform, opacity');
    await anim.finished;
    await Promise.resolve();
    expect(el.style.willChange).toBe('opacity');
  });
});

describe('flipCard: 2D 뒤집기 (M3 리뷰 S-1: 3D 뒷면 감추기에 기대지 않는다)', () => {
  test('앞 절반은 뒷면이 보이고, 접힌 뒤로는 앞면만 보인다', async () => {
    const el = stage('1');
    const back = document.createElement('div');
    back.className = 'back';
    back.style.opacity = '0';
    el.append(back);
    const anim = flipCard(el, { duration: 200, easing: 'linear' });
    anim.pause();
    const [backAnim] = back.getAnimations();
    backAnim?.pause();
    for (const [t, opacity] of [
      [20, '1'],
      [90, '1'],
      [110, '0'],
      [190, '0'],
    ] as const) {
      anim.currentTime = t;
      if (backAnim) backAnim.currentTime = t;
      expect(getComputedStyle(back).opacity, `${t}ms`).toBe(opacity);
    }
    anim.play();
    backAnim?.play();
    await anim.finished;
    expect(getComputedStyle(back).opacity).toBe('0');
  });

  test('이미 뒷면이 보이는(가려진) 카드는 면을 바꾸지 않는다', () => {
    const el = stage('1');
    const back = document.createElement('div');
    back.className = 'back';
    el.append(back);
    const anim = flipCard(el, { duration: 200 });
    expect(back.getAnimations()).toHaveLength(0);
    anim.cancel();
  });

  test('반 바퀴 지점에서 옆면(폭 거의 0), 끝나면 원래 폭', async () => {
    const el = stage('1');
    const full = el.getBoundingClientRect();
    const anim = flipCard(el, { duration: 200, easing: 'linear' });
    anim.pause();
    anim.currentTime = 100;
    expect(el.getBoundingClientRect().width).toBeLessThan(full.width * 0.1);
    anim.play();
    await anim.finished;
    expectRect(el.getBoundingClientRect(), full);
  });
});

describe('sequence: Animation.finished 체인', () => {
  test('단계를 차례로 실행하고 배열은 동시에 기다린다', async () => {
    const a = stage('1');
    const b = document.createElement('div');
    root?.append(b);
    const order: string[] = [];
    const t0 = performance.now();
    await sequence(
      () => {
        order.push('move');
        return flipMove(a, new DOMRect(0, 0, 40, 60), a.getBoundingClientRect(), { duration: 60 });
      },
      () => {
        order.push('pair');
        return [flipCard(a, { duration: 40 }), flipCard(b, { duration: 80 })];
      },
      async () => {
        order.push('promise');
        await Promise.resolve();
      },
      () => {
        order.push('void');
      },
    );
    expect(order).toEqual(['move', 'pair', 'promise', 'void']);
    // 60 + max(40, 80) = 140ms 이상 걸려야 한다 (프레임 경계 여유 10ms)
    expect(performance.now() - t0).toBeGreaterThanOrEqual(130);
  });

  test('--dur-scale 0이면 전체 체인이 즉시 끝난다', async () => {
    const el = stage('0');
    const t0 = performance.now();
    await sequence(
      () => flipMove(el, new DOMRect(0, 0, 10, 10), el.getBoundingClientRect(), { duration: 5000 }),
      () => flipCard(el, { duration: 5000 }),
    );
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  test('취소된 애니메이션은 끝난 것으로 치고 다음 단계로 간다', async () => {
    const el = stage('1');
    let reached = false;
    await sequence(
      () => {
        const anim = flipCard(el, { duration: 10_000 });
        anim.cancel();
        return anim;
      },
      () => {
        reached = true;
      },
    );
    expect(reached).toBe(true);
  });

  test('finishAll은 하위 요소의 진행 중 애니메이션을 끝 상태로 보낸다 (건너뛰기)', async () => {
    const el = stage('1');
    const to = el.getBoundingClientRect();
    const anim = flipMove(el, new DOMRect(0, 0, 10, 10), to, { duration: 10_000 });
    finishAll(root ?? document);
    await anim.finished;
    expect(anim.playState).toBe('finished');
    expectRect(el.getBoundingClientRect(), to);
  });
});
