// 화면이 받는 뷰 데이터 타입 — **잠정(provisional)**.
// packages/protocol(M4)이 생기면 그 패키지의 playerView 계약 타입으로 바꾸고 이 파일은 지운다.
// 필드 이름은 packages/engine의 PlayerView·SeatView·FloorGroup·Pending·SettleStep과 되도록 같게 맞췄다.
// 엔진에 없는 값(이름, 잔액, 족보 진행도, 현재 배수)은 UI가 계산하거나 호스트가 덧붙일 값이다.
// fixtures/*.json(개발 갤러리·스크린샷 입력)이 이 타입을 따른다(src/lib/fixtures.test.ts가 검사).

import type { Action } from '@p2p-gostop/engine';

/** 카드 ID 0~50 (엔진 카탈로그). 0~47 기본, 48·49 보너스 2피, 50 보너스 3피 */
export type CardId = number;
/** 좌석 인덱스. 이름(human/computer)을 쓰지 않는다 (AGENTS.md 3장) */
export type Seat = 0 | 1;
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface CapturedView {
  readonly gwang: readonly CardId[];
  readonly yeol: readonly CardId[];
  readonly tti: readonly CardId[];
  /** 일반피·쌍피·보너스 */
  readonly pi: readonly CardId[];
}

/** 족보 진행도 (spec 6.1: 광 n/3, 고도리 n/3, 단 n/3, 피 n/10) */
export interface JokboProgress {
  readonly gwang: number;
  readonly godori: number;
  /** 홍단·청단·초단 중 가장 많이 모은 것의 장수 */
  readonly dan: number;
  /** 피 가치 합 (쌍피 2, 보너스 2·3) */
  readonly pi: number;
}

export interface SeatView {
  readonly name: string;
  readonly handCount: number;
  /** 보는 좌석 자신의 손패만. 상대는 null (spec 4.5 "손패 ID를 가린다") */
  readonly hand: readonly CardId[] | null;
  readonly captured: CapturedView;
  /** 현재 족보 점수 합 */
  readonly score: number;
  readonly goCount: number;
  readonly shakes: number;
  readonly ppeokCount: number;
  /** 가상 머니 잔액 (MN-01, 단위는 설정) */
  readonly balance: number;
  readonly progress: JokboProgress;
}

export interface FloorGroupView {
  readonly month: Month;
  readonly cards: readonly CardId[];
  /** loose: 1~2장, ppeok: 뻑 무더기(owner = 싼 좌석), natural: 분배 때 생긴 같은 월 3장 */
  readonly kind: 'loose' | 'ppeok' | 'natural';
  readonly owner: Seat | null;
}

/** 응답을 기다리는 입력 (spec 4.3 PROMPT_*) */
export type PromptView =
  | { readonly kind: 'play'; readonly seat: Seat }
  | {
      readonly kind: 'target';
      readonly seat: Seat;
      readonly source: 'play' | 'flip';
      /** 낸(또는 뒤집은) 카드 */
      readonly card: CardId;
      /** 먹을 수 있는 바닥 카드 2장 */
      readonly options: readonly CardId[];
    }
  | {
      readonly kind: 'goStop';
      readonly seat: Seat;
      readonly score: number;
      readonly goCount: number;
      /** 지금 스톱하면 받을 금액 (UI 안내용) */
      readonly stopAmount: number;
    }
  | { readonly kind: 'shake'; readonly seat: Seat; readonly card: CardId; readonly month: Month }
  | { readonly kind: 'gukjin'; readonly seat: Seat }
  | { readonly kind: 'chongtong'; readonly seat: Seat; readonly months: readonly Month[] };

// STUB(I1, fix/protocol-review가 대체): 아래 필드는 fix/protocol-review가 공지한 이름 그대로 임시로 넣는다.
// feat/m4-integration PR 전에 이 커밋을 버리고 fix/protocol-review를 병합한다.
/** 고/스톱 모달의 스톱 미리보기 분해 (FR-14) */
export interface GoStopDetail {
  readonly points: number;
  readonly steps: readonly SettleStepView[];
  readonly multiplier: number;
  readonly money: number | null;
  readonly capped: boolean;
}

/** 대상 고르기 동안 손을 떠났지만 아직 바닥에 놓이지 않은 카드 (모두 공개 카드) */
export interface InFlight {
  readonly played: CardId | null;
  readonly staged: readonly CardId[];
}

/** 게임판 화면 입력 */
export interface BoardView {
  readonly viewer: Seat;
  readonly turn: Seat;
  readonly seats: readonly [SeatView, SeatView];
  readonly floor: readonly FloorGroupView[];
  readonly deckCount: number;
  /** 지금 스톱하면 적용될 배수 (흔들기·폭탄·나가리 이월 등의 곱, spec 6.1 "현재 배수") */
  readonly multiplier: number;
  readonly pending: PromptView | null;
  /** 보는 좌석이 지금 낼 수 있는 손패 (FR-12 하이라이트) */
  readonly playable: readonly CardId[];
  readonly round: number;
  /** 마지막으로 반영한 이벤트 순번 (NP-03) */
  readonly eventSeq: number;
  /** 보는 좌석의 합법 수 */
  readonly legal: readonly Action[];
  /** 선 고르기: 내가 고를 차례면 후보 장수와 상대가 이미 고른 자리 */
  readonly firstPick: { readonly poolSize: number; readonly taken: number | null } | null;
  readonly inFlight: InFlight;
  readonly goStop: GoStopDetail | null;
  readonly bombMonths: readonly Month[];
  readonly canFlipOnly: boolean;
  readonly dealer: Seat | null;
}

