// FR-RP-07 / NF-RP-06: 로컬 release ZIP만 검증한다. 다운로드·프로세스 실행은 없다.
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 4096;
const notices = new Set(['cards/ATTRIBUTION.md', 'pro/NOTICE.md', 'oss/NOTICE.txt']);
// 기존 build 메타데이터는 전체 manifest에 보존하지만 StaticSite의 served hash에는 넣지 않는다.
const buildMetadata = new Set([
  'skin/NOTICE.md',
  'skin/manifest.json',
  'oss/bundled-packages.json',
  'cards/LICENSE',
]);
const extensions =
  /\.(?:html|js|css|svg|png|jpg|jpeg|webp|avif|woff2|ico|wasm|ogg|mp3|wav|webm|mp4)$/;
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}
function safePath(name) {
  requireValue(
    /^[A-Za-z0-9_/-]+(?:\.[A-Za-z0-9_-]+)*$/.test(name) &&
      !name.startsWith('/') &&
      name
        .split('/')
        .every((part) => part && part !== '.' && part !== '..' && !part.startsWith('.')),
    'UNSAFE_PATH',
  );
}

export function inspectBundle(files, source) {
  requireValue(
    /^[a-f0-9]{40}$/.test(source) && files.size > 0 && files.size <= MAX_FILES,
    'SOURCE',
  );
  for (const path of files.keys()) {
    safePath(path);
    requireValue(
      buildMetadata.has(path) ||
        path === 'version.json' ||
        path === '_app/version.json' ||
        notices.has(path) ||
        extensions.test(path),
      'UNSERVED_FILE',
    );
  }
  const metadata = JSON.parse(files.get('version.json')?.toString('utf8') ?? '{}');
  const kit = JSON.parse(files.get('_app/version.json')?.toString('utf8') ?? '{}');
  requireValue(
    metadata.assetSetVersion === 2 &&
      Number.isSafeInteger(metadata.wireVersion) &&
      metadata.wireVersion > 0 &&
      /^[a-f0-9]{64}$/.test(metadata.hash) &&
      typeof kit.version === 'string' &&
      /^[a-f0-9]{7,40}$/.test(kit.version) &&
      source.startsWith(kit.version),
    'ARTIFACT_METADATA',
  );
  for (const name of notices) requireValue(files.has(name), 'PUBLIC_NOTICE');
  const index = files.get('index.html');
  requireValue(index, 'INDEX');
  const refs = [
    ...new Set(index.toString('utf8').match(/(?:\.\/)?_app\/[A-Za-z0-9_./-]+\.(?:js|css)/g)),
  ]
    .map((ref) => ref.replace(/^\.\//, ''))
    .toSorted((a, b) => a.localeCompare(b));
  requireValue(
    refs.some((ref) => ref.endsWith('.js')) && refs.every((ref) => files.has(ref)),
    'BOOTSTRAP_MISSING',
  );
  const hash = createHash('sha256');
  for (const [path, bytes] of [...files].toSorted(([a], [b]) => a.localeCompare(b))) {
    if (path === 'version.json' || buildMetadata.has(path)) continue;
    hash.update(path);
    hash.update('\0');
    hash.update(bytes);
  }
  requireValue(hash.digest('hex') === metadata.hash, 'ARTIFACT_HASH');
  return {
    hash: metadata.hash,
    wireVersion: metadata.wireVersion,
    assetSetVersion: 2,
    source,
    files: [...files]
      .map(([path, bytes]) => ({ path, sha256: sha256(bytes), size: bytes.length }))
      .toSorted((a, b) => a.path.localeCompare(b.path)),
    initial: refs,
  };
}

async function safeParents(path) {
  const parent = dirname(path);
  if (parent !== path) await safeParents(parent);
  const stat = await lstat(path).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  requireValue(!stat || stat.isDirectory(), 'DIST_PARENT');
}
export async function directoryFiles(root) {
  await safeParents(resolve(root));
  const files = new Map();
  let total = 0;
  async function visit(relative) {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      const stat = await lstat(join(root, path));
      requireValue(!stat.isSymbolicLink(), 'DIST_SYMLINK');
      if (stat.isDirectory()) {
        safePath(path);
        await visit(path);
      } else {
        requireValue(stat.isFile() && stat.size <= MAX_BYTES, 'DIST_NONREGULAR');
        const bytes = await readFile(join(root, path));
        total += bytes.length;
        requireValue(total <= MAX_BYTES && files.size < MAX_FILES, 'DIST_LIMIT');
        files.set(path, bytes);
      }
    }
  }
  await visit('');
  return files;
}
// CLI는 허용된 메타데이터만 출력하며 경로·URL·native 오류 원문을 내보내지 않는다.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireValue(process.version === 'v24.21.0', 'NODE_PIN');
    const [mode, ...args] = process.argv.slice(2);
    let result;
    if (mode === 'inspect' && args.length === 2)
      result = inspectBundle(await directoryFiles(args[0]), args[1]);
    else throw new Error('ARGUMENTS');
    console.log(JSON.stringify(result));
  } catch {
    console.error('Relay artifact validation refused; paths and native details withheld.');
    process.exitCode = 2;
  }
}
