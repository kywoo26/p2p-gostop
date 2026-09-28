// 엔진 상태·액션·이벤트 타입 (plan.md 1.4, spec 4.3·4.5).
// 상태에는 카드 ID(0~50)만 두고 JSON 직렬화할 수 있게 한다. 좌석은 인덱스 0/1.
import type { CardId, Month } from './cards.ts';
import type { RngState } from './rng.ts';
import type { RuleOptions } from './rules.ts';

/** 좌석 인덱스. 이름(human/computer)을 쓰지 않는다 (AGENTS.md 3장). */
export type Seat = 0 | 1;

/**
 * spec 4.3 RoundPhase. DEAL은 newRound 안에서 끝나므로 상태로 남지 않는다.
 * TURN 내부 단계(PLAY·MATCH_PLAY·FLIP·MATCH_FLIP·RESOLVE·SCORE·NEXT)는 `pending`과 `ctx`로 표현한다.
 */
export type Phase = 'chooseFirst' | 'turn' | 'end';

export interface CapturedPile {
  readonly gwang: readonly CardId[];
  readonly yeol: readonly CardId[];
  readonly tti: readonly CardId[];
  /** 일반피·쌍피·보너스. 국진은 쌍피로 써도 열끗 더미에 둔다(좌석의 gukjinAsPi 참조). */
  readonly pi: readonly CardId[];
}

/** 족보 점수 분해 (rules 12.3 S1~S4) */
export interface ScoreBreakdown {
  readonly gwang: number;
  readonly yeol: number;
  readonly godori: number;
  readonly tti: number;
  readonly hongdan: number;
  readonly cheongdan: number;
  readonly chodan: number;
  readonly pi: number;
  readonly total: number;
  /** 장수: 광·열끗(국진 위치 반영)·띠 장수, 피는 가치 합 */
  readonly gwangCount: number;
  readonly yeolCount: number;
  readonly ttiCount: number;
  readonly piCount: number;
  /** 이 분해에서 국진을 쌍피로 셌는지 */
  readonly gukjinAsPi: boolean;
}

export interface SeatState {
  readonly hand: readonly CardId[];
  readonly captured: CapturedPile;
  /** 고 횟수 (G3) */
  readonly goCount: number;
  /** 마지막 고 시점 점수 (G2: 재고·스톱은 이 점수 + 1 이상) */
  readonly lastGoScore: number;
  /** 흔들기 횟수 (E11, 승자만 ×2/회) */
  readonly shakes: number;
  /** 배수가 붙는 폭탄 횟수 (E9 3장 폭탄, E10 2장 폭탄 ×2 모드) */
  readonly bombs: number;
  /** 남은 폭탄패(뒤집기만 하는 턴) 수 (E9·E10) */
  readonly bombTokens: number;
  /** 뻑을 싼 자기 턴 번호들 (E4 첫뻑/연뻑/3연뻑, E5 3뻑) */
  readonly ppeokTurns: readonly number[];
  /** 지금까지 시작한 자기 턴 수 */
  readonly turnsTaken: number;
  /** 연속으로 아무것도 먹지 못한 턴 수 (E14 허당) */
  readonly noCaptureStreak: number;
  /** 국진 '매번 묻기' 모드에서 쌍피로 쓰기로 했는지 (S5). 자동 모드에서는 무시 */
  readonly gukjinAsPi: boolean;
  /** 현재 점수 (국진 자동 최적 반영) */
  readonly score: ScoreBreakdown;
}

/**
 * 바닥 무더기. 월마다 최대 하나.
 * loose: 1~2장(2장이면 낼 때 대상 선택), ppeok: 뻑 무더기(같은 월 3장 + 묻힌 보너스, owner = 싼 좌석),
 * natural: 분배 때 생긴 같은 월 3장(자연뻑, R7).
 */
export interface FloorGroup {
  readonly month: Month;
  readonly cards: readonly CardId[];
  readonly kind: 'loose' | 'ppeok' | 'natural';
  readonly owner: Seat | null;
}

