// #200: 합법 newRound/reduce를 실제 SoloSession 저장/입력 경로에 전달한다.
import { newRound, PRESETS, type Action } from '@p2p-gostop/engine';
import { createSession, sessionAct } from '../src/game/session.ts';

export function landingSave() {
  let session = {
    ...createSession({
      preset: 'standard',
      rules: PRESETS.standard,
      perPoint: 100,
      startBalance: 100_000,
      names: ['좌석0', '좌석1'],
      seed: 1,
    }).session,
    // seeded 분배 fixture. 세션 최초 시작부터의 도달 증명과 구별한다.
    game: newRound(PRESETS.standard, 1, { dealer: 1 }).state,
  };
  const history: Action[] = [{ type: 'play', seat: 1, card: 1 }];
  for (const action of history) {
    const result = sessionAct(session, action);
    if (!result.ok) throw new Error(result.message);
    session = result.session;
  }
  const result = sessionAct(session, { type: 'play', seat: 0, card: 10 });
  if (!result.ok) throw new Error(result.message);
  return {
    save: { version: 1 as const, difficulty: 'easy' as const, session },
    events: result.events,
  };
}

export function ppeokLandingSave() {
  let session = {
    ...landingSave().save.session,
    actions: [] as readonly Action[],
    game: newRound(PRESETS.standard, 1827, { dealer: 0 }).state,
  };
  const history: Action[] = [
    { type: 'play', seat: 0, card: 30 },
    { type: 'play', seat: 1, card: 27 },
    { type: 'play', seat: 0, card: 36 },
    { type: 'chooseTarget', seat: 0, card: 37 },
    { type: 'play', seat: 1, card: 32 },
    { type: 'play', seat: 0, card: 17 },
    { type: 'play', seat: 1, card: 18 },
    { type: 'play', seat: 0, card: 4 },
    { type: 'play', seat: 1, card: 42 },
  ];
  for (const action of history) {
    const result = sessionAct(session, action);
    if (!result.ok) throw new Error(result.message);
    session = result.session;
  }
  const result = sessionAct(session, { type: 'play', seat: 0, card: 15 });
  if (!result.ok) throw new Error(result.message);
  return {
    save: { version: 1 as const, difficulty: 'easy' as const, session },
    events: result.events,
  };
}

export function restoredLandingSave() {
  let session = {
    ...createSession({
      preset: 'standard',
      rules: PRESETS.standard,
      perPoint: 100,
      startBalance: 100_000,
      names: ['좌석0', '좌석1'],
      seed: 1,
    }).session,
    game: newRound(PRESETS.standard, [3839809690, 1129524092, 3832060461, 2933933213], {
      dealer: 0,
    }).state,
  };
  for (const action of [
    { type: 'play', seat: 0, card: 7 },
    { type: 'chooseTarget', seat: 0, card: 6 },
  ] as const) {
    const result = sessionAct(session, action);
    if (!result.ok) throw new Error(result.message);
    session = result.session;
  }
  return { version: 1 as const, difficulty: 'easy' as const, session };
}
