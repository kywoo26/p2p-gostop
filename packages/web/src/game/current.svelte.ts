// 앱 전체의 현재 게임 (화면을 오가도 세션이 유지된다). 앱 시작 시 저장된 세션을 이어받는다(MN-05).
import type { Difficulty } from '@p2p-gostop/ai';
import {
  effectiveRules,
  effectiveStartBalance,
  type AppSettings,
} from '../settings/settings.svelte.ts';
import { createAiClient, timeBudgetFor, type AiClient } from './ai-client.ts';
import { log } from './log.svelte.ts';
import type { SessionConfig } from './session.ts';
import { DIFFICULTY_LABEL, SoloSession, type SoloSave } from './solo.svelte.ts';

/** 세션 시드: crypto.getRandomValues (비보안 컨텍스트에서도 쓸 수 있다, NF-02) */
function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

function soloConfig(settings: AppSettings, difficulty: Difficulty): SessionConfig {
  return {
    preset: settings.preset,
    rules: effectiveRules(settings),
    perPoint: settings.perPoint,
    startBalance: effectiveStartBalance(settings),
    names: ['나', `컴퓨터 · ${DIFFICULTY_LABEL[difficulty]}`],
    seed: randomSeed(),
  };
}

class CurrentGame {
  /** 진행 중(또는 방금 끝난) 솔로 세션 */
  solo = $state.raw<SoloSession | null>(null);
  /** 저장소에만 있는 세션(아직 이어하지 않음): 홈의 "이어하기"와 기록 화면 */
  saved = $state.raw<SoloSave | null>(null);
  saveError = $state<string | null>(null);
  private ai: AiClient | null = null;

  constructor() {
    const loaded = SoloSession.loadResult();
    this.saved = loaded.save;
    this.saveError = loaded.error;
  }

  discardCorruptSave(): void {
    SoloSession.clearSaved();
    this.saveError = null;
  }

  private client(): AiClient {
    this.ai ??= createAiClient();
    return this.ai;
  }

  /** 이어할 수 있는 세션이 있는지 (끝나지 않은 세션) */
  get resumable(): SoloSave | null {
    const s = this.solo?.state ?? this.saved?.session ?? null;
    if (s === null || s.phase === 'ended') return null;
    if (this.solo !== null) {
      return { version: 1, difficulty: this.solo.difficulty, session: this.solo.state };
    }
    return this.saved;
  }

  startSolo(settings: AppSettings, difficulty: Difficulty): SoloSession {
    this.solo?.dispose();
    const session = SoloSession.create(soloConfig(settings, difficulty), {
      difficulty,
      timeBudgetMs: timeBudgetFor(difficulty, settings.aiTimeMs),
      ai: this.client(),
    });
    this.solo = session;
    this.saved = null;
    return session;
  }

  /** 저장된 세션 이어하기 */
  resumeSolo(settings: AppSettings): SoloSession | null {
    if (this.solo !== null && this.solo.state.phase !== 'ended') return this.solo;
    const loaded =
      this.saved === null ? SoloSession.loadResult() : { save: this.saved, error: null };
    if (loaded.error !== null) this.saveError = loaded.error;
    const saved = loaded.save;
    if (saved === null || saved.session.phase === 'ended') return null;
    log.info(`저장된 세션 이어하기: ${saved.session.roundNumber}판째`);
    this.solo = new SoloSession(saved.session, {
      difficulty: saved.difficulty,
      timeBudgetMs: timeBudgetFor(saved.difficulty, settings.aiTimeMs),
      ai: this.client(),
    });
    this.saved = null;
    return this.solo;
  }

  /** 기록 화면용: 현재 세션 또는 저장된(끝난 것 포함) 세션 */
  get recordSource(): SoloSave | null {
    if (this.solo !== null) {
      return { version: 1, difficulty: this.solo.difficulty, session: this.solo.state };
    }
    return this.saved;
  }
}

export const current = new CurrentGame();