/** 응답을 기다리는 입력 (spec 4.3 PROMPT_*, 그리고 평상시의 "카드 내기"). 응답 전에는 다른 액션을 거부한다. */
export type Pending =
  | { readonly kind: 'pickFirst'; readonly seats: readonly Seat[] }
  | {
      readonly kind: 'chongtong';
      readonly seat: Seat;
      readonly months: readonly Month[];
      readonly resume: 'deal' | 'turn';
    }
  | { readonly kind: 'play'; readonly seat: Seat }
  | { readonly kind: 'shake'; readonly seat: Seat; readonly card: CardId; readonly month: Month }
  | {
      readonly kind: 'target';
      readonly seat: Seat;
      readonly source: 'play' | 'flip';
      readonly card: CardId;
      readonly options: readonly CardId[];
    }
  | { readonly kind: 'gukjin'; readonly seat: Seat }
  | { readonly kind: 'goStop'; readonly seat: Seat; readonly score: number };

export type PendingKind = Pending['kind'];

/** 진행 중인 턴의 중간 결과 (MATCH_PLAY → FLIP → MATCH_FLIP → RESOLVE 사이에 프롬프트로 멈출 수 있어 상태에 둔다). */
export interface TurnCtx {
  readonly seat: Seat;
  /** 이 좌석의 몇 번째 턴인지 (1부터) */
  readonly index: number;
  /** 이 턴이 끝나면 손패(+폭탄패)가 0장인지: 쪽·따닥·쓸·뻑 예외 (12.8) */
  readonly lastTurn: boolean;
  readonly mode: 'card' | 'bomb' | 'flipOnly';
  /** 낸 카드 (폭탄·폭탄패 턴이면 null) */
  readonly played: CardId | null;
  /** 낸 카드의 월에 있던 바닥 장수 (0~2 낱장, 3 = 뻑/자연뻑 무더기) */
  readonly playBefore: number;
  /** 바닥 2장 중 선택한 대상 */
  readonly playTarget: CardId | null;
  /** 뒤집어서 나온 보너스(뻑이 나면 묻힌다, B2) */
  readonly heldBonuses: readonly CardId[];
  /** 마지막으로 뒤집은 일반 카드 */
  readonly flipped: CardId | null;
  readonly flipTarget: CardId | null;
  /** 이번 턴에 무엇이든 먹었는지 (쓸·허당 판정) */
  readonly capturedAny: boolean;
  /** 이번 턴에 국진을 먹었는지 (국진 '매번 묻기') */
  readonly gukjinCaptured: boolean;
}

export type EndReason =
  | 'stop'
  | 'autoStop'
  | 'threePpeok'
  | 'chongtong'
  | 'floorChongtong'
  | 'bothChongtong'
  | 'hudang'
  | 'exhausted';

export interface RoundResult {
  readonly reason: EndReason;
  readonly winner: Seat | null;
}

export type InstantPayoutKind = 'firstPpeok' | 'secondPpeok' | 'thirdPpeok' | 'firstTtadak';

/** 즉시 정산 (E4·E6). 점수와 별도, 배수 미적용. */
export interface InstantPayout {
  readonly kind: InstantPayoutKind;
  /** 받는 좌석 */
  readonly to: Seat;
  readonly from: Seat;
  readonly points: number;
}

/** 첫 판 선 고르기 (R4) */
export interface FirstPickState {
  /** 바닥에 엎어 둔 후보 카드 (보는 사람에게는 가려진다) */
  readonly pool: readonly CardId[];
  readonly picks: readonly [number | null, number | null];
  /** 동월로 다시 고른 횟수 */
  readonly ties: number;
  /** 테스트용 고정 후보 목록(남은 것) */
  readonly nextPools: readonly (readonly CardId[])[];
  readonly isNight: boolean;
}

