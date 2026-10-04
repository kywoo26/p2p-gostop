// FR-46~48 / #115: 화면 보조는 자기 공개 뷰에서 동기적으로 계산한다.
import {
  equivalentTargets,
  guaranteedCaptures,
  getCard,
  matchPreview,
  type CardId,
  type CapturePublicView,
  type PlayerView,
} from '@p2p-gostop/engine';
import type { BoardView } from '@p2p-gostop/protocol';
import type { HandVisualGroup } from '../ui/hand-visual.ts';

export type HintLevel = 'off' | 'basic' | 'detail';

/** 설정 UI 작업의 로컬 필드를 읽는다. 합류 전 저장값에는 기본 등급을 적용한다. */
export function hintLevelOf(settings: object): HintLevel {
  const value = (settings as { readonly hintLevel?: unknown }).hintLevel;
  return value === 'off' || value === 'basic' || value === 'detail' ? value : 'basic';
}

export interface HandAssist {
  readonly available: boolean;
  readonly matchable: readonly CardId[];
  readonly secured: readonly CardId[];
  /** 바닥 매칭 없이 두 손패를 독점 보유한다. 즉시 획득과 구별한다. */
  readonly heldPair: readonly CardId[];
  readonly groups: readonly HandVisualGroup[];
  readonly equivalentTarget: CardId | null;
}

const EMPTY: HandAssist = {
  available: true,
  matchable: [],
  secured: [],
  heldPair: [],
  groups: [],
  equivalentTarget: null,
};
const UNAVAILABLE: HandAssist = { ...EMPTY, available: false };

/** 엔진 보조 함수가 읽는 공개 필드만 옮긴다. 상대 손패·더미·난수는 입력 자체에 없다. */
export function projectAssistView(board: BoardView): CapturePublicView | null {
  if (
    board.seats[board.viewer].hand === null ||
    board.seats[0].revealed === undefined ||
    board.seats[1].revealed === undefined ||
    board.inFlight === undefined ||
    board.legal === undefined ||
    board.phase === undefined
  )
    return null;
  const seat = (index: 0 | 1) => ({
    hand: index === board.viewer ? board.seats[index].hand : null,
    captured: board.seats[index].captured,
    revealed: board.seats[index].revealed!,
  });
  return {
    viewer: board.viewer,
    phase: board.phase,
    turn: board.turn,
    pending: board.pending,
    floor: board.floor,
    seats: [seat(0), seat(1)],
    legal: board.legal,
    inFlight: board.inFlight,
  };
}

function calculateAssist(source: BoardView | PlayerView, view: CapturePublicView): HandAssist {
  const playable = new Set(
    source.legal.filter((action) => action.type === 'play').map((action) => action.card),
  );
  const assessments = guaranteedCaptures(view);
  const matchable = assessments
    .filter((item) => item.certainty === 'match')
    .map((item) => item.card);
  const secured = assessments
    .filter((item) => item.certainty === 'guaranteed')
    .map((item) => item.card);
  const heldPair = assessments
    .filter((item) => item.certainty === 'heldPair')
    .map((item) => item.card);
  const hand = source.seats[source.viewer].hand ?? [];
  const groups: HandVisualGroup[] = [];
  for (const action of source.legal) {
    if (action.type !== 'bomb' || action.seat !== source.viewer) continue;
    const cards = hand.filter((card) => getCard(card).month === action.month);
    if (cards.length > 0) groups.push({ id: `bomb-${action.month}`, kind: 'bomb', cards });
  }
  for (const month of new Set(hand.map((card) => getCard(card).month))) {
    if (month === null) continue;
    const cards = hand.filter((card) => getCard(card).month === month);
    if (cards.length === 4) groups.push({ id: `chongtong-${month}`, kind: 'chongtong', cards });
  }
  for (const card of hand) {
    if (!playable.has(card) || !matchPreview(view, source.viewer, card).shake) continue;
    const month = getCard(card).month;
    if (
      month === null ||
      groups.some((group) => group.kind === 'shake' && group.id === `shake-${month}`)
    )
      continue;
    groups.push({
      id: `shake-${month}`,
      kind: 'shake',
      cards: hand.filter((id) => getCard(id).month === month),
    });
  }
  if (source.pending?.kind === 'shake' && source.pending.seat === source.viewer) {
    const month = source.pending.month;
    if (!groups.some((group) => group.kind === 'shake' && group.id === `shake-${month}`))
      groups.push({
        id: `shake-${month}`,
        kind: 'shake',
        cards: hand.filter((id) => getCard(id).month === month),
      });
  }
  const equivalentTarget =
    source.pending?.kind === 'target'
      ? equivalentTargets({ pending: source.pending, floor: source.floor }, source.pending)
          .representative
      : null;
  return { available: true, matchable, secured, heldPair, groups, equivalentTarget };
}

/** P2P: 전송된 BoardView의 공개 필드만 엔진 보조 입력으로 투영한다. */
export function handAssist(board: BoardView, level: HintLevel): HandAssist {
  if (level === 'off') return EMPTY;
  const view = projectAssistView(board);
  return view === null ? UNAVAILABLE : calculateAssist(board, view);
}

/** 솔로: 엔진이 이미 가린 자기 PlayerView를 직접 쓴다. */
export function handAssistPlayer(view: PlayerView, level: HintLevel): HandAssist {
  return level === 'off' ? EMPTY : calculateAssist(view, view);
}

/** 비동기 확장 작업은 호출 당시 세대와 힌트 단계를 확인하고 나서만 게시한다. */
export class HintResultGate {
  private generation = 0;

  invalidate(): void {
    this.generation += 1;
  }

  async compute<T>(
    level: HintLevel,
    work: () => Promise<T>,
    current: () => HintLevel,
  ): Promise<T | null> {
    const generation = ++this.generation;
    const result = await work();
    return generation === this.generation && level !== 'off' && current() === level ? result : null;
  }
}

/** 실제 선택적 표식이 보인 뒤에만 판별 사용 이력에 올린다. */
export function displayedHintLevel(
  previous: HintLevel,
  current: HintLevel,
  shown: boolean,
): HintLevel {
  if (!shown) return previous;
  const rank = { off: 0, basic: 1, detail: 2 } as const;
  return rank[current] > rank[previous] ? current : previous;
}
