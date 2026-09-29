// 화면이 받는 뷰 데이터 타입의 단일 정의 (plan.md "M3 준비 결과가 M4에 넘기는 입력", spec 6.1·6.2).
// 호스트는 좌석 1(게스트)에게 이 BoardView를 보내고, 좌석 0 화면도 같은 타입으로 그린다(HostSession.hostView()).
// 필드 이름은 packages/engine의 PlayerView·SeatView·FloorGroup·Pending·SettleStep과 되도록 같게 맞췄다.
// 엔진에 없는 값(이름, 잔액, 족보 진행도, 현재 배수)은 view.ts의 toBoardView가 계산한다.
// packages/web/fixtures/*.json(개발 갤러리·스크린샷 입력)이 BoardViewCore를 따른다(web src/lib/fixtures.test.ts가 검사).

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
  readonly bombs?: number | null;
  readonly gukjinAsPi?: boolean;
  /** 규칙상 이미 공개되어 상대도 아는 손패 */
  readonly revealed?: readonly CardId[];
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

/** 게임판 화면 입력 중 M3 솔로 화면이 처음부터 쓰던 부분 (fixtures·갤러리 호환) */
export interface BoardViewCore {
  readonly viewer: Seat;
  readonly turn: Seat;
  readonly seats: readonly [SeatView, SeatView];
  readonly floor: readonly FloorGroupView[];
  readonly deckCount: number;
  /** 지금 스톱하면 적용될 배수 (spec 6.1 "현재 배수"). 보는 좌석 기준: 스톱 미리보기가 있으면 그 배수, 아니면 흔들기·폭탄·고·이월·대박판의 곱 */
  readonly multiplier: number;
  readonly pending: PromptView | null;
  /** 보는 좌석이 지금 낼 수 있는 손패 (FR-12 하이라이트, legal의 play에서 뽑은 중복 없는 목록) */
  readonly playable: readonly CardId[];
  readonly round: number;
  /** 이번 판에 적용되는 연속 밀기 횟수 */
  readonly pushes?: number;
  /** 마지막으로 반영한 이벤트 순번 (NP-03) */
  readonly eventSeq: number;
}

/** 선 고르기(R4): 보는 좌석이 고를 차례일 때 후보 장수와 상대가 이미 고른 자리 */
export interface FirstPickPrompt {
  readonly poolSize: number;
  readonly taken: number | null;
}

/**
 * 진행 중인 턴에서 아직 바닥에 놓이지 않은 카드 (spec 4.3 MATCH_PLAY·MATCH_FLIP의 대상 고르기 동안).
 * 엔진은 낸 패·뒤집은 패·들고 있는 보너스를 턴 작업 공간(ctx)에 두므로 floor에 없다. 화면은 낸 패를 그 월 무더기 위에,
 * 뒤집은 패·들고 있는 보너스를 더미 옆 뒤집기 자리에 둔다.
 */
export interface InFlight {
  readonly played: CardId | null;
  readonly staged: readonly CardId[];
}

/** 고/스톱 모달의 스톱 미리보기 분해 (FR-14, 엔진 stopPreview) */
export interface GoStopDetail {
  /** 스톱하면 받을 최종 점수 */
  readonly points: number;
  readonly steps: readonly SettleStepView[];
  readonly multiplier: number;
  /** 원장 상한까지 적용한 실제 금액 */
  readonly money: number | null;
  /** 상대 잔액 부족으로 줄었는지 (올인, MN-02) */
  readonly capped: boolean;
}

/** 엔진 판 단계 (선 고르기 → 턴 → 종료) */
export type RoundPhase = 'chooseFirst' | 'turn' | 'end';

/** M3 BoardExtras·inFlightOf를 흡수한 상세 입력 정보 (#12). 게스트는 이것만으로 한 판을 끝낼 수 있어야 한다 */
export interface BoardViewDetail {
  /** 보는 좌석의 합법 수 (엔진 playerView.legal 그대로). 게스트 UI는 이 목록 안에서만 액션을 만든다 */
  readonly legal: readonly Action[];
  readonly firstPick: FirstPickPrompt | null;
  readonly inFlight: InFlight;
  /** 보는 좌석의 고/스톱 프롬프트일 때만 값이 있다 */
  readonly goStop: GoStopDetail | null;
  /** 폭탄(E9·E10)을 할 수 있는 월 */
  readonly bombMonths: readonly Month[];
  /** 폭탄패로 뒤집기만 할 수 있는지 (E9) */
  readonly canFlipOnly: boolean;
  readonly dealer: Seat | null;
  readonly phase: RoundPhase;
}

/** 게임판 화면 입력 = M3 솔로 어댑터(BoardView + BoardExtras + InFlight)의 상위 집합 */
export interface BoardView extends BoardViewCore, BoardViewDetail {}

// ---- 이벤트 ----
// 애니메이션·로그의 단일 근거는 엔진 이벤트(ProtocolEvent = EngineEvent, view.ts)다.
// 아래 UiEvent는 M3 배너·픽스처(web src/ui/banner.ts, fixtures/board.json)가 아직 쓰므로 남겨 둔 옛 이름표다(리뷰 L-5).
// @deprecated 새 코드는 ProtocolEvent를 쓴다.

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
  readonly origin?: 'push';
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
  readonly gukjinAsPi?: readonly [boolean, boolean];
  readonly pushed?: boolean;
  readonly forfeitedPoints?: number;
  readonly nextPushes?: number;
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
