// 배포 시 지정한 web/dist를 시작 시 읽어 메모리에서만 서빙한다. 소스/설정 파일은 경로에 없다.
import { createHash } from 'node:crypto';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PROTOCOL_VERSION } from '@p2p-gostop/protocol';

export interface ReleaseConfig {
  readonly id: string;
  readonly distDir: string;
}
interface Asset {
  readonly body: Buffer;
  readonly type: string;
}
interface Release {
  readonly id: string;
  readonly hash: string;
  readonly wireVersion: number;
  readonly path: string;
  readonly files: Map<string, Asset>;
  readonly assetSetVersion: 1 | 2;
}
const TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  woff2: 'font/woff2',
  ico: 'image/x-icon',
  wasm: 'application/wasm',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  webm: 'video/webm',
  mp4: 'video/mp4',
};
const RELEASE_ID = /^v[0-9]+\.[0-9]+\.[0-9]+$/;
// Kit가 생성한 source build ID. 앱 wire/hash version.json은 공개 파일이 아니다.
const KIT_VERSION_FILE = '_app/version.json';
const PUBLIC_NOTICES = new Set(['cards/ATTRIBUTION.md', 'pro/NOTICE.md', 'oss/NOTICE.txt']);

async function filesIn(root: string): Promise<Map<string, Asset>> {
  const result = new Map<string, Asset>();
  async function visit(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const key = relative(root, path).split(sep).join('/');
      const ext = entry.name.split('.').at(-1)?.toLowerCase() ?? '';
      const type = PUBLIC_NOTICES.has(key)
        ? 'text/plain; charset=utf-8'
        : key === KIT_VERSION_FILE
          ? 'application/json; charset=utf-8'
          : TYPES[ext];
      if (!type || entry.name.endsWith('.map')) continue;
      result.set(key, { body: await readFile(path), type });
    }
  }
  await visit(root);
  if (!result.has('index.html')) throw new Error('web dist requires index.html');
  return result;
}

export class StaticSite {
  private readonly releases: readonly Release[];
  private constructor(releases: readonly Release[]) {
    this.releases = releases;
  }
  static async load(configs: readonly ReleaseConfig[]): Promise<StaticSite> {
    if (configs.length < 1 || configs.length > 2) throw new Error('one or two releases required');
    const releases: Release[] = [];
    const ids = new Set<string>();
    for (const config of configs) {
      if (!RELEASE_ID.test(config.id) || ids.has(config.id))
        throw new Error('invalid release metadata');
      ids.add(config.id);
      const root = resolve(config.distDir);
      if (!(await lstat(root)).isDirectory()) throw new Error('web dist must be a directory');
      let metadata: unknown;
      try {
        const metadataPath = join(root, 'version.json');
        if (!(await lstat(metadataPath)).isFile()) throw new Error('invalid metadata file');
        metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
      } catch {
        throw new Error('missing or invalid artifact version.json');
      }
      if (
        !metadata ||
        typeof metadata !== 'object' ||
        !('wireVersion' in metadata) ||
        !('hash' in metadata) ||
        typeof metadata.wireVersion !== 'number' ||
        !Number.isSafeInteger(metadata.wireVersion) ||
        metadata.wireVersion < 1 ||
        typeof metadata.hash !== 'string'
      )
        throw new Error('artifact version/hash mismatch');
      let assetSetVersion: 1 | 2 = 1;
      // absent만 legacy다. null/string/unknown 값이나 digest 실패에 대한 downgrade는 없다.
      if ('assetSetVersion' in metadata) {
        if (metadata.assetSetVersion !== 2) throw new Error('unsupported artifact assetSetVersion');
        assetSetVersion = 2;
      }
      const files = await filesIn(root);
      if (assetSetVersion === 2) {
        for (const name of PUBLIC_NOTICES) {
          if (!files.has(name)) throw new Error(`missing public notice: ${name}`);
        }
      }
      const hash = createHash('sha256');
      for (const [name, asset] of [...files].toSorted(([a], [b]) => a.localeCompare(b))) {
        if (assetSetVersion === 1 && PUBLIC_NOTICES.has(name)) continue;
        hash.update(name);
        hash.update('\0');
        hash.update(asset.body);
      }
      const digest = hash.digest('hex');
      if (metadata.hash !== digest) throw new Error('artifact version/hash mismatch');
      if (releases.length === 0 && metadata.wireVersion !== PROTOCOL_VERSION)
        throw new Error('current artifact wire version mismatch');
      releases.push({
        id: config.id,
        hash: digest,
        wireVersion: metadata.wireVersion,
        path: `/r/${config.id}/${digest}/`,
        files,
        assetSetVersion,
      });
    }
    return new StaticSite(releases);
  }
  get current(): { release: string; hash: string; wireVersion: number; path: string } {
    const first = this.releases[0]!;
    return {
      release: first.id,
      hash: first.hash,
      wireVersion: first.wireVersion,
      path: first.path,
    };
  }
  version(): object {
    return {
      relay: 'p2p-gostop',
      ready: true,
      controlVersion: 1,
      wireVersion: PROTOCOL_VERSION,
      current: this.current,
      releases: this.releases.map((release) => ({
        release: release.id,
        hash: release.hash,
        wireVersion: release.wireVersion,
        path: release.path,
        compatible: release.wireVersion === PROTOCOL_VERSION,
      })),
    };
  }
  handle(request: IncomingMessage, response: ServerResponse): boolean {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;
    const raw = request.url ?? '/';
    const pathname = raw.split('?')[0] ?? '';
    if (pathname === '/health' || pathname === '/version') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      const body =
        pathname === '/health'
          ? JSON.stringify({
              relay: 'p2p-gostop',
              ready: true,
              controlVersion: 1,
              wireVersion: PROTOCOL_VERSION,
            })
          : JSON.stringify(this.version());
      response.writeHead(200).end(request.method === 'HEAD' ? undefined : body);
      return true;
    }
    if (pathname === '/') {
      response.setHeader('Location', this.current.path);
      response.writeHead(302).end();
      return true;
    }
    // 퍼센트 인코딩, 역슬래시, 점 세그먼트는 정적 파일 이름에 필요 없다.
    if (
      pathname.includes('%') ||
      pathname.includes('\\') ||
      pathname.includes('//') ||
      pathname.split('/').some((part) => part === '.' || part === '..')
    )
      return false;
    for (const release of this.releases) {
      if (!pathname.startsWith(release.path) || release.wireVersion !== PROTOCOL_VERSION) continue;
      const name = pathname.slice(release.path.length) || 'index.html';
      const asset = release.files.get(name);
      if (!asset) return false;
      response.setHeader('Content-Type', asset.type);
      response.setHeader('Content-Length', asset.body.length);
      response.setHeader(
        'Cache-Control',
        name === 'index.html' ||
          name === KIT_VERSION_FILE ||
          (release.assetSetVersion === 1 && PUBLIC_NOTICES.has(name))
          ? 'no-store'
          : 'public, max-age=31536000, immutable',
      );
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.writeHead(200).end(request.method === 'HEAD' ? undefined : asset.body);
      return true;
    }
    return false;
  }
}
