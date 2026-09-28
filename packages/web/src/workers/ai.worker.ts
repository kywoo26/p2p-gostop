// CPU 결정 Web Worker (spec AI-05: UI를 막지 않는다, plan.md 1.5).
// 메인 스레드가 { id, req }를 보내면 { id, ok, action, ms } 또는 { id, ok: false, error }로 답한다.
import { decide, type AiRequest } from '../game/ai-core.ts';

export interface AiWorkerRequest {
  readonly id: number;
  readonly req: AiRequest;
}

export type AiWorkerResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly action: ReturnType<typeof decide>['action'];
      readonly ms: number;
    }
  | { readonly id: number; readonly ok: false; readonly error: string };

self.addEventListener('message', (event: MessageEvent<AiWorkerRequest>) => {
  const { id, req } = event.data;
  let response: AiWorkerResponse;
  try {
    const result = decide(req);
    response = { id, ok: true, action: result.action, ms: result.ms };
  } catch (error) {
    response = { id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
});
