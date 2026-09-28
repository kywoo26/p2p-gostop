// 개발 갤러리 픽스처가 잠정 뷰 타입과 게임 규칙상 말이 되는지 검사한다(카드 보존, 족보 진행도, 정산 체인).
import { getCard } from '@p2p-gostop/engine';
import { describe, expect, test } from 'vitest';
import { fixtures } from './fixtures.ts';
import type { BoardView, CapturedView, CardId, JokboProgress, UiEventType } from './view-types.ts';

/** spec 4.5 이벤트 이름 */
const SPEC_EVENTS: readonly UiEventType[] = [
  'Dealt',
  'FirstPickerChosen',
  'CardPlayed',
  'CardFlipped',
  'Matched',
  'Captured',
  'Ppeok',
  'PpeokTaken',
  'SelfPpeok',
  'Jjok',
  'Ttadak',
  'Sseul',
  'Bomb',
  'Shake',
  'Chongtong',
  'BonusGained',
  'PiStolen',
  'InstantPayout',
  'ScoreChanged',
  'GoStopPrompt',
  'Go',
  'Stop',
  'RoundEnded',
  'Settled',
  'Nagari',
];

function capturedIds(c: CapturedView): CardId[] {
  return [...c.gwang, ...c.yeol, ...c.tti, ...c.pi];
}

function progressOf(c: CapturedView): JokboProgress {
  const ids = capturedIds(c);
  const ribbons = ids.map((id) => getCard(id).ribbon);
  const dan = Math.max(
    ...(['hong', 'cheong', 'cho'] as const).map((r) => ribbons.filter((x) => x === r).length),
  );
  return {
    gwang: c.gwang.length,
    godori: ids.filter((id) => getCard(id).isGodori).length,
    dan,
    pi: c.pi.reduce((sum, id) => sum + getCard(id).piValue, 0),
  };
}

function visibleIds(view: BoardView): CardId[] {
  const ids = [
    ...view.seats.flatMap((s) => [...(s.hand ?? []), ...capturedIds(s.captured)]),
    ...view.floor.flatMap((g) => g.cards),
  ];
  // 대상 고르기 중인 낸 카드는 손을 떠나 아직 바닥에 놓이지 않았다
  if (view.pending?.kind === 'target' && !ids.includes(view.pending.card))
    ids.push(view.pending.card);
  return ids;
}

describe('fixtures/board.json', () => {
  const { states, totalCards } = fixtures.board;

  test.each(Object.entries(states))(
    '%s: 카드 보존 (보이는 카드 + 상대 손패 + 더미 = 51)',
    (_, view) => {
      const ids = visibleIds(view);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id >= 0 && id < totalCards).toBe(true);
      const hiddenHands = view.seats
        .filter((s) => s.hand === null)
        .reduce((n, s) => n + s.handCount, 0);
      expect(ids.length + hiddenHands + view.deckCount).toBe(totalCards);
    },
  );

  test.each(Object.entries(states))(
    '%s: 보는 좌석만 손패가 보이고, 장수·진행도·월 무더기가 맞다',
    (_, view) => {
      view.seats.forEach((seat, index) => {
        expect(seat.hand === null).toBe(index !== view.viewer);
        if (seat.hand) expect(seat.hand).toHaveLength(seat.handCount);
        expect(seat.progress).toEqual(progressOf(seat.captured));
        for (const [pile, ids] of Object.entries(seat.captured)) {
          for (const id of ids as CardId[]) {
            const kind = getCard(id).kind;
            expect(pile === kind || (pile === 'pi' && kind === 'bonus'), `${id} in ${pile}`).toBe(
              true,
            );
          }
        }
      });
      for (const group of view.floor) {
        for (const id of group.cards) expect(getCard(id).month).toBe(group.month);
      }
      const hand = view.seats[view.viewer].hand ?? [];
      for (const id of view.playable) expect(hand).toContain(id);
    },
  );

  test('대상 고르기: 선택지는 낸 카드와 같은 월의 바닥 카드 2장', () => {
    const pending = states.target.pending;
    expect(pending?.kind).toBe('target');
    if (pending?.kind !== 'target') return;
    const month = getCard(pending.card).month;
    const floorIds = states.target.floor.flatMap((g) => g.cards);
    expect(pending.options).toHaveLength(2);
    for (const id of pending.options) {
      expect(floorIds).toContain(id);
      expect(getCard(id).month).toBe(month);
    }
  });

  test('고/스톱: 프롬프트 점수 = 좌석 점수', () => {
    const view = states.goStop;
    expect(view.pending?.kind).toBe('goStop');
    if (view.pending?.kind !== 'goStop') return;
    expect(view.pending.score).toBe(view.seats[view.pending.seat].score);
  });

  test('이벤트는 spec 4.5 이름만 쓰고 순번이 늘어난다', () => {
    const events = fixtures.board.events;
    for (const e of events) expect(SPEC_EVENTS).toContain(e.type);
    const seqs = events.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });
});

describe('정산·기록 픽스처', () => {
  const s = fixtures.settlement;

  test('배수 체인의 누계·최종 점수·금액·잔액 변화가 맞다', () => {
    let total = 0;
    for (const step of s.steps) {
      total = step.op === 'add' ? total + step.value : total * step.value;
      expect(step.total).toBe(total);
    }
    expect(s.steps[0]?.value).toBe(s.breakdown.reduce((sum, r) => sum + r.points, 0));
    expect(s.finalPoints).toBe(total);
    expect(s.amount).toBe(s.finalPoints * s.pointValue);
    const [a, b] = s.balances;
    expect(a.after - a.before).toBe(s.winner === 0 ? s.amount : -s.amount);
    expect(b.after - b.before).toBe(s.winner === 1 ? s.amount : -s.amount);
  });

  test('기록 합계가 정산 뒤 잔액과 이어진다', () => {
    const r = fixtures.records;
    const sum = r.rows.reduce((n, row) => n + row.amount, 0);
    expect(r.startBalance + sum).toBe(s.balances[0].after);
    expect(r.rows.at(-1)?.amount).toBe(s.amount);
  });
});
