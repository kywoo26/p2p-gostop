import { reportFailure } from './common.mjs';
import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  artifactRoot,
  repoRoot,
  fixture,
  digest,
  scratchArgument,
  verifyFixtures,
} from './common.mjs';

try {
  if (process.argv[2] === '--help') {
    console.log(JSON.stringify(fixture, null, 2));
  } else {
    await verifyFixtures();
    const scratch = await scratchArgument({ existing: false });
    const font = await readFile(resolve(repoRoot, fixture.font.source));
    assert.equal(digest(font), fixture.font.sha256, 'font drift');
    // recursive 없이 생성: 이미 존재하는 디렉토리는 내용이 없어도 거절한다.
    await mkdir(scratch);
    await writeFile(
      resolve(scratch, '.finite-shell-proof.json'),
      JSON.stringify({ plan: fixture.plan, scope: 'finite-shell' }) + '\n',
      { flag: 'wx' },
    );
    const source = JSON.parse(
      await readFile(resolve(artifactRoot, 'fixtures/source.fixture.json')),
    );
    for (const [path, content] of Object.entries(source)) {
      await mkdir(dirname(resolve(scratch, path)), { recursive: true });
      await writeFile(resolve(scratch, path), content, { flag: 'wx' });
    }
    await writeFile(resolve(scratch, fixture.font.target), font, { flag: 'wx' });
    await copyFile(
      resolve(artifactRoot, 'fixtures/package.fixture.json'),
      resolve(scratch, 'package.json'),
    );
    await copyFile(
      resolve(artifactRoot, 'fixtures/package-lock.fixture.json'),
      resolve(scratch, 'package-lock.json'),
    );
    console.log('source prepared; no install/build/browser executed');
  }
} catch (error) {
  reportFailure(error);
}
