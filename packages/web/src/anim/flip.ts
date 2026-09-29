// 카드 애니메이션 헬퍼: Web Animations API + FLIP (plan.md 1.6, agent-era-stack.md 3.3·3.4).
// - transform·opacity만 움직인다. top/left/width, 그림자, filter는 애니메이션하지 않는다.
// - will-change는 움직이는 동안만 걸고 끝나면(취소 포함) 지운다(iOS WebKit 메모리).
// - 기본 이동은 선택한 시간표의 ms를 쓰고 요소의 --dur-scale을 곱한다. 0이면 즉시 끝난다.
// - 건너뛰기(spec 6.3 "화면을 탭하면 남은 애니메이션을 즉시 완료"): 보드 루트에 --dur-scale: 0을 걸고
//   finishAll(보드 루트)를 부르면 진행 중인 것은 끝나고, 이후 시작하는 것은 0ms가 된다.
import { baseMs, scaledMs } from './durations.ts';

const DEFAULT_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

interface TimingOptions {
  /** 선택한 시간표의 ms. --dur-scale이 곱해진다 */
  readonly duration?: number;
  /** 선택한 시간표의 ms. --dur-scale이 곱해진다 (스태거용) */
  readonly delay?: number;
  readonly easing?: string;
}

export interface MoveOptions extends TimingOptions {
  /** 크기 차이도 보간할지 (기본 true). false면 위치만 옮긴다 */
  readonly scale?: boolean;
  /** 시작·끝 불투명도 (기본: 바꾸지 않음) */
  readonly opacity?: readonly [from: number, to: number];
}

export interface FlipCardOptions extends TimingOptions {
  /** 앞 절반 동안 보일 뒷면 요소 (기본: `el` 안의 `.back`). 없으면 폭만 접었다 편다 */
  readonly back?: HTMLElement | null;
}

/** 애니메이션 하나, 여러 개(동시), Promise, 또는 아무것도 돌려주지 않는 단계 */
export type Step = () => Animation | readonly Animation[] | PromiseLike<unknown> | void;

// ---- will-change 참조 계수: 같은 요소에 애니메이션이 겹쳐도 마지막 것이 끝날 때만 지운다 ----
const holds = new WeakMap<HTMLElement, { count: number; previous: string }>();

function hold(el: HTMLElement): void {
  const entry = holds.get(el);
  if (entry) {
    entry.count += 1;
    return;
  }
  holds.set(el, { count: 1, previous: el.style.willChange });
  el.style.willChange = 'transform, opacity';
}

function release(el: HTMLElement): void {
  const entry = holds.get(el);
  if (!entry) return;
  entry.count -= 1;
  if (entry.count > 0) return;
  holds.delete(el);
  if (entry.previous) el.style.willChange = entry.previous;
  else el.style.removeProperty('will-change');
}

/** 요소의 현재(커밋된) transform. 애니메이션 키프레임 뒤에 붙여 원래 변형을 유지한다. */
function baseTransform(el: HTMLElement): string {
  const value = getComputedStyle(el).transform;
  return value === 'none' || value === '' ? '' : ` ${value}`;
}

function run(el: HTMLElement, keyframes: Keyframe[], opts: TimingOptions, baseMs: number) {
  const animation = el.animate(keyframes, {
    duration: scaledMs(opts.duration ?? baseMs, el),
    delay: scaledMs(opts.delay ?? 0, el),
    easing: opts.easing ?? DEFAULT_EASING,
    // 스태거 지연 동안 시작 위치에 머문다. 끝나면 커밋된 스타일로 돌아간다(FLIP의 "마지막" 상태).
    fill: 'backwards',
  });
  hold(el);
  const done = () => release(el);
  animation.finished.then(done, done);
  return animation;
}

/**
 * FLIP 이동. `el`은 이미 새 자리(`to`)에 배치되어 있어야 한다(상태 커밋 → tick() 뒤).
 * `from`(이전 자리)에서 `to`로 옮겨 가는 것처럼 보이게 역변환에서 시작해 원래 transform으로 돌아온다.
 * 기본 시간은 손패 → 바닥 120ms(spec 6.4). 획득 이동은 `{ duration: DUR.capture, delay: i * DUR.captureStagger }`.
 */
