// NF-07: npm lock의 웹 런타임 그래프와 Gradle releaseRuntimeClasspath의 실제 해석 결과로 고지를 생성한다.
// 개발 이미지 안에서 실행한다. 라이선스 정보가 없는 새 배포 의존성은 생성에 실패시켜 수동 검토한다.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const root = resolve(import.meta.dirname, '../../..');
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const packages = lock.packages;
const webRuntime = new Map();
function visit(name) {
  if (name.startsWith('@p2p-gostop/')) {
    const workspace = name.slice('@p2p-gostop/'.length);
    const manifest = JSON.parse(
      readFileSync(join(root, 'packages', workspace, 'package.json'), 'utf8'),
    );
    for (const dep of Object.keys(manifest.dependencies ?? {})) visit(dep);
    return;
  }
  if (webRuntime.has(name)) return;
  const key = `node_modules/${name}`;
  const item = packages[key];
  if (!item || item.dev === true) throw new Error(`배포 npm 잠금 항목 없음: ${name}`);
  if (typeof item.license !== 'string') throw new Error(`npm 라이선스 누락: ${name}`);
  webRuntime.set(name, item);
  for (const dep of Object.keys(item.dependencies ?? {})) visit(dep);
}
// npm 의존 그래프는 lockfile이 정본이다. workspace 런타임 선언도 잠금 파일 안에 들어 있다.
for (const name of Object.keys(packages['packages/web'].dependencies ?? {})) visit(name);
// Svelte 런타임은 빌드 도구와 함께 devDependencies에 선언됐지만 결과 JS에 포함된다.
const svelte = packages['node_modules/svelte'];
if (!svelte || typeof svelte.license !== 'string') throw new Error('Svelte 런타임 고지 누락');
webRuntime.set('svelte', svelte);
const web = [...webRuntime]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, info]) => ({
    name,
    version: info.version,
    license: info.license,
  }));

const report = execFileSync(
  join(root, 'android/gradlew'),
  [
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
  '웹: package-lock.json의 packages/web 런타임 의존 그래프. Android: Gradle releaseRuntimeClasspath 해석 결과와 캐시된 POM 라이선스 메타데이터.',
  '이 목록은 개발·테스트·빌드 전용 도구를 제외합니다. 자산별 저작자 표시는 카드/ATTRIBUTION.md와 pro/NOTICE.md에 있습니다.',
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
