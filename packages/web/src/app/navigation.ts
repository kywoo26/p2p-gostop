import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import type { RouteId } from '$app/types';
import { log } from '../game/log.svelte.ts';

export type AppRoute = Exclude<RouteId, `${string}[${string}`>;
const returnRoutes = [
  '/',
  '/game',
  '/match',
  '/solo',
  '/versus',
  '/remote',
  '/records',
  '/diagnostics',
  '/license',
] as const satisfies readonly AppRoute[];
export type ReturnRoute = (typeof returnRoutes)[number];
/** history의 UI 상태만 읽는다. session/권위 상태와 별개이며 알 수 없는 값은 홈으로 돌아간다. */
export function returnRoute(value: unknown): ReturnRoute {
  return returnRoutes.find((route) => route === value) ?? '/';
}
/** history에는 검증한 UI 문자열만 넣는다. 호출자가 준 세션·연결 객체는 넘기지 않는다. */
export function uiState(state: App.PageState = {}): App.PageState {
  const result: App.PageState = {};
  if (state.returnTo !== undefined) result.returnTo = returnRoute(state.returnTo);
  if (
    state.settingsSection === 'play' ||
    state.settingsSection === 'comfort' ||
    state.settingsSection === 'connection'
  )
    result.settingsSection = state.settingsSection;
  return result;
}
export function go(route: AppRoute, options: Parameters<typeof goto>[1] = {}) {
  // 실패한 목적지에서도 출발 화면을 안다. 권위 객체 대신 기존 UI 복귀 문자열만 넘긴다.
  const state = {
    returnTo: returnRoute(
      page.error || page.route.id === '/settings' ? page.state.returnTo : page.route.id,
    ),
    ...uiState(options.state),
  };
  void goto(resolve(route), {
    ...options,
    state,
    persistState: true,
  }).catch(() => {
    log.error('화면을 열지 못했습니다.');
  });
}
