// 게임판 브라우저 테스트용 무작위 대국 (Board.property.test.ts, Board.prompts.test.ts).
// 세션 모델(game/session.ts)로 두 좌석 모두 시드 고정 무작위 합법 수를 두고, 좌석 0이 보는 게임판 props를 만든다.
import {
  legalActions,
  playerView,
  type GameState,
  type RuleOptions,
  type Seat,
} from '@p2p-gostop/engine';
import { inFlightOf, toBoardExtras, toBoardView } from '../game/adapter.ts';
import { snap } from '../game/display.ts';
import {
  actingSeats,
  createSession,
  refill,
  sessionAct,
  startNextRound,
  type SessionState,
} from '../game/session.ts';

export const VIEWER: Seat = 0;

function lcg(seed: number) {
  let x = seed >>> 0;
  return (n: number) => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x % n;
  };
}

/** 좌석 0이 보는 게임판 props (솔로 세션과 같은 어댑터·스냅 경로) */
export function boardProps(game: GameState, balances: readonly [number, number] = [0, 0]) {
  const view = playerView(game, VIEWER);
  return {
    view: snap(toBoardView(view, { names: ['나', '상대'], balances }), inFlightOf(view)),
    extras: toBoardExtras(view),
  };
}

/**
 * 무작위 합법 수로 세션을 rounds판 진행하며 매 액션 뒤 상태를 넘긴다.
 * 국진 묻기에서는 쌍피를 골라 "국진을 쌍피로 세는" 화면이 나오게 한다.
 */
export function* playRandom(
  seed: number,
  rules: RuleOptions,
  rounds: number,
): Generator<SessionState> {
  const pick = lcg(seed);
  let session: SessionState = createSession({
    preset: 'standard',
    rules,
    perPoint: 100,
    startBalance: 3000,
    names: ['나', '상대'],
    seed,
  }).session;
  yield session;
  for (let guard = 0; guard < 20_000 && session.records.length < rounds; guard++) {
    if (session.phase === 'bankrupt') {
      session = refill(session);
      continue;
    }
    if (session.phase === 'roundOver') {
      session = startNextRound(session).session;
      yield session;
      continue;
    }
    const seat = actingSeats(session.game)[0];
    if (seat === undefined) throw new Error('입력할 좌석이 없습니다');
    const legal = legalActions(session.game, seat);
    const action = legal.find((a) => a.type === 'gukjin' && a.asPi) ?? legal[pick(legal.length)];
    if (action === undefined) throw new Error('합법 수가 없습니다');
    const step = sessionAct(session, action);
    if (!step.ok) throw new Error(step.message);
    session = step.session;
    yield session;
  }
}
