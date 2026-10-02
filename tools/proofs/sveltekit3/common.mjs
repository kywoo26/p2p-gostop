import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

export const artifactRoot = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(artifactRoot, '../../..');
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const fixture = JSON.parse(
  await readFile(resolve(artifactRoot, 'fixtures/proof.fixture.json')),
);
export async function verifyFixtures() {
  for (const [path, hash] of Object.entries(fixture.hashes)) {
    assert.equal(
      digest(await readFile(resolve(artifactRoot, path))),
      hash,
      `fixture drift: ${path}`,
    );
  }
}
export async function scratchArgument({ existing = true } = {}) {
  assert.equal(await realpath(process.cwd()), await realpath(repoRoot), 'run from repository root');
  const arg = process.argv[2];
  assert.ok(arg && isAbsolute(arg), 'scratch must be an absolute CLI argument');
  const scratch = resolve(arg);
  const parent = await realpath(dirname(scratch));
  const canonical = resolve(parent, scratch.split('/').at(-1));
  const rel = relative(await realpath(repoRoot), canonical);
  assert.ok(rel.startsWith('../'), 'scratch must be outside repository');
  if (existing) {
    assert.equal(await realpath(scratch), canonical, 'scratch symlink rejected');
    const marker = JSON.parse(await readFile(resolve(scratch, '.finite-shell-proof.json')));
    assert.deepEqual(marker, { plan: fixture.plan, scope: 'finite-shell' }, 'unknown scratch');
  }
  return canonical;
}
export async function verifyLock(scratch) {
  for (const [actual, expected] of [
    ['package.json', 'fixtures/package.fixture.json'],
    ['package-lock.json', 'fixtures/package-lock.fixture.json'],
  ]) {
    assert.equal(
      digest(await readFile(resolve(scratch, actual))),
      fixture.hashes[expected],
      `${actual} drift`,
    );
  }
  const lock = JSON.parse(await readFile(resolve(scratch, 'package-lock.json')));
  assert.equal(lock.packages['node_modules/@sveltejs/kit'].version, '3.0.0');
  assert.equal(lock.packages['node_modules/@sveltejs/adapter-static'].version, '4.0.0');
}

export function redact(value) {
  let result = String(value).replaceAll(repoRoot, '<repoRoot>');
  if (process.argv[2] && isAbsolute(process.argv[2]))
    result = result.replaceAll(process.argv[2], '<scratch>');
  return result.replaceAll(homedir(), '<home>');
}
export function reportFailure(error) {
  console.error(redact(error.message ?? error.name));
  process.exitCode = 1;
}
