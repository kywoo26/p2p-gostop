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
assert.match(helper, /funnel --https=443 \$Target off/);
assert.match(helper, /Compose 'down'/);
assert.match(helper, /\/health/);
assert.match(helper, /http:\/\/127\.0\.0\.1:17777,\$url/);
assert.match(helper, /\$startedFunnelThisRun = \$true/);
assert.match(helper, /if \(\$startedFunnelThisRun -or \$ownedBeforeStart\)/);
assert.match(helper, /function OwnedFunnelProcessIds/);
assert.match(helper, /Get-CimInstance Win32_Process/);
assert.doesNotMatch(helper, /compose run[^\r\n]*\bdev\b/);
assert.doesNotMatch(helper, /^\s*[^#\r\n]*funnel\s+--bg\b/im);
assert.doesNotMatch(helper, /funnel reset|tailscale down/i);

console.log('RP-03A/B 정적 배포 경계 확인 완료');
