// #206 / FR-40·FR-23·NF-08: 공개 표시와 상세 이름의 경계를 검사한다.
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { conciseSoloNotice, playerLabel } from '../game/player-labels.ts';
import { fixtures } from '../lib/fixtures.ts';
import Board from './Board.svelte';
import EventRail from './EventRail.svelte';
import Settlement from '../routes/Settlement.svelte';
import { INSTANT_LABEL, REASON_LABEL } from './settle-labels.ts';

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

for (const name of ['선', '선 고르기:']) {
  test(`AI 이름 '${name}'은 선 고르기 제목을 손상시키지 않는다`, async () => {
    const names = ['나', name] as const;
    const text = `선 고르기: 나 1월 광 · ${name} 2월 열끗`;
    const expected = '선 고르기: 나 1월 광 · 컴퓨터 2월 열끗';
    expect(conciseSoloNotice(text, names)).toBe(expected);
    const base = fixtures.board.states.play;
    const view = { ...base, seats: [base.seats[0], { ...base.seats[1], name }] as const };
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
}

test('선 고르기 형식이 모호하면 원문을 보존하고 일반 알림은 정상 축약한다', () => {
  for (const text of [
    '선 고르기: 다른 이름 1월 광 · 선 2월 열끗',
    '선 고르기: 나 1월 광',
    '선 고르기: 나 1월 광 · 선 2월 열끗 · 추가',
  ]) {
    expect(conciseSoloNotice(text, ['나', '선'])).toBe(text);
  }
  for (const event of ['선', '뻑 먹기', '자뻑', '폭탄 (1월)', '국진: 쌍피', '흔들기: 1월 광']) {
    expect(conciseSoloNotice(`컴퓨터 · 상용급 ${event}`, ['나', '컴퓨터 · 상용급'])).toBe(
      `컴퓨터 ${event}`,
    );
    expect(conciseSoloNotice(`나 ${event}`, ['나', '컴퓨터 · 상용급'])).toBe(`나 ${event}`);
  }
});

for (const [name, text] of [
  ['같은', '같은 월: 다시 고릅니다'],
  ['바닥', '바닥 총통: 다시 나눕니다'],
] as const) {
  test(`주체 없는 사건은 AI 이름 '${name}'과 겹쳐도 원문 보존`, async () => {
    const base = fixtures.board.states.play;
    const view = { ...base, seats: [base.seats[0], { ...base.seats[1], name }] as const };
    const original = JSON.stringify(view);
    const screen = await render(Board, {
      view,
      soloDifficulty: 'commercial',
      toast: { id: 1, text },
    });
    const status = screen.container.querySelector('[data-testid="event-rail"] [role="status"]')!;
    expect(status.textContent).toBe(text);
    expect(status.getAttribute('aria-label')).toBe(text);
    expect(JSON.stringify(view)).toBe(original);
  });
}

test('무승자 나가리 정산은 AI 이름과 겹쳐도 결과와 원문을 보존', async () => {
  const view = { ...fixtures.settlement, winner: null, names: ['나', '나가리'] as const };
  const original = JSON.stringify(view);
  const screen = await render(Settlement, { view, nextCarry: 2, soloDifficulty: 'commercial' });
  const headline = screen.container.querySelector('[data-testid="settlement-headline"]')!;
  expect(headline.querySelector('[aria-hidden="true"]')?.textContent).toBe('나가리 · 다음 판 ×2');
  expect(headline.querySelector('.sr-only')?.textContent).toBe('나가리 · 다음 판 ×2');
  expect(JSON.stringify(view)).toBe(original);
});

// review5370762362 경계군별 합성35개. 리뷰의 개별 입력 전문이 아닌 같은 경계군의 명시적 회귀다.
const noticeBoundaryCases = [
  [
    'FirstPicked 순서 선',
    ['나', '선'],
    '선 고르기: 나 1월 광 · 선 2월 열끗',
    '선 고르기: 나 1월 광 · 컴퓨터 2월 열끗',
  ],
  [
    'FirstPicked 순서 선 고르기:',
    ['나', '선 고르기:'],
    '선 고르기: 나 1월 광 · 선 고르기: 2월 열끗',
    '선 고르기: 나 1월 광 · 컴퓨터 2월 열끗',
  ],
  [
    'FirstPicked 순서 컴퓨터 · 상용급',
    ['나', '컴퓨터 · 상용급'],
    '선 고르기: 나 1월 광 · 컴퓨터 · 상용급 2월 열끗',
    '선 고르기: 나 1월 광 · 컴퓨터 2월 열끗',
  ],
  [
    '이름 내부 구분자 합성 · 컴퓨터 · 상용급 사용자',
    ['합성 · 컴퓨터 · 상용급 사용자', '컴퓨터 · 상용급'],
    '선 고르기: 합성 · 컴퓨터 · 상용급 사용자 1월 광 · 컴퓨터 · 상용급 2월 열끗',
    '선 고르기: 합성 · 컴퓨터 · 상용급 사용자 1월 광 · 컴퓨터 2월 열끗',
  ],
  [
    '이름 내부 구분자 합성 · 컴퓨터 · 상용급 사용자 · 컴퓨터 · 상용급 친구',
    ['합성 · 컴퓨터 · 상용급 사용자 · 컴퓨터 · 상용급 친구', '컴퓨터 · 상용급'],
    '선 고르기: 합성 · 컴퓨터 · 상용급 사용자 · 컴퓨터 · 상용급 친구 1월 광 · 컴퓨터 · 상용급 2월 열끗',
    '선 고르기: 합성 · 컴퓨터 · 상용급 사용자 · 컴퓨터 · 상용급 친구 1월 광 · 컴퓨터 2월 열끗',
  ],
  [
    '이름 내부 구분자 합성 참가자',
    ['합성 참가자', '합성 · AI'],
    '선 고르기: 합성 참가자 1월 광 · 합성 · AI 2월 열끗',
    '선 고르기: 합성 참가자 1월 광 · 컴퓨터 2월 열끗',
  ],
  [
    '이름 내부 구분자 빈 사람 이름',
    ['', '컴퓨터 · 상용급'],
    '선 고르기:  1월 광 · 컴퓨터 · 상용급 2월 열끗',
    '선 고르기:  1월 광 · 컴퓨터 2월 열끗',
  ],
  [
    '동명/선두 중첩 0',
    ['합성', '합성'],
    '선 고르기: 합성 1월 광 · 합성 2월 열끗',
    '선 고르기: 합성 1월 광 · 합성 2월 열끗',
  ],
  [
    '동명/선두 중첩 1',
    ['', ''],
    '선 고르기:  1월 광 ·  2월 열끗',
    '선 고르기:  1월 광 ·  2월 열끗',
  ],
  [
    '동명/선두 중첩 2',
    ['컴퓨터', '컴퓨터 · 상용급'],
    '선 고르기: 컴퓨터 1월 광 · 컴퓨터 · 상용급 2월 열끗',
    '선 고르기: 컴퓨터 1월 광 · 컴퓨터 · 상용급 2월 열끗',
  ],
  [
    '동명/선두 중첩 3',
    ['컴퓨터 · 상용급', '컴퓨터'],
    '선 고르기: 컴퓨터 · 상용급 1월 광 · 컴퓨터 2월 열끗',
    '선 고르기: 컴퓨터 · 상용급 1월 광 · 컴퓨터 2월 열끗',
  ],
  [
    '동명/선두 중첩 4',
    ['선', '선 고르기:'],
    '선 고르기: 선 1월 광 · 선 고르기: 2월 열끗',
    '선 고르기: 선 1월 광 · 선 고르기: 2월 열끗',
  ],
  [
    '동명/선두 중첩 5',
    ['선 고르기:', '선'],
    '선 고르기: 선 고르기: 1월 광 · 선 2월 열끗',
    '선 고르기: 선 고르기: 1월 광 · 선 2월 열끗',
  ],
  ['prefix/suffix 부분 이름', ['나', '선'], '선수 선', '선수 선'],
  ['prefix/suffix 공백 없음', ['나', '선'], '선고르기', '선고르기'],
  ['prefix/suffix 접미 겹침', ['나', '합성'], '다른합성 선', '다른합성 선'],
  ['prefix/suffix 경계 뒤 추가', ['나', '합성'], '합성인 선', '합성인 선'],
  ['prefix/suffix AI 사건', ['나', '선'], '선 자뻑', '컴퓨터 자뻑'],
  ['prefix/suffix 사람 사건', ['합성 사람', '합성'], '합성 사람 선', '합성 사람 선'],
  [
    '모호한 FirstPicked 다른 사람',
    ['나', '선'],
    '선 고르기: 다른 이름 1월 광 · 선 2월 열끗',
    '선 고르기: 다른 이름 1월 광 · 선 2월 열끗',
  ],
  ['모호한 FirstPicked 누락', ['나', '선'], '선 고르기: 나 1월 광', '선 고르기: 나 1월 광'],
  [
    '모호한 FirstPicked 빈 첫 필드',
    ['나', '선'],
    '선 고르기: 나  · 선 2월 열끗',
    '선 고르기: 나  · 선 2월 열끗',
  ],
  [
    '모호한 FirstPicked 빈 둘째 필드',
    ['나', '선'],
    '선 고르기: 나 1월 광 · 선 ',
    '선 고르기: 나 1월 광 · 선 ',
  ],
  [
    '모호한 FirstPicked 추가',
    ['나', '선'],
    '선 고르기: 나 1월 광 · 선 2월 열끗 · 추가',
    '선 고르기: 나 1월 광 · 선 2월 열끗 · 추가',
  ],
  [
    '모호한 FirstPicked 중복',
    ['나', '선'],
    '선 고르기: 나 1월 광 · 선 2월 열끗 · 선 3월 광',
    '선 고르기: 나 1월 광 · 선 2월 열끗 · 선 3월 광',
  ],
  ['일반 사건/승리 선', ['나', '컴퓨터 · 상용급'], '컴퓨터 · 상용급 선', '컴퓨터 선'],
  [
    '일반 사건/승리 뻑 먹기',
    ['나', '컴퓨터 · 상용급'],
    '컴퓨터 · 상용급 뻑 먹기',
    '컴퓨터 뻑 먹기',
  ],
  ['일반 사건/승리 자뻑', ['나', '컴퓨터 · 상용급'], '컴퓨터 · 상용급 자뻑', '컴퓨터 자뻑'],
  [
    '일반 사건/승리 폭탄 (1월)',
    ['나', '컴퓨터 · 상용급'],
    '컴퓨터 · 상용급 폭탄 (1월)',
    '컴퓨터 폭탄 (1월)',
  ],
  [
    '일반 사건/승리 국진: 쌍피',
    ['나', '컴퓨터 · 상용급'],
    '컴퓨터 · 상용급 국진: 쌍피',
    '컴퓨터 국진: 쌍피',
  ],
  [
    '일반 사건/승리 흔들기: 1월 광',
    ['나', '컴퓨터 · 상용급'],
    '컴퓨터 · 상용급 흔들기: 1월 광',
    '컴퓨터 흔들기: 1월 광',
  ],
  [
    '일반 사건/승리 승리 · 스톱',
    ['나', '컴퓨터 · 상용급'],
    '컴퓨터 · 상용급 승리 · 스톱',
    '컴퓨터 승리 · 스톱',
  ],
  ['중립 문맥 같은', ['나', '같은'], '같은 월: 다시 고릅니다', '같은 월: 다시 고릅니다'],
  ['중립 문맥 바닥', ['나', '바닥'], '바닥 총통: 다시 나눕니다', '바닥 총통: 다시 나눕니다'],
  ['중립 문맥 나가리', ['나', '나가리'], '나가리 · 다음 판 ×2', '나가리 · 다음 판 ×2'],
] as const;

for (const [label, names, text, expected] of noticeBoundaryCases) {
  test(`문구 경계35: ${label}`, () => {
    expect(conciseSoloNotice(text, names)).toBe(expected);
  });
}

test('생산부의 즉시 정산·승리·밀기 형식을 보존하고 미확인 형식은 줄이지 않는다', () => {
  const names = ['나', '컴퓨터 · 상용급'] as const;
  const notices = [
    ...Object.values(INSTANT_LABEL).map((label) => `${label} 즉시 정산 +10점`),
    ...Object.values(REASON_LABEL).map((label) => `승리 · ${label}`),
    '밀기 · 다음 판 ×2',
    '국진: 열끗',
  ];
  for (const notice of notices) {
    expect(conciseSoloNotice(`${names[1]} ${notice}`, names)).toBe(`컴퓨터 ${notice}`);
    expect(conciseSoloNotice(`${names[0]} ${notice}`, names)).toBe(`${names[0]} ${notice}`);
  }
  const unknown = `${names[1]} 미확인 안내`;
  expect(conciseSoloNotice(unknown, names)).toBe(unknown);
  for (const name of ['같은', '바닥', '나가리']) {
    expect(conciseSoloNotice(`${name} 자뻑`, ['나', name])).toBe('컴퓨터 자뻑');
  }
});
