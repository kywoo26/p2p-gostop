// worker_threads 풀: 작업 단위를 동적으로 나눠 준다. 결과는 단위 번호로 정렬해 워커 수와 무관하게 같다.
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { SimConfig } from './config.ts';
import { makePolicies, runUnit, unitCount, type RoundRecord } from './runner.ts';

export interface Progress {
  (done: number, total: number): void;
}

export async function runAll(config: SimConfig, onProgress?: Progress): Promise<RoundRecord[]> {
  const total = unitCount(config);
  const workers = Math.max(
    1,
    Math.min(total, config.workers > 0 ? config.workers : availableParallelism()),
  );
  const results = new Map<number, RoundRecord[]>();
  if (workers === 1) {
    const policies = makePolicies(config);
    for (let unit = 0; unit < total; unit++) {
      results.set(unit, runUnit(config, policies, unit));
      onProgress?.(unit + 1, total);
    }
  } else {
    let next = 0;
    await Promise.all(
      Array.from({ length: workers }, async () => {
        const worker = new Worker(new URL('./worker.ts', import.meta.url), { workerData: config });
        try {
          await new Promise<void>((resolve, reject) => {
            const feed = (): void => {
              if (next >= total) {
                // worker_threads의 postMessage라 targetOrigin이 없다(브라우저 window.postMessage 규칙 오탐)
                // oxlint-disable-next-line unicorn/require-post-message-target-origin
                worker.postMessage(null);
                resolve();
                return;
              }
              // oxlint-disable-next-line unicorn/require-post-message-target-origin
              worker.postMessage(next);
              next++;
            };
            worker.on('message', (msg: { unit: number; records: RoundRecord[] }) => {
              results.set(msg.unit, msg.records);
              onProgress?.(results.size, total);
              feed();
            });
            worker.on('error', reject);
            feed();
          });
        } finally {
          await worker.terminate();
        }
      }),
    );
  }
  return [...results.entries()].toSorted(([a], [b]) => a - b).flatMap(([, r]) => r);
}
