// 테스트·시뮬레이션 전용 도우미 (`@p2p-gostop/engine/testing`, M1 리뷰 F-10).
// 게임 코드(web·protocol)는 이 하위 경로를 쓰지 않는다. 호환을 위해 루트 내보내기에도 당분간 남겨 둔다.
export { collectCards, createScenario, type ScenarioSetup, type SeatCounters } from './scenario.ts';
