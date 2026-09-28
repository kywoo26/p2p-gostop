// M4: 화면 계약의 단일 정의는 protocol 패키지에 있다.
export type * from '@p2p-gostop/protocol';
import type { BoardViewCore, BoardViewDetail } from '@p2p-gostop/protocol';

/**
 * 전환기 별칭: protocol의 BoardView는 상세 필드(legal·firstPick·inFlight·goStop·bombMonths·canFlipOnly·dealer·phase)가
 * 필수지만, M3 솔로 어댑터(game/adapter.ts)와 fixtures는 아직 기본 필드만 채운다. I1 통합에서 어댑터를 protocol의
 * toBoardView로 바꾸면 이 별칭을 지우고 protocol의 BoardView를 그대로 쓴다.
 */
export type BoardView = BoardViewCore & Partial<BoardViewDetail>;