export interface RoundInfo {
  /** 세션 안의 판 번호(1부터). 대박판 판정용 */
  readonly number: number;
  /** 이번 판에 적용되는 나가리 배수 (G9) */
  readonly carry: number;
  /** 테스트용 고정 덱(없으면 셔플) */
  readonly fixedDeck: readonly CardId[] | null;
}

export interface GameState {
  readonly phase: Phase;
  readonly rules: RuleOptions;
  readonly rng: RngState;
  /** 선. 첫 판 선 고르기 전에는 null */
  readonly dealer: Seat | null;
  /** 현재 턴 좌석 */
  readonly turn: Seat;
  readonly seats: readonly [SeatState, SeatState];
  readonly floor: readonly FloorGroup[];
  /** 더미. 0번이 맨 위 */
  readonly deck: readonly CardId[];
  readonly pending: Pending | null;
  readonly ctx: TurnCtx | null;
  readonly firstPick: FirstPickState | null;
  readonly round: RoundInfo;
  readonly instantPayouts: readonly InstantPayout[];
  readonly result: RoundResult | null;
  /** 다음 이벤트 순번 */
  readonly eventSeq: number;
}

export type Action =
  | { readonly type: 'pickFirst'; readonly seat: Seat; readonly index: number }
  | { readonly type: 'chongtong'; readonly seat: Seat; readonly choice: 'end' | 'continue' }
  | { readonly type: 'play'; readonly seat: Seat; readonly card: CardId }
  | { readonly type: 'bomb'; readonly seat: Seat; readonly month: Month }
  | { readonly type: 'flipOnly'; readonly seat: Seat }
  | { readonly type: 'shake'; readonly seat: Seat; readonly accept: boolean }
  | { readonly type: 'chooseTarget'; readonly seat: Seat; readonly card: CardId }
  | { readonly type: 'gukjin'; readonly seat: Seat; readonly asPi: boolean }
  | { readonly type: 'go'; readonly seat: Seat }
  | { readonly type: 'stop'; readonly seat: Seat };

export type ActionType = Action['type'];

export type StealReason =
  | 'bonus'
  | 'ppeokTaken'
  | 'selfPpeok'
  | 'naturalPpeok'
  | 'ttadak'
  | 'jjok'
  | 'sseul'
  | 'bomb';

/** 정산 단계 (code-refs 6.2: 기본 → 고 가산 → 고 배수 → 흔들기·폭탄 → 박 → 나가리 이월 → 대박판) */
export type SettleStepKind =
  | 'base'
  | 'goBonus'
  | 'goMultiplier'
  | 'shake'
  | 'bomb'
  | 'piBak'
  | 'gwangBak'
  | 'meongtta'
  | 'goBak'
  | 'nagariCarry'
  | 'jackpot';

export interface SettleStep {
  readonly kind: SettleStepKind;
  /** add: 점수에 더함, mul: 점수에 곱함 */
  readonly op: 'add' | 'mul';
  readonly value: number;
  /** 이 단계까지 적용한 점수 */
  readonly total: number;
}

export interface Settlement {
  readonly reason: EndReason;
  readonly winner: Seat | null;
  readonly loser: Seat | null;
  readonly steps: readonly SettleStep[];
  /** 가산 단계의 합 */
  readonly basePoints: number;
  /** 곱 단계의 곱 */
  readonly multiplier: number;
  /** basePoints × multiplier */
  readonly finalPoints: number;
  /** 다음 판 나가리 배수 (G9) */
  readonly nextCarry: number;
  /** 다음 판 선 (R5) */
  readonly nextDealer: Seat;
  /** 이 판의 즉시 정산 목록 (이미 발생 시점에 원장에 반영할 것) */
  readonly instantPayouts: readonly InstantPayout[];
  /** 정산에 쓴 국진 위치 [좌석0, 좌석1] */
  readonly gukjinAsPi: readonly [boolean, boolean];
}

interface EventBase {
  /** 이벤트 순번 (spec 4.5, NP-03) */
  readonly seq: number;
  readonly seat: Seat | null;
  readonly cards: readonly CardId[];
}

