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
    'https://nodejs.org/docs/latest-v24.x/api/test.html',
    'https://github.com/kywoo26/p2p-gostop/issues/208',
    'com.kywoo26.p2pgostop',
    'checkout@v7',
    'return@post',
    'user@example.invalid',
  ])
    assert.equal(scanText(text, 'synthetic.md').findings.length, 0);
});

await test('fontconfig 홈 glob만 허용하고 개인 식별자 wildcard는 검출한다', () => {
  const glob = '<fontconfig>\n  <glob>/home/*</glob>\n</fontconfig>';
  assert.equal(scanText(glob, 'packages/web/e2e/fonts.conf').findings.length, 0);
  assert.ok(scanText(glob, 'notes.md').findings.length > 0);
  for (const text of [
    home + '/*',
    windows + '\\*',
    ['.paseo/', 'worktrees/synthetic-audit/project/*'].join(''),
    ['.orca/', 'worktrees/synthetic-audit/*'].join(''),
    '\\\\wsl$\\Synthetic\\home\\synthetic-audit\\*',
  ]) {
    assert.ok(scanText(text, 'notes.md').findings.length > 0);
  }
  assert.ok(
    scanText('<glob>' + home + '/*</glob>', 'packages/web/e2e/fonts.conf').findings.length > 0,
  );
});

await test('실제 SVG path의 좌표 문법만 면제하고 텍스트/URL/다른 속성은 검출한다', () => {
  const coords = `<svg><path d="M ${ip} 1z"/></svg>`;
  assert.equal(scanText(coords, 'drawing.svg').findings.length, 0);
  for (const [text, path] of [
    [`d="${ip}"`, 'notes.md'],
    [coords, 'notes.md'],
    [`<svg><path d="https://${ip}/"/></svg>`, 'drawing.svg'],
    [`<svg><path d="M0 0 https://${ip}/"/></svg>`, 'drawing.svg'],
    [`<svg><path d="${ip}"/></svg>`, 'drawing.svg'],
    [`<svg><image d="${ip}"/></svg>`, 'drawing.svg'],
    [`<svg><image href="https://${ip}/"/></svg>`, 'drawing.svg'],
    [`<svg><!-- <path d="M ${ip} 1z"/> --></svg>`, 'drawing.svg'],
  ])
    assert.ok(scanText(text, path).findings.some((f) => f.type === 'network-address'));
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
    'creation-secret',
    'runtime/creation-secret.txt',
  ])
    assert.ok(restrictedPath(path));
  assert.equal(restrictedPath('packages/web/src/p2p/host-save.ts'), false);
});

await test('추적 목록만 읽고 secret/ignored/symlink 내용을 열지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p2p-audit-synthetic-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    git('init', '-q');
    mkdirSync(join(dir, 'tools', 'privacy'), { recursive: true });
    const policyPath = join('tools', 'privacy', 'privacy-audit-allowlist.json');
    writeFileSync(join(dir, policyPath), JSON.stringify({ allowances: [], pending: [] }));
    writeFileSync(join(dir, '.gitignore'), 'ignored.md\n');
    writeFileSync(join(dir, 'public.md'), home);
    writeFileSync(join(dir, 'ignored.md'), credential);
    mkdirSync(join(dir, 'private'));
    writeFileSync(join(dir, 'private', 'missing.md'), credential);
    writeFileSync(join(dir, 'creation-secret'), credential);
    symlinkSync('private/missing.md', join(dir, 'link.md'));
    git(
      'add',
      policyPath,
      '.gitignore',
      'private/missing.md',
      'link.md',
      'public.md',
      'creation-secret',
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
      join(dir, policyPath),
      JSON.stringify({
        allowances: [],
        pending: [{ path: 'public.md', type: 'personal-path', lines: [1], baseline }],
      }),
    );
    writeFileSync(join(dir, 'public.md'), home + '-changed');
    git('add', policyPath, 'public.md');
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
    rmSync(join(dir, 'creation-secret'));
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./privacy-audit.mjs', import.meta.url)), '--base', 'HEAD'],
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
      3,
    );
    assert.ok(reports.some((report) => report.restricted === 3 && report.findings === 1));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// 이전 9개 검사와 구분되는 잔여 P2 반례 6개. 고정 합성 좌표만 사용한다.
for (const [name, markup] of [
  ['CDATA 가짜 path', `<svg><![CDATA[<path d="M ${ip} 1z"/>]]></svg>`],
  ['다른 element 이름', `<svg><path-note d="M ${ip} 1z"/></svg>`],
  ['다른 namespace 이름', `<svg><path:note d="M ${ip} 1z"/></svg>`],
  ['M 뒤 연속 쉼표', `<svg><path d="M,, ${ip} 1z"/></svg>`],
  ['숫자 사이 연속 쉼표', `<svg><path d="M ${ip},,1z"/></svg>`],
  ['z 뒤 쉼표', `<svg><path d="M ${ip} 1z,"/></svg>`],
]) {
  await test(`잔여 SVG P2: ${name}는 좌표로 면제하지 않는다`, () => {
    const result = scanText(markup, 'drawing.svg');
    assert.deepEqual(result.findings, [{ line: 1, type: 'network-address' }]);
    assert.equal(result.allowed, 0);
    const valid = `<svg xmlns="http://www.w3.org/2000/svg"><g><path d="M ${ip},1z"/></g></svg>`;
    assert.equal(scanText(valid, 'drawing.svg').allowed, 1);
    assert.equal(scanText(valid, 'drawing.svg').findings.length, 0);
  });
}

await test('같은 회귀표에서 전체 속성 이름·정상 d·기존 SVG 6반례를 구분한다', () => {
  const cases = [
    ...['data.d', 'data.part.d', 'data:d', 'data-d', 'dd', 'd.extra'].map((name) => [
      `<svg><path ${name}="M ${ip} 1z"/></svg>`,
      false,
    ]),
    [`<svg><![CDATA[<path d="M ${ip} 1z"/>]]></svg>`, false],
    [`<svg><path-note d="M ${ip} 1z"/></svg>`, false],
    [`<svg><path:note d="M ${ip} 1z"/></svg>`, false],
    [`<svg><path d="M,, ${ip} 1z"/></svg>`, false],
    [`<svg><path d="M ${ip},,1z"/></svg>`, false],
    [`<svg><path d="M ${ip} 1z,"/></svg>`, false],
    [`<svg><path d="M ${ip} 1z"/></svg>`, true],
    [`<svg><path d = 'M ${ip},1z'/></svg>`, true],
    [`<svg><path data.d="label" d="M ${ip} 1z"/></svg>`, true],
  ];
  for (const [markup, valid] of cases) {
    const result = scanText(markup, 'drawing.svg');
    assert.equal(result.findings.length, valid ? 0 : 1);
    assert.equal(result.allowed, valid ? 1 : 0);
  }
});
