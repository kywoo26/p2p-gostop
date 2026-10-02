import { goto } from '$app/navigation';
import { log } from '../game/log.svelte.ts';
let generation = 0;
export function go(hash: string, options?: Parameters<typeof goto>[1]) {
  const owner = ++generation;
  void goto(hash, options).catch(() => {
    if (owner === generation) log.error('화면을 열지 못했습니다.');
  });
}
