// #206 / FR-40·FR-23·NF-08: 공개 표시와 상세 이름의 경계를 검사한다.
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { conciseSoloNotice, playerLabel } from '../game/player-labels.ts';
import { fixtures } from '../lib/fixtures.ts';
import Board from './Board.svelte';
import EventRail from './EventRail.svelte';
import Settlement from '../routes/Settlement.svelte';

for (const [difficulty, label] of [
  ['easy', '쉬움'],
  ['normal', '보통'],
  ['commercial', '상용급'],
] as const) {
  test(`${label}: AI 표시를 분리하고 원문과 난이도를 판 정보에 보존`, async () => {
    await page.viewport(360, 780);
    const name = `컴퓨터 · ${label}`;
    const view = {
      ...fixtures.board.states.play,
      seats: [
        fixtures.board.states.play.seats[0],
        { ...fixtures.board.states.play.seats[1], name },
      ] as const,
    };
    const original = JSON.stringify(view);
    const screen = await render(Board, {
      view,
      soloDifficulty: difficulty,
      toast: { id: 1, text: `${name} 폭탄 (1월)` },
    });
    expect(screen.container.querySelector('.table-heading strong')?.textContent).toBe('컴퓨터');
    expect(screen.container.querySelector('.opponent-hud .name')?.textContent).toBe('컴퓨터');
    expect(
      screen.container.querySelector('.opponent-hud .seat-bar')?.getAttribute('aria-label'),
    ).toContain(name);
    const status = screen.container.querySelector('[data-testid="event-rail"] [role="status"]')!;
    expect(status.textContent).toContain('컴퓨터 폭탄');
    expect(status.getAttribute('aria-label')).toBe(`${name} 폭탄 (1월)`);
    const dialog = screen.container.querySelector<HTMLDialogElement>(
      'dialog[aria-label="판 정보"]',
    )!;
    dialog.showModal();
    expect(dialog.textContent).toContain(`컴퓨터 난이도: ${label}`);
    expect(dialog.textContent).toContain(name);
    expect(JSON.stringify(view)).toBe(original);
  });
}

for (const viewer of [0, 1] as const) {
  test(`P2P 좌석${viewer}: 긴 실제 이름과 동명이인 원문·상대 식별 보존`, async () => {
    const name = '합성 참가자 긴 이름 컴퓨터 · 상용급';
    const base = fixtures.board.states.play;
    const view = {
      ...base,
      viewer,
      seats: [
        { ...base.seats[0], name },
        { ...base.seats[1], name },
      ] as const,
    };
    const screen = await render(Board, { view });
    expect(screen.container.querySelector('.table-heading strong')?.textContent).toBe(name);
    expect(
      screen.container.querySelector('.opponent-hud .seat-bar')?.getAttribute('aria-label'),
    ).toBe(`상대 ${name} 점수판`);
    expect(screen.container.querySelector('.mine-hud .seat-bar')?.getAttribute('aria-label')).toBe(
      `나 ${name} 점수판`,
    );
    expect(screen.container.textContent).not.toContain('컴퓨터 난이도:');
    expect(playerLabel(name, false)).toBe(name);
    expect(conciseSoloNotice(`${name} 선`, [name, name])).toBe(`${name} 선`);
  });
}

test('정산 제목·잔액표만 짧게 표시하고 상세/접근성 원문을 보존', async () => {
  const name = '컴퓨터 · 상용급';
  const view = { ...fixtures.settlement, winner: 1 as const, names: ['나', name] as const };
  const original = JSON.stringify(view);
  const screen = await render(Settlement, { view, soloDifficulty: 'commercial' });
  const headline = screen.container.querySelector('[data-testid="settlement-headline"]')!;
  expect(headline.querySelector('[aria-hidden="true"]')?.textContent).toMatch(/^컴퓨터 승리/);
  expect(headline.querySelector('.sr-only')?.textContent).toMatch(/^컴퓨터 · 상용급 승리/);
  expect(
    screen.container.querySelector('th[scope="row"][title="컴퓨터 · 상용급"]')?.textContent,
  ).toBe('컴퓨터');
  expect(
    screen.container
      .querySelector('th[scope="row"][title="컴퓨터 · 상용급"]')
      ?.getAttribute('aria-label'),
  ).toBe(name);
  expect(JSON.stringify(view)).toBe(original);
});

test('선택 보류 후에도 짧은 알림과 원문 접근성 이름이 함께 복귀', async () => {
  const screen = await render(EventRail, {
    idle: '내 차례',
    blocked: true,
    toast: { id: 1, text: '컴퓨터 자뻑', fullText: '컴퓨터 · 상용급 자뻑' },
  });
  await screen.rerender({ blocked: false, toast: null });
  const status = screen.container.querySelector('[role="status"]')!;
  expect(status.textContent).toBe('내 차례 · 컴퓨터 자뻑');
  expect(status.getAttribute('aria-label')).toBe('내 차례 · 컴퓨터 · 상용급 자뻑');
});

test('콜아웃은 기존 주체·사건 구조를 유지하고 전체 사건 문구를 읽는다', async () => {
  const screen = await render(EventRail, {
    idle: '내 차례',
    viewer: 1,
    banner: { kind: 'bomb', seat: 0, text: '폭탄 · 배수 증가', id: 1 },
  });
  const status = screen.container.querySelector('[role="status"]')!;
  expect(status.textContent).toBe('상대 폭탄!');
  expect(status.getAttribute('aria-label')).toBe('상대 폭탄 · 배수 증가!');
});

test('이름 선두가 겹치는 저장본은 사건 텍스트를 임의 치환하지 않는다', () => {
  const names = ['컴퓨터 · 상용급 사용자', '컴퓨터 · 상용급'] as const;
  expect(conciseSoloNotice(`${names[0]} 선`, names)).toBe(`${names[0]} 선`);
  expect(
    conciseSoloNotice('선 고르기: 나 1월 광 · 컴퓨터 · 상용급 2월 열끗', ['나', '컴퓨터 · 상용급']),
  ).toBe('선 고르기: 나 1월 광 · 컴퓨터 2월 열끗');
});

test('선 고르기는 사람 이름 내부를 보존하고 접두부 뒤 AI 필드만 줄인다', async () => {
  const names = ['합성 · 컴퓨터 · 상용급 사용자', '컴퓨터 · 상용급'] as const;
  const text = `선 고르기: ${names[0]} 1월 광 · ${names[1]} 2월 열끗`;
  const expected = `선 고르기: ${names[0]} 1월 광 · 컴퓨터 2월 열끗`;
  expect(conciseSoloNotice(text, names)).toBe(expected);
  const base = fixtures.board.states.play;
  const view = {
    ...base,
    seats: [
      { ...base.seats[0], name: names[0] },
      { ...base.seats[1], name: names[1] },
    ] as const,
  };
  const original = JSON.stringify(view);
  const screen = await render(Board, {
    view,
    soloDifficulty: 'commercial',
    toast: { id: 1, text },
  });
  const status = screen.container.querySelector('[data-testid="event-rail"] [role="status"]')!;
  expect(status.textContent).toBe(expected);
  expect(status.getAttribute('aria-label')).toBe(text);
  expect(JSON.stringify(view)).toBe(original);
});
