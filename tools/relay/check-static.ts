// RP-03B: Windows 실행 전 배포 경계와 수동 시작 계약을 정적으로 확인한다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [dockerfile, compose, start, stop, helper] = await Promise.all(
  [
    'docker/relay/Dockerfile',
    'compose.relay.yaml',
    'tools/relay/start.cmd',
    'tools/relay/stop.cmd',
    'tools/relay/relay.ps1',
  ].map((path) => readFile(path, 'utf8')),
);

assert.match(dockerfile, /COPY .*packages\/web\/dist/);
assert.match(dockerfile, /FROM node:24\.21\.0-alpine AS dependencies/);
assert.doesNotMatch(dockerfile, /p2p-gostop-dev/);
assert.match(dockerfile, /^USER node$/m);
assert.match(compose, /127\.0\.0\.1:17777:17777/);
assert.match(compose, /restart: 'no'/);
assert.match(compose, /read_only: true/);
assert.match(compose, /RELAY_PUBLIC: '1'/);
assert.match(compose, /RELAY_CREATION_SECRET_FILE: \/run\/secrets\/creation-secret/);
assert.match(compose, /RELAY_ALLOWED_ORIGINS:/);
assert.match(compose, /RELAY_RELEASE:/);
assert.match(compose, /RELAY_DIST_DIR:/);
assert.match(compose, /127\.0\.0\.1:17777\/health/);
assert.match(start, /relay\.ps1" start/i);
assert.match(stop, /relay\.ps1" stop/i);
assert.match(helper, /\/health/);
assert.match(helper, /http:\/\/127\.0\.0\.1:17777,https:\/\//);
assert.doesNotMatch(helper, /compose run[^\r\n]*\bdev\b/);
assert.doesNotMatch(helper, /funnel reset|tailscale down|Stop-Process|OwnedFunnelProcessIds/i);
assert.doesNotMatch(helper, /2>&1|\$LASTEXITCODE/);

const [runtime, selector, ownership] = await Promise.all(
  ['runtime.cmd', 'select-runtime.ps1', 'ownership.ps1'].map((name) =>
    readFile(`tools/relay/${name}`, 'utf8'),
  ),
);
assert.match(start, /call "%~dp0runtime\.cmd"/);
assert.match(stop, /call "%~dp0runtime\.cmd"/);
assert.doesNotMatch(runtime, /where\.exe|%CD%/i);
assert.match(runtime, /select-runtime\.ps1/);
assert.match(selector, /PSEdition -ne "Core"/);
assert.match(selector, /PSVersion\.Major -ne 7/);
assert.match(helper, /compose -p /);
assert.match(helper, /up -d --no-build --no-recreate --pull never/);
assert.match(ownership, /FileShare\]::None/);
assert.match(ownership, /RelayAtomicFile\]::Replace/);
assert.doesNotMatch(ownership, /Stop-Process|funnel reset|tailscale down/i);
console.log('RP-03A/B 배포·실행 경계 확인 완료');

// 공개 문서는 실제 계정/호스트/임시 worktree 대신 placeholder를 사용한다.
const publicDocs = await Promise.all(
  ['README.md', 'validation.md'].map((name) => readFile(`tools/relay/${name}`, 'utf8')),
);
for (const document of publicDocs) {
  assert.doesNotMatch(document, /\/home\/[a-z0-9_-]+\/|\.paseo\/worktrees\/|\\Users\\[^<>\\]+\\/i);
  assert.doesNotMatch(document, /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net/i);
}
assert.doesNotMatch(helper, /\/home\/[a-z0-9_-]+\//i);
assert.match(helper, /command -v docker/);
assert.match(helper, /\$Repo = \$env:RELAY_WSL_REPO/);

assert.doesNotMatch(publicDocs[0], /docker compose -f compose\.relay\.yaml (?:logs|ps|down)/);
