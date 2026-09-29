// 기기별 설정 (spec FR-20~24, MN-04·MN-06). localStorage에 저장하고 Svelte 5 runes로 반응한다.
// 규칙·금액은 새 세션을 시작할 때만 적용된다(FR-24 "세션 중 규칙 변경 불가"). 속도·효과음·진동은 즉시 적용.
// 점당 금액·시작 잔액 기본값은 MN-03 산정 결과(packages/ai/src/money-defaults.ts, docs/money-model.md)를 쓴다.
import {
  DEFAULT_PER_POINT,
  PER_POINT_OPTIONS,
  suggestedStartBalance,
  type Difficulty,
} from '@p2p-gostop/ai';
import type { PresetId } from '@p2p-gostop/engine';
import type { MoneyUnit, SpeedSetting } from '../lib/view-types.ts';
import { readJson, STORAGE_KEYS, writeJson } from '../storage/local.ts';

export interface AppSettings {
  readonly preset: PresetId;
  /** 국진 '매번 묻기' (FR-15). 끄면 자동 최적 */
  readonly gukjinAsk: boolean;
  readonly perPoint: number;
  /** 시작 잔액. null이면 점당 금액에 비례한 자동 제안 (MN-04) */
  readonly startBalance: number | null;
  readonly unit: MoneyUnit;
  readonly speed: SpeedSetting;
  readonly sound: boolean;
  readonly vibration: boolean;
  /** 마지막으로 고른 CPU 난이도 */
  readonly difficulty: Difficulty;
  /** 상용급 CPU 생각 시간 상한 ms (AI-05: Android ≤ 1.0초) */
  readonly aiTimeMs: number;
  /** 친구와 대전에서 상대에게 보이는 내 이름 (spec 2.1·2.2, 최대 12자) */
  readonly playerName: string;
}

/** 화면에 적용되는 속도: 설정값 또는 자동 시험용 즉시 모드(`?speed=instant`) */
export type EffectiveSpeed = SpeedSetting | 'instant';

const PRESET_IDS: readonly PresetId[] = ['traditional', 'standard', 'arcade'];
const SPEEDS: readonly SpeedSetting[] = ['normal', 'fast', 'very-fast'];
const UNITS: readonly MoneyUnit[] = ['냥', '원', '점'];
export const DIFFICULTY_IDS: readonly Difficulty[] = ['easy', 'normal', 'commercial'];
const AI_TIME_OPTIONS: readonly number[] = [500, 1000, 1500];

const DEFAULT_SETTINGS: AppSettings = Object.freeze({
  preset: 'standard',
  gukjinAsk: false,
  perPoint: DEFAULT_PER_POINT,
  startBalance: null,
  unit: '냥',
  speed: 'normal',
  sound: true,
  vibration: true,
  difficulty: 'normal',
  aiTimeMs: 1000,
  playerName: '호스트',
});

/** 이름: 앞뒤 공백을 지우고 12자까지 (protocol hello는 80자까지 받는다) */
export function cleanName(value: unknown, fallback: string): string {
  const name = typeof value === 'string' ? value.trim().slice(0, 12) : '';
  return name === '' ? fallback : name;
}

function pick<T>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

/** 저장된 JSON(신뢰할 수 없는 값)을 설정으로 고친다. 모르는 값은 기본값 */
export function normalizeSettings(raw: unknown): AppSettings {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  const start = o['startBalance'];
  return {
    preset: pick(o['preset'], PRESET_IDS, d.preset),
    gukjinAsk: typeof o['gukjinAsk'] === 'boolean' ? o['gukjinAsk'] : d.gukjinAsk,
    perPoint: pick<number>(o['perPoint'], PER_POINT_OPTIONS, d.perPoint),
    startBalance:
      typeof start === 'number' && Number.isInteger(start) && start > 0 && start <= 1e9
        ? start
        : null,
    unit: pick(o['unit'], UNITS, d.unit),
    speed: pick(o['speed'], SPEEDS, d.speed),
    sound: typeof o['sound'] === 'boolean' ? o['sound'] : d.sound,
    vibration: typeof o['vibration'] === 'boolean' ? o['vibration'] : d.vibration,
    difficulty: pick(o['difficulty'], DIFFICULTY_IDS, d.difficulty),
    aiTimeMs: pick(o['aiTimeMs'], AI_TIME_OPTIONS, d.aiTimeMs),
    playerName: cleanName(o['playerName'], d.playerName),
  };
}

/** 실제로 쓸 시작 잔액 */
export function effectiveStartBalance(s: AppSettings): number {
  return s.startBalance ?? suggestedStartBalance(s.preset, s.perPoint);
}

function readSpeedOverride(): EffectiveSpeed | null {
  try {
    const value = new URLSearchParams(globalThis.location?.search ?? '').get('speed');
    return pick<EffectiveSpeed | null>(value, ['instant', ...SPEEDS], null);
  } catch {
    return null;
  }
}

class SettingsStore {
  value = $state.raw<AppSettings>(DEFAULT_SETTINGS);
  /** URL `?speed=instant`(E2E·자동 플레이) 등 저장하지 않는 속도 덮어쓰기 */
  speedOverride = $state<EffectiveSpeed | null>(null);
  private readonly persist: boolean;

  constructor(options: { persist?: boolean } = {}) {
    this.persist = options.persist ?? true;
    if (this.persist) {
      this.value = normalizeSettings(readJson(STORAGE_KEYS.settings));
      this.speedOverride = readSpeedOverride();
    }
  }

  get speed(): EffectiveSpeed {
    return this.speedOverride ?? this.value.speed;
  }

  update(patch: Partial<AppSettings>): void {
    this.value = normalizeSettings({ ...this.value, ...patch });
    if (this.persist) writeJson(STORAGE_KEYS.settings, this.value);
  }
}

/** 앱 전체가 공유하는 설정 */
export const settings = new SettingsStore();
