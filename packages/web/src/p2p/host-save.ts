// MN-05: 호스트 envelope와 rev/seq 중복 저장 방지. 저장 실패 시 다음 변경에서 재시도한다.
import type { PresetId, RuleOptions } from '@p2p-gostop/engine';
import type { HostSession, HostSessionState } from '@p2p-gostop/protocol';
import { log } from '../game/log.svelte.ts';
import type { MoneyUnit, RecordRow } from '../lib/view-types.ts';
import { readJson, removeKey, writeJson } from '../storage/local.ts';

const HOST_SAVE_KEY = 'gostop.host.v2';

export interface HostConfig {
  readonly preset: PresetId;
  readonly rules: RuleOptions;
  readonly perPoint: number;
  readonly startBalance: number;
  readonly hostName: string;
  readonly unit?: MoneyUnit;
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
    o.state.v !== 1 ||
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
  private readonly persist: boolean;

  constructor(persist: boolean) {
    this.persist = persist;
  }

  write(session: HostSession | null, config: HostConfig, records: readonly RecordRow[]): void {
    if (!this.persist || session === null) return;
    const rev = session.status.rev;
    if (this.savedRev === rev && this.savedSeq === session.seq) return;
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
    }
  }
}
