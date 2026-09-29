import { PRESETS } from '@p2p-gostop/engine';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { current } from '../game/current.svelte.ts';
import { createSession } from '../game/session.ts';
import SoloSetup from './SoloSetup.svelte';

test('새 게임 취소는 진행 세션의 시드·판·잔액·기록을 그대로 둔다 (#64, MN-05)', async () => {
  const previous = current.saved;
  const session = createSession({
    preset: 'standard',
    rules: PRESETS.standard,
    perPoint: 100,
    startBalance: 10000,
    names: ['나', '컴퓨터'],
    seed: 88,
  }).session;
  current.saved = { version: 1, difficulty: 'easy', session };
  try {
    const screen = await render(SoloSetup);
    await screen.getByRole('button', { name: '시작', exact: true }).click();
    await expect
      .element(screen.getByRole('dialog', { name: '새 게임을 시작할까요?' }))
      .toBeVisible();
    await screen.getByRole('button', { name: '취소' }).click();
    expect(current.saved?.session).toEqual(session);
  } finally {
    current.saved = previous;
  }
});

test('손상 저장은 안내하고 명시 확인 전에는 덮어쓰지 않는다 (#64, NF-05)', async () => {
  const previousSaved = current.saved;
  const previousError = current.saveError;
  current.saved = null;
  current.saveError = '저장된 세션 데이터가 손상되었습니다.';
  try {
    const screen = await render(SoloSetup);
    await expect
      .element(screen.getByTestId('save-error'))
      .toHaveTextContent('저장된 세션 데이터가 손상되었습니다.');
    await screen.getByRole('button', { name: '시작', exact: true }).click();
    await screen.getByRole('button', { name: '취소' }).click();
    expect(current.saveError).toBe('저장된 세션 데이터가 손상되었습니다.');
  } finally {
    current.saved = previousSaved;
    current.saveError = previousError;
  }
});
