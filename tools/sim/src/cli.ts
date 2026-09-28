// 셀프플레이 시뮬레이션 CLI (plan.md M2). 사용: npm run sim -- --a commercial --b normal --rounds 2000
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs, USAGE, type SideConfig } from './config.ts';
import { runAll } from './pool.ts';
import { summarize, toMarkdown } from './stats.ts';

/** npm run은 작업 공간 폴더에서 실행되므로 상대 경로는 npm을 부른 폴더(INIT_CWD) 기준으로 푼다. */
const fromCaller = (path: string): string =>
  resolve(process.env['INIT_CWD'] ?? process.cwd(), path);

function loadWeights(side: SideConfig): SideConfig {
  if (side.weightsPath === undefined) {
    return side;
  }
  return {
    ...side,
    weights: JSON.parse(readFileSync(fromCaller(side.weightsPath), 'utf8')) as unknown,
  };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === 'help') {
    console.log(USAGE);
    return;
  }
  const config = { ...parsed, a: loadWeights(parsed.a), b: loadWeights(parsed.b) };
  const started = performance.now();
  let lastLog = 0;
  const records = await runAll(config, (done, total) => {
    const now = performance.now();
    if (now - lastLog > 10_000 || done === total) {
      lastLog = now;
      process.stderr.write(`진행 ${done}/${total} (${((now - started) / 1000).toFixed(0)}s)\n`);
    }
  });
  const summary = summarize(records, config, (performance.now() - started) / 1000);
  const md = toMarkdown(summary);
  if (config.out !== null) {
    const out = fromCaller(config.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(`${out}.json`, `${JSON.stringify(summary, null, 2)}\n`);
    writeFileSync(`${out}.md`, `${md}\n`);
  }
  console.log(md);
}

await main();
