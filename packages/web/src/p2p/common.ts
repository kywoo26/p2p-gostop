// 호스트·게스트 공통 도구: 난수, 빈 게임판, 규칙 프리셋 이름, 기기 진동 피드백.
import { PRESETS, type PresetId, type RuleOptions } from '@p2p-gostop/engine';
import type { BoardView, SeatView } from '@p2p-gostop/protocol';
import { getBridge } from '../bridge/bridge.ts';
import { settings } from '../settings/settings.svelte.ts';
import type { Banner } from '../ui/banner.ts';

/** NP-06: 비보안 컨텍스트에서도 되는 32바이트 난수 (crypto.subtle·randomUUID 금지, NF-02) */
export function random32(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** 세션 토큰·식별자용 16진수 (128비트, NF-06) */
export function randomHex(bytes = 16): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export const PRESET_LABEL: Readonly<Record<PresetId | 'custom', string>> = {
  traditional: '정통',
  standard: '표준',
  arcade: '아케이드',
  custom: '사용자 지정',
};

/** welcome으로 받은 규칙이 어느 프리셋인지 (국진 자동/매번 묻기는 기기 선택이라 비교에서 뺀다) */
export function presetOf(rules: RuleOptions): PresetId | 'custom' {
  const strip = (r: RuleOptions) => JSON.stringify({ ...r, gukjin: null });
  const key = strip(rules);
  for (const id of ['standard', 'traditional', 'arcade'] as const) {
    if (strip(PRESETS[id]) === key) return id;
  }
  return 'custom';
}

function emptySeat(name: string, balance: number): SeatView {
  return {
    name,
    handCount: 0,
    hand: [],
    captured: { gwang: [], yeol: [], tti: [], pi: [] },
    score: 0,
    goCount: 0,
    shakes: 0,
    ppeokCount: 0,
    balance,
    progress: { gwang: 0, godori: 0, dan: 0, pi: 0 },
  };
}

/** 첫 분배 전 게임판 (카드 없음) */
export function emptyBoard(
  viewer: 0 | 1,
  names: readonly [string, string],
  balances: readonly [number, number],
): BoardView {
  const seats: [SeatView, SeatView] = [
    emptySeat(names[0], balances[0]),
    emptySeat(names[1], balances[1]),
  ];
  seats[viewer === 0 ? 1 : 0] = { ...seats[viewer === 0 ? 1 : 0], hand: null };
  return {
    viewer,
    turn: 0,
    seats,
    floor: [],
    deckCount: 0,
    multiplier: 1,
    pending: null,
    playable: [],
    round: 0,
    eventSeq: 0,
    legal: [],
    firstPick: null,
    inFlight: { played: null, staged: [] },
    goStop: null,
    bombMonths: [],
    canFlipOnly: false,
    dealer: null,
    phase: 'chooseFirst',
  };
}

/** spec 6.5: 뻑·쪽·따닥·쓸·고·스톱에 짧은 진동. Android 앱(브리지)에서만, 설정에서 끌 수 있다 */
const PATTERN: Partial<Readonly<Record<Banner['kind'], readonly number[]>>> = {
  ppeok: [90, 60, 90],
  jjok: [60],
  ttadak: [60, 40, 60],
  sseul: [50, 40, 50, 40, 50],
  go: [120],
  stop: [200],
  bomb: [140],
  shake: [80],
};

export function vibrateFor(kind: Banner['kind']): void {
  const pattern = PATTERN[kind];
  const bridge = getBridge();
  if (pattern === undefined || !bridge.isNative || !settings.value.vibration) return;
  void bridge.vibrate(pattern);
}
