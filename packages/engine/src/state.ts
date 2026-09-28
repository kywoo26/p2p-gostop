// 엔진 상태·액션·이벤트 타입 (plan.md 1.4, spec 4.3·4.5).
// TODO(M1, spec 4.3): 상태 기계의 phase·pending 세부 필드와 액션·이벤트 페이로드를 규칙 벡터와 함께 확정한다.
import type { CardId } from './cards.ts';
import type { RngState } from './rng.ts';
import type { RuleOptions } from './rules.ts';

/** 좌석 인덱스. 이름(human/computer)을 쓰지 않는다 (AGENTS.md 3장). */
export type Seat = 0 | 1;

/** spec 4.3 RoundPhase */
export type Phase = 'deal' | 'chooseFirst' | 'turn' | 'end' | 'settle' | 'nagari';

/** spec 4.3 TURN 내부 단계 */
export type TurnStep =
  | 'prePlay'
  | 'play'
  | 'matchPlay'
  | 'flip'
  | 'matchFlip'
  | 'resolve'
  | 'score'
  | 'next';

export interface CapturedPile {
  readonly gwang: readonly CardId[];
  readonly yeol: readonly CardId[];
  readonly tti: readonly CardId[];
  readonly pi: readonly CardId[];
}

export interface SeatState {
  readonly hand: readonly CardId[];
  readonly captured: CapturedPile;
  readonly goCount: number;
  readonly shakes: number;
  readonly score: number;
}

/** 응답을 기다리는 선택 (spec 4.3 PROMPT_*). 응답 전에는 다른 액션을 거부한다. */
export type Pending =
  | { readonly kind: 'shake'; readonly seat: Seat }
  | { readonly kind: 'target'; readonly seat: Seat; readonly options: readonly CardId[] }
  | { readonly kind: 'goStop'; readonly seat: Seat }
  | { readonly kind: 'gukjin'; readonly seat: Seat }
  | { readonly kind: 'chongtong'; readonly seat: Seat };

export interface GameState {
  readonly phase: Phase;
  readonly step: TurnStep | null;
  readonly turn: Seat;
  readonly seats: readonly [SeatState, SeatState];
  readonly floor: readonly CardId[];
  readonly deck: readonly CardId[];
  readonly ppeokPiles: readonly (readonly CardId[])[];
  readonly pending: Pending | null;
  readonly rules: RuleOptions;
  readonly rng: RngState;
  readonly history: readonly Action[];
}

export type Action =
  | { readonly type: 'play'; readonly seat: Seat; readonly card: CardId }
  | { readonly type: 'chooseTarget'; readonly seat: Seat; readonly card: CardId }
  | { readonly type: 'shake'; readonly seat: Seat; readonly accept: boolean }
  | { readonly type: 'go'; readonly seat: Seat }
  | { readonly type: 'stop'; readonly seat: Seat };

/** spec 4.5 이벤트 이름. 페이로드는 M1에서 확정한다. */
export type EngineEventType =
  | 'Dealt'
  | 'FirstPickerChosen'
  | 'CardPlayed'
  | 'CardFlipped'
  | 'Matched'
  | 'Captured'
  | 'Ppeok'
  | 'PpeokTaken'
  | 'SelfPpeok'
  | 'Jjok'
  | 'Ttadak'
  | 'Sseul'
  | 'Bomb'
  | 'Shake'
  | 'Chongtong'
  | 'BonusGained'
  | 'PiStolen'
  | 'InstantPayout'
  | 'ScoreChanged'
  | 'GoStopPrompt'
  | 'Go'
  | 'Stop'
  | 'RoundEnded'
  | 'Settled'
  | 'Nagari';

export interface EngineEvent {
  readonly type: EngineEventType;
  /** 이벤트 순번 (spec 4.5, NP-03) */
  readonly seq: number;
  readonly seat: Seat | null;
  readonly cards: readonly CardId[];
}

/** 정산 단계 (code-refs 6.2: 기본 → 고 → 고 배수 → 흔들기·폭탄 → 박 → 나가리 이월) */
export interface SettleStep {
  readonly label: string;
  readonly factor: number;
}

export interface Settlement {
  readonly winner: Seat | null;
  readonly steps: readonly SettleStep[];
  readonly amount: number;
}
