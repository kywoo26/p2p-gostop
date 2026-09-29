// MN-05: 호스트 envelope와 rev/seq 중복 저장 방지. 저장 실패 시 다음 변경에서 재시도한다.
import type { PresetId, RuleOptions } from '@p2p-gostop/engine';
import type { HostSession, HostSessionState } from '@p2p-gostop/protocol';
import type { TimerSettings } from '@p2p-gostop/protocol';
import { log } from '../game/log.svelte.ts';
import type { MoneyUnit, RecordRow } from '../lib/view-types.ts';
import { readJson, readJsonResult, removeKey, writeJson } from '../storage/local.ts';

const HOST_SAVE_KEY = 'gostop.host.v2';
const TIMER_SETTING_KEY = 'gostop.p2p-timer.v1';
export type TimerDecisionMs = TimerSettings['decisionMs'];
const TIMER_OPTIONS: readonly TimerDecisionMs[] = [null, 5000, 10000, 20000, 30000, 60000];
function validTimerDecisionMs(value: unknown): value is TimerDecisionMs {
  return TIMER_OPTIONS.includes(value as TimerDecisionMs);
}
export function loadTimerPreference(): TimerDecisionMs {
  const raw = readJsonResult(TIMER_SETTING_KEY);
  return raw.status === 'value' && validTimerDecisionMs(raw.value) ? raw.value : 10_000;
}
export function saveTimerPreference(value: TimerDecisionMs): boolean {
  return writeJson(TIMER_SETTING_KEY, value);
}

export interface HostConfig {
  readonly preset: PresetId;
  readonly rules: RuleOptions;
  readonly perPoint: number;
  readonly startBalance: number;
  readonly hostName: string;
  readonly unit?: MoneyUnit;
  readonly timerDecisionMs?: TimerDecisionMs;
}

/** localStorage 저장 (MN-05) */
export interface HostSave {
  readonly version: 2;
  readonly config: HostConfig;
  readonly state: HostSessionState;
  readonly records: readonly RecordRow[];
}

export function loadHostSave(): HostSave | null {
  const raw = readJson(HOST_SAVE_KEY);
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Partial<HostSave>;
  if (
    o.version !== 2 ||
    typeof o.config?.rules !== 'object' ||
    typeof o.state !== 'object' ||
    o.state === null ||
    (o.state.v !== 1 && o.state.v !== 2) ||
    !Array.isArray(o.records)
  )
    return null;
  return o as HostSave;
}

export function clearHostSave(): void {
  removeKey(HOST_SAVE_KEY);
}

export class HostSaveStore {
  private savedRev = -1;
  private savedSeq = -1;
  private savedTimerRev = -1;
  private readonly persist: boolean;

  constructor(persist: boolean) {
    this.persist = persist;
  }

  write(session: HostSession | null, config: HostConfig, records: readonly RecordRow[]): void {
    if (!this.persist || session === null) return;
    const rev = session.status.rev;
    const timerRev = session.decisionClock?.timerRev ?? 0;
    if (this.savedRev === rev && this.savedSeq === session.seq && this.savedTimerRev === timerRev)
      return;
    const save: HostSave = {
      version: 2,
      config,
      state: session.toJSON(),
      records,
    };
    if (!writeJson(HOST_SAVE_KEY, save)) log.warn('호스트 세션 저장 실패');
    else {
      this.savedRev = rev;
      this.savedSeq = session.seq;
      this.savedTimerRev = timerRev;
    }
  }
}
