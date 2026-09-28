// 워커: 작업 단위(쌍 또는 세션) 번호를 받아 기록을 돌려준다.
import { parentPort, workerData } from 'node:worker_threads';
import type { SimConfig } from './config.ts';
import { makePolicies, runUnit } from './runner.ts';

// 주 스레드가 넘긴 설정(같은 프로세스의 구조화 복제본)
const config: SimConfig = workerData;
const policies = makePolicies(config);
const port = parentPort;
if (port === null) {
  throw new Error('워커로만 실행합니다');
}
port.on('message', (unit: number | null) => {
  if (unit === null) {
    port.close();
    return;
  }
  port.postMessage({ unit, records: runUnit(config, policies, unit) });
});
