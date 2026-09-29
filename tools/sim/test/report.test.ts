// AI-07·MN-03: 계산/표시 분리 전 CLI의 stdout·저장 JSON/Markdown을 그대로 보존한다.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const cases = [
  { preset: 'standard', mode: 'match', seed: 1, extra: [] },
  { preset: 'traditional', mode: 'session', seed: 7, extra: ['--start-balance', '200'] },
  { preset: 'arcade', mode: 'session', seed: 29, extra: ['--start-balance', '10000'] },
] as const;

test.each(cases)('$preset/$mode 시드 $seed: CLI 출력 계약 (AI-07, MN-03)', async (c) => {
  const output = mkdtempSync(join(tmpdir(), 'gostop-report-'));
  try {
    // 성능 수치는 실행마다 다르므로 자식 프로세스에서만 시계를 고정한다.
    // 시간 제한 없는 random/easy + 단일 워커라 수 선택·난수·진행 횟수에는 영향이 없다.
    const clock =
      'data:text/javascript,' +
      encodeURIComponent("Object.defineProperty(performance, 'now', { value: () => 0 });");
    const stdout = execFileSync(
      process.execPath,
      [
        '--import',
        clock,
        'src/cli.ts',
        '--a',
        'random',
        '--b',
        'easy',
        '--preset',
        c.preset,
        '--mode',
        c.mode,
        '--seed',
        String(c.seed),
        '--rounds',
        '12',
        '--session-length',
        '6',
        '--mc',
        '1000',
        '--workers',
        '1',
        '--out',
        'result',
        ...c.extra,
      ],
      {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, INIT_CWD: output },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      },
    );
    const markdown = readFileSync(join(output, 'result.md'), 'utf8');
    expect(stdout).toBe(markdown);
    await expect(markdown).toMatchFileSnapshot(`./fixtures/reporting/${c.preset}-${c.mode}.md`);
    // .txt는 포맷터가 CLI JSON 바이트를 다시 배치하지 않도록 붙인다.
    await expect(readFileSync(join(output, 'result.json'), 'utf8')).toMatchFileSnapshot(
      `./fixtures/reporting/${c.preset}-${c.mode}.json.txt`,
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
