import { redact, reportFailure } from './common.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, cp, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  artifactRoot,
  fixture,
  digest,
  scratchArgument,
  verifyFixtures,
  verifyLock,
} from './common.mjs';
import { relocate } from './relocate.mjs';

try {
  await verifyFixtures();
  const scratch = await scratchArgument();
  await verifyLock(scratch);
  assert.equal(process.version, fixture.node, 'Node pin mismatch');
  const source = JSON.parse(await readFile(resolve(artifactRoot, 'fixtures/source.fixture.json')));
  for (const [path, content] of Object.entries(source))
    assert.equal(await readFile(resolve(scratch, path), 'utf8'), content, `source drift: ${path}`);
  assert.equal(
    digest(await readFile(resolve(scratch, fixture.font.target))),
    fixture.font.sha256,
    'font drift',
  );
  for (const path of [
    'dist',
    '.svelte-kit',
    'split-original',
    'split-relocated',
    'single-original',
    'inline-original',
    'relocation.json',
  ]) {
    try {
      await access(resolve(scratch, path), constants.F_OK);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw Error(`refusing existing output: ${path}`);
  }
  // 설치는 수행하지 않는다. 재현자가 명시 설치한 두 정확핀과 기존 lock을 재검사한다.
  for (const [name, version] of [
    ['@sveltejs/kit', '3.0.0'],
    ['@sveltejs/adapter-static', '4.0.0'],
    ['vite', '8.3.1'],
  ]) {
    assert.equal(
      JSON.parse(await readFile(resolve(scratch, 'node_modules', name, 'package.json'))).version,
      version,
      `installed pin: ${name}`,
    );
  }
  for (const strategy of ['split', 'single', 'inline']) {
    const target = `${strategy}-original`;
    const result = spawnSync(
      process.execPath,
      [resolve(scratch, 'node_modules/vite/bin/vite.js'), 'build'],
      { cwd: scratch, env: { ...process.env, PROOF_STRATEGY: strategy }, encoding: 'utf8' },
    );
    await writeFile(
      resolve(scratch, `${strategy}-build.log`),
      redact((result.stdout ?? '') + (result.stderr ?? '')),
      { flag: 'wx' },
    );
    assert.equal(result.status, 0, `${strategy} build failed; inspect scratch log`);
    await rename(resolve(scratch, 'dist'), resolve(scratch, target));
  }
  const original = await readFile(resolve(scratch, 'split-original/index.html'), 'utf8');
  const out = relocate(original, fixture.relocation);
  assert.equal(relocate(out.html, fixture.relocation).html, out.html, 'not idempotent');
  await cp(resolve(scratch, 'split-original'), resolve(scratch, 'split-relocated'), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  await writeFile(resolve(scratch, 'split-relocated/index.html'), out.html);
  await writeFile(
    resolve(scratch, 'relocation.json'),
    JSON.stringify({ ...fixture.relocation, verified: true }, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log('split/single/inline built; exact split HTML relocated');
} catch (error) {
  reportFailure(error);
}
