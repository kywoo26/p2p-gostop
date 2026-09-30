// #208: 실환경 자료 없이 합성 정상/경계/반례와 출력 비노출 계약을 검증한다.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { restrictedPath, scanText, scanDiff } from './privacy-audit.mjs';

const home = ['/ho', 'me/synthetic-audit/project'].join('');
const windows = ['C:', '\\Users\\synthetic-audit\\project'].join('');
const host = ['synthetic-audit.', 'tail-fixture.ts.net'].join('');
const credential = ['ghp_', 'syntheticCounterexampleOnly123456789'].join('');
const literal = ['secret: ', '"'].join('') + 'ab'.repeat(32) + '"';
const token = ['#g', '=', 'not-a-real-invite'].join('');
const ip = ['10', '23', '42', '9'].join('.');

await test('각 경로 형식과 hostname/주소/credential/invite를 값 없이 검출한다', () => {
  for (const [text, type] of [
    [home, 'personal-path'],
    [windows, 'personal-path'],
    [JSON.stringify(windows), 'personal-path'],
    ['\\\\wsl$\\Synthetic\\home\\synthetic-audit', 'personal-path'],
    [['.paseo/', 'worktrees/synthetic-audit'].join(''), 'worktree-path'],
    [host, 'tailnet-host'],
    [ip, 'network-address'],
    [credential, 'credential'],
    [token, 'invite-secret'],
    [literal, 'literal-credential'],
    [['https://', 'synthetic-user:synthetic-password@example.invalid/'].join(''), 'url-credential'],
  ]) {
    const result = scanText(text, 'synthetic.md');
    assert.ok(result.findings.some((finding) => finding.type === type));
    assert.ok(!JSON.stringify(result).includes(text));
    assert.ok(result.findings.every((finding) => Object.keys(finding).join(',') === 'line,type'));
  }
});

await test('placeholder·공식 링크·패키지 ID·정상 fontconfig glob은 허용한다', () => {
  for (const text of [
    '$HOME/project',
    '/home/<developer>/project',
    'C:\\Users\\<developer>\\project',
    '/home/*',
    '/Users/*',
    'https://nodejs.org/docs/latest-v24.x/api/test.html',
    'https://github.com/kywoo26/p2p-gostop/issues/208',
    'com.kywoo26.p2pgostop',
    'checkout@v7',
    'return@post',
    'user@example.invalid',
  ])
    assert.equal(scanText(text, 'synthetic.md').findings.length, 0);
});

await test('SVG d 좌표를 주소로 오인하지 않으며 URL 속성의 주소는 검출한다', () => {
  assert.equal(scanText(`<path d="M${ip}z"/>`, 'drawing.svg').findings.length, 0);
  assert.ok(
    scanText(`<image href="https://${ip}/"/>`, 'drawing.svg').findings.some(
      (f) => f.type === 'network-address',
    ),
  );
});

await test('합성 허용은 경로·행·필드 포함 정확 지문에 묶고 이동/변경은 검출한다', () => {
  const entry = {
    path: 'fixture.json',
    type: 'literal-credential',
    line: 1,
    field: 'secret',
    sha256: createHash('sha256').update(literal).digest('hex'),
    reason: '합성 두 글자 반복',
  };
  assert.equal(scanText(literal, entry.path, [entry]).findings.length, 0);
  for (const [text, path] of [
    [literal.replace('ab', 'cd'), entry.path],
    [literal, 'other.json'],
    [literal.replace('secret:', 'hostSecret:'), entry.path],
    ['\n' + literal, entry.path],
  ])
    assert.ok(scanText(text, path, [entry]).findings.length > 0);
  assert.ok(scanText('secret: "' + 'a'.repeat(64) + '"', entry.path, [entry]).findings.length > 0);
});

await test('PR diff는 삭제·문맥을 제외하고 실제 추가 행 위치를 유지한다', () => {
  const diff = [
    'diff --git a/new.md b/new.md',
    '--- a/new.md',
    '+++ b/new.md',
    '@@ -3,2 +9,2 @@',
    '-' + home,
    ' context',
    '+' + home,
  ].join('\n');
  assert.deepEqual(scanDiff(diff), [{ path: 'new.md', line: 10, type: 'personal-path' }]);
  assert.equal(scanDiff(diff.replace('+' + home, '+$HOME/project')).length, 0);
});

await test('PR 추가 행 허용에 전체 파일의 행 번호를 사용한다', () => {
  const allowance = {
    path: 'fixture.json',
    type: 'literal-credential',
    line: 20,
    sha256: createHash('sha256').update(literal).digest('hex'),
  };
  const diff = ['+++ b/fixture.json', '@@ -0,0 +20 @@', '+' + literal].join('\n');
  assert.equal(scanDiff(diff, [allowance]).length, 0);
  assert.ok(scanDiff(diff.replace('+20', '+21'), [allowance]).length > 0);
});

await test('비밀 경로는 경로 유형만 판단한다', () => {
  for (const path of [
    'secrets/runtime.json',
    '.env',
    '.env.local',
    'private/data.txt',
    'keys/test.key',
    'android/release.keystore',
  ])
    assert.ok(restrictedPath(path));
  assert.equal(restrictedPath('packages/web/src/p2p/host-save.ts'), false);
});

await test('추적 목록만 읽고 secret/ignored/symlink 내용을 열지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p2p-audit-synthetic-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    git('init', '-q');
    writeFileSync(
      join(dir, 'privacy-audit-allowlist.json'),
      JSON.stringify({ allowances: [], pending: [] }),
    );
    writeFileSync(join(dir, '.gitignore'), 'ignored.md\n');
    writeFileSync(join(dir, 'public.md'), home);
    writeFileSync(join(dir, 'ignored.md'), credential);
    mkdirSync(join(dir, 'private'));
    writeFileSync(join(dir, 'private', 'missing.md'), credential);
    symlinkSync('private/missing.md', join(dir, 'link.md'));
    git(
      'add',
      'privacy-audit-allowlist.json',
      '.gitignore',
      'private/missing.md',
      'link.md',
      'public.md',
    );
    git(
      '-c',
      'user.name=Synthetic',
      '-c',
      'user.email=synthetic@example.invalid',
      'commit',
      '-qm',
      'test: synthetic audit boundary',
    );
    const baseline = git('rev-parse', 'HEAD').toString().trim();
    writeFileSync(
      join(dir, 'privacy-audit-allowlist.json'),
      JSON.stringify({
        allowances: [],
        pending: [{ path: 'public.md', type: 'personal-path', lines: [1], baseline }],
      }),
    );
    writeFileSync(join(dir, 'public.md'), home + '-changed');
    git('add', 'privacy-audit-allowlist.json', 'public.md');
    git(
      '-c',
      'user.name=Synthetic',
      '-c',
      'user.email=synthetic@example.invalid',
      'commit',
      '-qm',
      'test: pending content changed',
    );
    rmSync(join(dir, 'private', 'missing.md'));
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./privacy-audit.mjs', import.meta.url))],
      { cwd: dir, encoding: 'utf8' },
    );
    assert.equal(child.status, 1);
    assert.ok(!child.stdout.includes(credential));
    assert.ok(!child.stdout.includes('audit-read-error'));
    const reports = child.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(
      reports.filter((report) => report.findings?.[0]?.type === 'restricted-path-not-opened')
        .length,
      2,
    );
    assert.ok(reports.some((report) => report.restricted === 2 && report.findings === 1));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