// ---- 이벤트 (spec 4.5 이름 그대로). 좌석·관련 카드 ID·순번을 가진다 ----

interface EventBase {
  readonly seq: number;
  readonly seat: Seat | null;
  readonly cards: readonly CardId[];
}

type SimpleEventType =
  | 'Dealt'
  | 'FirstPickerChosen'
  | 'CardPlayed'
  | 'CardFlipped'
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
  | 'ScoreChanged'
  | 'GoStopPrompt'
  | 'Stop';

export type UiEvent = EventBase &
  (
    | { readonly type: SimpleEventType }
    | { readonly type: 'Matched'; readonly target: CardId }
    | { readonly type: 'Captured'; readonly to: Seat }
    | { readonly type: 'PiStolen'; readonly from: Seat; readonly to: Seat; readonly card: CardId }
    | {
        readonly type: 'InstantPayout';
        readonly kind: 'firstPpeok' | 'secondPpeok' | 'thirdPpeok' | 'firstTtadak';
        readonly points: number;
      }
    | { readonly type: 'Go'; readonly n: number }
    | { readonly type: 'RoundEnded'; readonly reason: string }
    | { readonly type: 'Settled'; readonly amount: number }
    | { readonly type: 'Nagari'; readonly multiplier: number }
  );

export type UiEventType = UiEvent['type'];

// ---- 정산 (spec 6.2 "점수 분해 표, 배수 체인, 금액, 잔액 변화") ----

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

export interface SettleStepView {
  readonly kind: SettleStepKind;
  readonly op: 'add' | 'mul';
  readonly value: number;
  /** 이 단계까지 적용한 점수 */
  readonly total: number;
}

export type ScoreRowKind =
  | 'gwang'
  | 'yeol'
  | 'godori'
  | 'tti'
  | 'hongdan'
  | 'cheongdan'
  | 'chodan'
  | 'pi';

export interface SettlementView {
  readonly winner: Seat | null;
  readonly loser: Seat | null;
  readonly reason: 'stop' | 'autoStop' | 'threePpeok' | 'chongtong' | 'exhausted' | 'hudang';
  readonly names: readonly [string, string];
  /** 승자 족보 점수 분해 (0점 항목은 빼도 된다) */
  readonly breakdown: readonly { readonly kind: ScoreRowKind; readonly points: number }[];
  readonly steps: readonly SettleStepView[];
  readonly finalPoints: number;
  /** 점당 금액 */
  readonly pointValue: number;
  readonly amount: number;
  readonly unit: MoneyUnit;
  readonly balances: readonly [BalanceChange, BalanceChange];
}

export interface BalanceChange {
  readonly before: number;
  readonly after: number;
}

/** 가상 단위 (MN-06: 기본 "냥") */
export type MoneyUnit = '냥' | '원' | '점';

// ---- 그 밖의 화면 (spec 6.2) ----

export interface HostRoomView {
  readonly hotspot: {
    readonly state: 'starting' | 'on' | 'failed' | 'off';
    readonly ssid: string;
    readonly password: string;
    readonly ip: string;
    readonly port: number;
  };
  /** Wi-Fi QR 문자열 (WIFI:T:WPA;S:..;P:..;;) — QR 그림은 M4에서 uqr로 그린다 */
  readonly wifiQr: string;
  readonly url: string;
  readonly guest: { readonly name: string; readonly connected: boolean } | null;
  readonly rules: {
    readonly preset: string;
    readonly pointValue: number;
    readonly unit: MoneyUnit;
  };
}

export interface GuestJoinView {
  readonly name: string;
  readonly connection: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
  readonly host: string;
  readonly showAddToHomeScreen: boolean;
}

export interface RecordRow {
  readonly round: number;
  readonly winner: Seat | null;
  readonly reason: SettlementView['reason'] | 'nagari';
  readonly points: number;
  /** 좌석 0 기준 금액 변화 (+ 받음, − 줌) */
  readonly amount: number;
}

export interface RecordsView {
  readonly names: readonly [string, string];
  readonly unit: MoneyUnit;
  readonly rows: readonly RecordRow[];
  readonly startBalance: number;
}

export type SpeedSetting = 'normal' | 'fast' | 'very-fast';

export interface SettingsView {
  readonly preset: 'traditional' | 'standard' | 'arcade';
  readonly toggles: readonly {
    readonly id: string;
    readonly label: string;
    readonly on: boolean;
  }[];
  readonly pointValue: number;
  readonly unit: MoneyUnit;
  readonly speed: SpeedSetting;
  readonly sound: boolean;
  readonly vibration: boolean;
}

export interface DiagnosticsView {
  readonly buildId: string;
  readonly device: string;
  readonly mode: 'host' | 'guest' | 'solo';
  readonly checks: readonly {
    readonly label: string;
    readonly status: 'ok' | 'warn' | 'fail';
    readonly detail: string;
  }[];
  readonly log: readonly {
    readonly t: string;
    readonly level: 'info' | 'warn' | 'error';
    readonly msg: string;
  }[];
}
