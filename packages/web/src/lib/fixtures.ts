// 개발 갤러리·테스트용 픽스처 (packages/web/fixtures/*.json)를 잠정 뷰 타입으로 읽는다.
// JSON 모듈의 추론 타입은 문자열 리터럴 유니온을 string으로 넓히므로 캐스팅하고, 모양은 fixtures.test.ts가 검사한다.
import boardJson from '../../fixtures/board.json';
import diagnosticsJson from '../../fixtures/diagnostics.json';
import guestJoinJson from '../../fixtures/guest-join.json';
import hostRoomJson from '../../fixtures/host-room.json';
import recordsJson from '../../fixtures/records.json';
import settingsJson from '../../fixtures/settings.json';
import settlementJson from '../../fixtures/settlement.json';
import type {
  BoardView,
  DiagnosticsView,
  GuestJoinView,
  HostRoomView,
  RecordsView,
  SettingsView,
  SettlementView,
  UiEvent,
} from './view-types.ts';

export type BoardStateName = 'play' | 'target' | 'goStop';

export interface BoardFixture {
  /** 이 판의 카드 수 (보너스 3장 = 51) */
  readonly totalCards: number;
  readonly states: Readonly<Record<BoardStateName, BoardView>>;
  /** 배너 견본 이벤트 (spec 4.5 이름) */
  readonly events: readonly UiEvent[];
}

export const fixtures = {
  board: boardJson as unknown as BoardFixture,
  settlement: settlementJson as unknown as SettlementView,
  records: recordsJson as unknown as RecordsView,
  hostRoom: hostRoomJson as unknown as HostRoomView,
  guestJoin: guestJoinJson as unknown as GuestJoinView,
  settings: settingsJson as unknown as SettingsView,
  diagnostics: diagnosticsJson as unknown as DiagnosticsView,
} as const;
