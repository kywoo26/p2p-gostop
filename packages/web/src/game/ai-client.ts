// CPU 결정 클라이언트 (spec AI-05, plan.md 1.5 "Web Worker에서 실행").
// 기본은 Web Worker. Worker를 만들 수 없거나 오류·무응답이면 메인 스레드 인라인 경로로 넘어간다(시간 제한을 줄여 UI 정지를 짧게).
import type { Difficulty } from '@p2p-gostop/ai';
import type { AiWorkerRequest, AiWorkerResponse } from '../workers/ai.worker.ts';
import type * as AiCore from './ai-core.ts';
import type { AiRequest, AiResult } from './ai-core.ts';
import { log } from './log.svelte.ts';

export interface AiClient {
  readonly mode: 'worker' | 'inline';
  decide(req: AiRequest): Promise<AiResult>;
  dispose(): void;
}

/** 인라인(메인 스레드) 경로의 시간 제한 상한 ms: UI가 이보다 오래 멈추지 않게 한다 */
const INLINE_MAX_MS = 300;
/** Worker가 시간 제한 + 이만큼 안에 답하지 않으면 인라인으로 넘어간다 */
const WATCHDOG_GRACE_MS = 5000;

/** 난이도별 시간 제한 (AI-05): 상용급은 설정값(기본 1000ms), 보통 400ms, 쉬움 100ms */
export function timeBudgetFor(difficulty: Difficulty, commercialMs: number): number {
  if (difficulty === 'commercial') return commercialMs;
  return difficulty === 'normal' ? Math.min(400, commercialMs) : 100;
}

class InlineAiClient implements AiClient {
  readonly mode = 'inline' as const;
  private core: Promise<typeof AiCore> | null = null;

  async decide(req: AiRequest): Promise<AiResult> {
    this.core ??= import('./ai-core.ts');
    const core = await this.core;
    // 한 번 양보해 직전 애니메이션 프레임이 그려지게 한다
    await new Promise((resolve) => setTimeout(resolve, 0));
    return core.decide({ ...req, timeBudgetMs: Math.min(req.timeBudgetMs, INLINE_MAX_MS) });
  }

  dispose(): void {}
}

interface Waiting {
  readonly req: AiRequest;
  readonly resolve: (result: AiResult) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

class WorkerAiClient implements AiClient {
  private worker: Worker | null;
  private fallback: InlineAiClient | null = null;
  private nextId = 1;
  private readonly waiting = new Map<number, Waiting>();

  constructor() {
    // Vite가 인식하는 형태 그대로 둔다(new URL을 new Worker 안에 직접, 옵션은 문자열 상수)
    this.worker = new Worker(new URL('../workers/ai.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.addEventListener('message', (event: MessageEvent<AiWorkerResponse>) => {
      this.onResponse(event.data);
    });
    this.worker.addEventListener('error', (event) => {
      event.preventDefault();
      this.failOver(`Worker 오류: ${event.message}`);
    });
    this.worker.addEventListener('messageerror', () => this.failOver('Worker 메시지 오류'));
  }

  get mode(): 'worker' | 'inline' {
    return this.fallback === null ? 'worker' : 'inline';
  }

  decide(req: AiRequest): Promise<AiResult> {
    if (this.fallback !== null || this.worker === null) {
      return (this.fallback ??= new InlineAiClient()).decide(req);
    }
    const worker = this.worker;
    const id = this.nextId++;
    return new Promise<AiResult>((resolve, reject) => {
      const timer = setTimeout(
        () => this.failOver(`Worker 무응답 (${req.timeBudgetMs + WATCHDOG_GRACE_MS}ms)`),
        req.timeBudgetMs + WATCHDOG_GRACE_MS,
      );
      this.waiting.set(id, { req, resolve, reject, timer });
      const message: AiWorkerRequest = { id, req };
      worker.postMessage(message);
    });
  }

  private onResponse(res: AiWorkerResponse): void {
    const w = this.waiting.get(res.id);
    if (w === undefined) return;
    this.waiting.delete(res.id);
    clearTimeout(w.timer);
    if (res.ok) w.resolve({ action: res.action, ms: res.ms });
    else w.reject(new Error(`CPU 결정 실패: ${res.error}`));
  }

  /** Worker를 버리고 인라인으로 넘어간다. 기다리던 요청은 인라인으로 다시 푼다 */
  private failOver(reason: string): void {
    if (this.fallback !== null) return;
    log.warn(`${reason} → 메인 스레드 인라인 CPU로 전환`);
    this.worker?.terminate();
    this.worker = null;
    const fallback = new InlineAiClient();
    this.fallback = fallback;
    for (const [id, w] of this.waiting) {
      clearTimeout(w.timer);
      this.waiting.delete(id);
      fallback.decide(w.req).then(w.resolve, w.reject);
    }
  }

  dispose(): void {
    for (const w of this.waiting.values()) {
      clearTimeout(w.timer);
      w.reject(new Error('CPU 클라이언트가 닫혔습니다'));
    }
    this.waiting.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}

/** Worker를 쓸 수 있으면 Worker, 아니면 인라인 (spec AI-05) */
export function createAiClient(options: { preferWorker?: boolean } = {}): AiClient {
  if ((options.preferWorker ?? true) && typeof Worker !== 'undefined') {
    try {
      return new WorkerAiClient();
    } catch (error) {
      log.warn(`Worker 생성 실패: ${String(error)} → 인라인 CPU`);
    }
  }
  return new InlineAiClient();
}