type EventPayload =
  | {
      readonly type: 'Dealt';
      readonly dealer: Seat;
      readonly handCounts: readonly [number, number];
      readonly deckCount: number;
    }
  | { readonly type: 'Redealt' }
  | { readonly type: 'FirstPicked'; readonly picks: readonly [CardId, CardId] }
  | { readonly type: 'FirstPickTie'; readonly ties: number }
  | { readonly type: 'FirstPickerChosen'; readonly reason: 'month' | 'bonus' | 'random' }
  | { readonly type: 'CardPlayed'; readonly bonus: boolean }
  | { readonly type: 'CardDrawn' }
  | { readonly type: 'CardFlipped' }
  | { readonly type: 'Matched'; readonly source: 'play' | 'flip'; readonly target: CardId }
  /** 낸 패·뒤집은 패가 먹지 못하고 바닥에 놓임 (M1 리뷰 F-8: UI가 Matched 부재로 추론하지 않게) */
  | { readonly type: 'Placed'; readonly source: 'play' | 'flip' }
  | { readonly type: 'Captured'; readonly to: Seat }
  | { readonly type: 'Ppeok'; readonly count: number; readonly turnIndex: number }
  | { readonly type: 'PpeokTaken'; readonly pileOwner: Seat | null; readonly natural: boolean }
  | { readonly type: 'SelfPpeok' }
  | { readonly type: 'Jjok' }
  | { readonly type: 'Ttadak' }
  | { readonly type: 'Sseul' }
  | { readonly type: 'Bomb'; readonly month: Month; readonly handCards: number }
  /** 흔들기(E11). 공개 이벤트이므로 흔든 경우에만 낸다(accepted는 항상 true, 호환용 필드) */
  | { readonly type: 'Shake'; readonly month: Month; readonly accepted: boolean }
  /** 총통 끝내기(end)·계속하기 불허 즉시 승리(auto). 계속하기(continue)는 숨기므로 엔진이 내지 않는다(F-6) */
  | {
      readonly type: 'Chongtong';
      readonly months: readonly Month[];
      readonly choice: 'end' | 'continue' | 'auto';
    }
  | { readonly type: 'BonusGained'; readonly source: 'hand' | 'flip' | 'floor' | 'deal' }
  | {
      readonly type: 'PiStolen';
      readonly from: Seat;
      readonly to: Seat;
      readonly reason: StealReason;
    }
  | {
      readonly type: 'InstantPayout';
      readonly kind: InstantPayoutKind;
      readonly points: number;
      readonly from: Seat;
    }
  | { readonly type: 'ScoreChanged'; readonly breakdown: ScoreBreakdown }
  | { readonly type: 'GukjinPlaced'; readonly asPi: boolean }
  | { readonly type: 'GoStopPrompt'; readonly score: number }
  | { readonly type: 'Go'; readonly count: number; readonly score: number }
  | { readonly type: 'Stop'; readonly auto: boolean }
  | { readonly type: 'Hudang' }
  | { readonly type: 'RoundEnded'; readonly reason: EndReason; readonly winner: Seat | null }
  | { readonly type: 'Settled'; readonly settlement: Settlement }
  | { readonly type: 'Nagari'; readonly multiplier: number };

/** 엔진 이벤트 (spec 4.5). 모든 이벤트는 순번·좌석·관련 카드 ID를 가진다. */
export type EngineEvent = EventBase & EventPayload;

export type EngineEventType = EngineEvent['type'];

/** 이벤트 페이로드(순번 제외). 엔진 내부에서 이벤트를 만들 때 쓴다. */
export type EventInput = Omit<EventBase, 'seq'> & EventPayload;

/** 규칙상 거부 사유. reduce는 규칙 위반에 예외를 던지지 않고 이 값을 돌려준다. */
export type RejectReason = 'roundOver' | 'notYourTurn' | 'illegalAction';

export type ReduceResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly EngineEvent[] }
  | { readonly ok: false; readonly reason: RejectReason; readonly message: string };