export function flipMove(
  el: HTMLElement,
  from: DOMRectReadOnly,
  to: DOMRectReadOnly,
  opts: MoveOptions = {},
): Animation {
  // 기본 transform-origin(가운데) 기준: 가운데 점의 차이만큼 옮기고 가운데를 중심으로 크기를 맞춘다.
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const useScale = opts.scale ?? true;
  const sx = useScale && to.width > 0 ? from.width / to.width : 1;
  const sy = useScale && to.height > 0 ? from.height / to.height : 1;
  const base = baseTransform(el);
  const [fromOpacity, toOpacity] = opts.opacity ?? [];
  return run(
    el,
    [
      {
        transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})${base}`,
        ...(fromOpacity === undefined ? {} : { opacity: fromOpacity }),
      },
      {
        transform: `translate(0px, 0px) scale(1, 1)${base}`,
        ...(toOpacity === undefined ? {} : { opacity: toOpacity }),
      },
    ],
    opts,
    baseMs('handToFloor', el),
  );
}

/**
 * 뒤집기. `el`은 이미 뒤집힌 뒤의 상태(커밋된 앞면)를 보여 주고 있어야 한다. 폭을 반까지 접으며 뒷면을 보이고,
 * 접힌 순간 앞면으로 바꿔 편다(2D scaleX). 3D 회전·backface-visibility에 기대지 않는다: WebKit은 합성 레이어가
 * 없는 preserve-3d 안의 뒷면을 감추지 않아 앞면 카드가 뒷면으로 그려졌다(M3 리뷰 S-1).
 * DOM 약속: 뒷면 요소(기본 `el` 안의 `.back`)는 평소 opacity 0이고, 이 애니메이션 앞 절반 동안만 1이다
 * (src/ui/Card.svelte). 이동과 같이 쓸 때는 바깥 요소에 flipMove, 안쪽 요소에 flipCard를 건다.
 * 기본 시간은 더미 뒤집기 140ms(spec 6.4). 돌려주는 애니메이션은 폭(transform) 쪽이고 뒷면 불투명도 애니메이션은
 * 같은 시간·이징이라 함께 끝난다(finishAll·건너뛰기도 둘 다 끝낸다).
 */
export function flipCard(el: HTMLElement, opts: FlipCardOptions = {}): Animation {
  const base = baseTransform(el);
  const back = opts.back === undefined ? el.querySelector<HTMLElement>('.back') : opts.back;
  // 이미 뒷면이 보이는(가려진) 카드는 면을 바꾸지 않는다
  if (back !== null && getComputedStyle(back).opacity === '0') {
    run(
      back,
      [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }],
      opts,
      baseMs('flip', el),
    );
  }
  return run(
    el,
    [
      { transform: `${base} scaleX(1)`.trim() },
      { transform: `${base} scaleX(0)`.trim(), offset: 0.5 },
      { transform: `${base} scaleX(1)`.trim() },
    ],
    opts,
    baseMs('flip', el),
  );
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function settle(result: ReturnType<Step>): Promise<void> {
  const animations = result instanceof Animation ? [result] : Array.isArray(result) ? result : null;
  if (animations) {
    // 취소된 애니메이션은 "끝남"으로 본다. cancel()은 기존 finished를 AbortError로 거부하고 새(대기) Promise로
    // 바꾸므로, 이미 취소된(idle) 것은 기다리지 않고 기다리는 도중 취소되면 AbortError를 삼킨다.
    await Promise.all(
      animations.map((a: Animation) =>
        a.playState === 'idle'
          ? undefined
          : a.finished.catch((e: unknown) => {
              if (!isAbort(e)) throw e;
            }),
      ),
    );
    return;
  }
  await result;
}

/**
 * 단계를 차례로 실행한다. 각 단계가 돌려준 애니메이션의 `finished`를 기다린 뒤 다음 단계를 시작한다.
 * 배열을 돌려주면 동시에 재생하고 전부 끝날 때까지 기다린다. 취소된 애니메이션은 끝난 것으로 친다.
 */
export async function sequence(...steps: readonly Step[]): Promise<void> {
  for (const step of steps) {
    await settle(step());
  }
}

/** `root` 아래(자신 포함) 진행 중인 애니메이션을 즉시 끝 상태로 보낸다 (spec 6.3 건너뛰기). */
export function finishAll(root: Element | Document = document): void {
  const animations =
    root instanceof Document ? root.getAnimations() : root.getAnimations({ subtree: true });
  for (const animation of animations) {
    if (animation.playState === 'finished') continue;
    try {
      animation.finish();
    } catch {
      // 무한 반복 애니메이션(finish 불가)은 건너뛴다. 카드 헬퍼는 만들지 않는다.
    }
  }
}
