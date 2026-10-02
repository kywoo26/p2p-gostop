// NF-07: 수동 oss:refresh 전용. 웹 build/check/test/lint에서는 실행하지 않는다.
// 호스트에서 실행하고, 새 배포 의존성의 라이선스 누락은 수동 검토한다.
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';

if (process.getuid?.() === 0) throw new Error('OSS 고지 갱신은 dev 사용자로 실행하세요');

const root = resolve(import.meta.dirname, '../../..');
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const packages = lock.packages;
const bundled = JSON.parse(
  await readFile(join(root, 'packages/web/dist/oss/bundled-packages.json'), 'utf8'),
);
if (
  !Array.isArray(bundled) ||
  bundled.length < 3 ||
  bundled.some((name) => typeof name !== 'string')
)
  throw new Error('Vite 배포 모듈 목록이 없습니다');
const web = bundled.map((name) => {
  // devDependencies에 선언된 Svelte·clsx도 실제 배포 JS에 있으면 반드시 포함한다.
  const item = packages[`node_modules/${name}`];
  if (!item || typeof item.license !== 'string') throw new Error(`npm 잠금/라이선스 누락: ${name}`);
  return { name, version: item.version, license: item.license };
});

const projectCache = await mkdtemp(join(tmpdir(), 'p2p-oss-gradle-'));
let report;
try {
  report = execFileSync(
    join(root, 'android/gradlew'),
    [
      '--max-workers=4',
      '--no-daemon',
      '--project-cache-dir',
      projectCache,
      '-p',
      join(root, 'android'),
      ':app:dependencies',
      '--configuration',
      'releaseRuntimeClasspath',
      '--console',
      'plain',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
} finally {
  await rm(projectCache, { recursive: true, force: true });
}
const coordinates = new Set();
for (const line of report.split('\n')) {
  if (line.includes(' (c)')) continue;
  const match = line.match(/[+\\]--- ([\w.-]+):([\w.-]+):([\w.-]+)(?: -> ([\w.-]+))?/);
  if (match) coordinates.add(`${match[1]}:${match[2]}:${match[4] ?? match[3]}`);
}
if (coordinates.size < 30)
  throw new Error(`Gradle 런타임 항목이 너무 적습니다: ${coordinates.size}`);

const gradleCache = join(homedir(), '.gradle/caches/modules-2/files-2.1');
async function pomLicense(group, artifact, version) {
  // 이 분리 배포물의 POM에는 licenses가 없다. Google Guava 원본 LICENSE를 따른다.
  if (`${group}:${artifact}` === 'com.google.guava:listenablefuture') return 'Apache License 2.0';
  // POM에 licenses가 없는 배포물은 각각의 프로젝트 공식 LICENSE를 검토했다.
  if (`${group}:${artifact}` === 'com.google.zxing:core') return 'Apache License 2.0';
  if (`${group}:${artifact}` === 'org.slf4j:slf4j-api') return 'MIT';
  const dir = join(gradleCache, group, artifact, version);
  for (const hash of await readdir(dir)) {
    const files = await readdir(join(dir, hash));
    const filename = files.find((file) => file.endsWith('.pom'));
    if (!filename) continue;
    const pom = await readFile(join(dir, hash, filename), 'utf8');
    const names = [...pom.matchAll(/<license>\s*<name>([^<]+)<\/name>/g)].map((m) => m[1].trim());
    if (names.length) return [...new Set(names)].join(' OR ');
  }
  return 'UNKNOWN';
}
const android = [];
for (const coordinate of [...coordinates].sort()) {
  const [group, artifact, version] = coordinate.split(':');
  android.push({
    name: `${group}:${artifact}`,
    version,
    license: await pomLicense(group, artifact, version),
  });
}
const unknown = android.filter((item) => item.license === 'UNKNOWN');
if (unknown.length)
  throw new Error(`Gradle POM 라이선스 누락: ${unknown.map((item) => item.name).join(', ')}`);

const notice = [
  '# 배포 의존성 오픈소스 고지',
  '',
  '웹·Android 배포 의존성만 표시합니다. 카드·자산 출처: cards/ATTRIBUTION.md, pro/NOTICE.md.',
  '',
  '## 웹 런타임',
  ...web.map((item) => `${item.name} ${item.version} — ${item.license}`),
  '',
  '## Android 런타임',
  ...android.map((item) => `${item.name} ${item.version} — ${item.license}`),
  '',
  '## 웹 라이선스 원문',
];
for (const item of web) {
  const dir = join(root, 'node_modules', item.name);
  const licenseFile = (await readdir(dir)).find((name) => /^LICEN[SC]E(?:\..*)?$/i.test(name));
  if (!licenseFile) throw new Error(`npm 라이선스 원문 없음: ${item.name}`);
  notice.push(
    `### ${item.name} ${item.version}`,
    await readFile(join(dir, licenseFile), 'utf8'),
    '',
  );
}
notice.push(
  '## Apache License 2.0 원문',
  await readFile('/usr/share/common-licenses/Apache-2.0', 'utf8'),
);
// SLF4J의 MIT 원문은 배포 JAR에 들어 있으며 POM에는 license 항목이 없다.
const slf4jDir = join(
  gradleCache,
  'org.slf4j',
  'slf4j-api',
  android.find((item) => item.name === 'org.slf4j:slf4j-api')?.version ?? '',
);
for (const hash of await readdir(slf4jDir)) {
  const jar = (await readdir(join(slf4jDir, hash))).find((file) => file.endsWith('.jar'));
  if (jar) {
    notice.push(
      '## SLF4J MIT 원문',
      execFileSync('unzip', ['-p', join(slf4jDir, hash, jar), 'META-INF/LICENSE.txt'], {
        encoding: 'utf8',
      })
        .replace(/\r\n/g, '\n')
        .trimEnd(),
    );
    break;
  }
}
const out = join(root, 'packages/web/public/oss');
await mkdir(out, { recursive: true });
await writeFile(join(out, 'NOTICE.txt'), `${notice.join('\n').trimEnd()}\n`);
await writeFile(
  join(root, 'packages/web/src/oss-notices.json'),
  `${JSON.stringify({ web, android }, null, 2)}\n`,
);
console.log(`OSS 고지: 웹 ${web.length}개, Android ${android.length}개`);
