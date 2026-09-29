<script lang="ts">
  // 내 손패 부채꼴 (spec 6.2: 최대 10장, 겹침 스크롤 없음 / 6.3: 탭 한 번으로 내기, 내 차례가 아니면 흐리게,
  // 누르고 있으면 먹게 될 바닥 카드 강조 / FR-12: 낼 수 있는 카드와 먹을 수 있는 카드 예고).
  // 5장까지 한 줄, 6장 이상은 두 줄로 나눠 카드마다 48px 이상의 터치 영역을 지키고 390px 화면에서 잘리지 않게 한다
  // (spec 6.1, M3 리뷰 L-3: 6장 한 줄은 392px). 손패는 월·종류 순으로 정렬해 보인다(M3 리뷰 I-2).
  // 길게 누르기(400ms 이상)는 미리보기 전용이라 떼어도 내지 않는다(실수 방지).
  // 탭 한 번 = 누르기 시작할 때 이미 낼 수 있던 카드만 낸다(M3 리뷰 I-3): 재생 중에 판을 눌러 애니메이션을 건너뛰면
  // 손가락을 떼기 전에 재생이 끝나 버튼이 풀릴 수 있다. 그 click은 건너뛰기용이었으므로 카드를 내지 않는다.
  import type { CardId } from '../lib/view-types.ts';
  import Card from './Card.svelte';
  import { cardLabel, sortHand } from './cards.ts';

  interface Props {
    cards: readonly CardId[];
    /** 지금 낼 수 있는 카드 */
    playable: readonly CardId[];
    /** 바닥에 같은 월이 있어 먹을 수 있는 카드 (FR-12 예고 표식) */
    matchable?: readonly CardId[];
    /** 카드를 냈다. at = 탭 시각(performance.now 기준, spec AC-06 계측) */
    onplay?: ((id: CardId, at: number) => void) | undefined;
    /** 누르고 있는 카드 (떼면 null) */
    onpreview?: ((id: CardId | null) => void) | undefined;
  }

  let { cards, playable, matchable = [], onplay, onpreview }: Props = $props();

  const ONE_ROW_MAX = 5;
  const LONG_PRESS_MS = 400;
  const sorted = $derived(sortHand(cards));
  const rows = $derived(
    sorted.length <= ONE_ROW_MAX
      ? [sorted]
      : [sorted.slice(0, Math.ceil(sorted.length / 2)), sorted.slice(Math.ceil(sorted.length / 2))],
  );
  const myTurn = $derived(playable.length > 0);

  /** 누르기 시작한 카드·시각, 그때 낼 수 있었는지 (반응형일 필요 없음) */
  let pressed: { id: CardId; at: number; armed: boolean } | null = null;

  /** 부채꼴: 가운데에서 멀수록 기울이고 조금 내린다 */
  function fan(index: number, count: number): string {
    const offset = index - (count - 1) / 2;
    return `rotate(${offset * 3}deg) translateY(${offset * offset * 1.5}px)`;
  }

  // 낼 수 있는 카드가 없어지면(재생 중·상대 차례) 진행 중이던 누르기는 무효다: 재생이 끝난 뒤 오는 click은
  // 새 누르기가 있어야 카드를 낸다(비활성 버튼에 pointerdown이 오지 않는 브라우저에서도 안전하게).
  $effect(() => {
    if (playable.length === 0) pressed = null;
  });

  /**
   * 손패 안의 모든 pointerdown(비활성 버튼 포함)을 캡처 단계에서 받는다: 비활성 버튼의 이벤트는 위임 핸들러가
   * 건너뛸 수 있으므로 버튼이 아니라 손패 영역에서 누른 카드를 기록한다.
   */
  function press(event: PointerEvent) {
    const slot =
      event.target instanceof Element ? event.target.closest<HTMLElement>('[data-slot]') : null;
    const id = slot === null ? null : Number(slot.dataset['slot']);
    if (id === null) {
      pressed = null;
      return;
    }
    const armed = playable.includes(id);
    pressed = { id, at: performance.now(), armed };
    if (armed) onpreview?.(id);
  }

  function release() {
    onpreview?.(null);
  }

  /**
   * 누르기가 취소되면(스크롤 등) 그 누르기로는 내지 않는다. pointerleave는 터치에서 손을 뗄 때 click보다 먼저 오므로
   * 미리보기만 끈다(release).
   */
  function abandon() {
    pressed = null;
    release();
  }

  function activate(id: CardId, event: MouseEvent) {
    const press = pressed;
    pressed = null;
    onpreview?.(null);
    if (!playable.includes(id)) return;
    // 키보드(Enter·Space)와 스크립트 click은 누르기 없이 온다(detail 0): 그대로 낸다
    if (event.detail !== 0) {
      // 포인터 탭: 같은 카드를 낼 수 있을 때 눌렀어야 한다(건너뛰기 탭 방지), 길게 누르기는 미리보기 전용
      if (press === null || press.id !== id || !press.armed) return;
      if (performance.now() - press.at >= LONG_PRESS_MS) return;
    }
    onplay?.(id, event.timeStamp > 0 ? event.timeStamp : performance.now());
  }
</script>

<div
  class={['hand', { waiting: !myTurn }]}
  role="group"
  aria-label="내 손패"
  onpointerdowncapture={press}
>
  {#each rows as row, r (r)}
    <div class="row">
      {#each row as id, i (id)}
        {@const canPlay = playable.includes(id)}
        {@const canMatch = canPlay && matchable.includes(id)}
        <button
          type="button"
          class={['slot', { playable: canPlay, matchable: canMatch }]}
          style:transform={fan(i, row.length)}
          aria-label={`${cardLabel(id)}${canMatch ? ' (먹을 수 있음)' : ''} 내기`}
          disabled={!canPlay}
          data-slot={id}
          onpointerup={release}
          onpointercancel={abandon}
          onpointerleave={release}
          onfocus={() => onpreview?.(id)}
          onblur={release}
          oncontextmenu={(e) => e.preventDefault()}
          onclick={(e) => activate(id, e)}
        >
          <Card
            {id}
            size="l"
            dimmed={!canPlay}
            flippable
            markAt={rows.length > 1 && r === 0 ? 'top' : 'bottom'}
          />
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .hand {
    display: grid;
    justify-content: center;
    padding-bottom: var(--space-2);
  }

  .row {
    display: flex;
    justify-content: center;
    gap: var(--space-1);
  }

  /* 두 번째 줄은 첫 줄 아래쪽 절반을 덮는다: 윗줄은 위쪽 55px(표식 포함)만 보인다.
     55px 노출 영역 안에 16px 월 표식과 최소 48px 입력 영역을 유지한다 (plan.md D1) */
  .row + .row {
    margin-top: calc(55px - var(--card-h-l));
  }

  .slot {
    position: relative;
    min-width: var(--touch-min);
    min-height: var(--touch-min);
    padding: 0;
    border: 0;
    background: none;
    border-radius: 6px;
    transform-origin: 50% 120%;
    -webkit-touch-callout: none;
    user-select: none;
    -webkit-user-select: none;
  }

  .slot.playable > :global(.card) {
    translate: 0 -6px;
  }

  /* FR-12: 먹을 수 있는 카드는 아래에 금색 막대 (색만으로 구분하지 않도록 이름에도 "먹을 수 있음") */
  .slot.matchable::after {
    content: '';
    position: absolute;
    left: 20%;
    right: 20%;
    bottom: -2px;
    height: 4px;
    border-radius: 2px;
    background: var(--color-event-go);
  }

  .slot:disabled {
    cursor: default;
  }
</style>
