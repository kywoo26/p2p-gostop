import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  repoRoot,
  fixture,
  verifyFixtures,
  verifyLock,
  scratchArgument,
  reportFailure,
} from './common.mjs';
try {
  await verifyFixtures();
  const scratch = await scratchArgument();
  await verifyLock(scratch);
  if (process.version !== fixture.node) throw Error('Node pin mismatch');
  const require = createRequire(resolve(repoRoot, 'package.json'));
  // 정확히 고정한 npm 도구체계의 semver를 사용한다. 프로젝트 런타임 의존성을 추가하지 않는다.
  const npmRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  const npmPackage = JSON.parse(await readFile(resolve(npmRoot, 'npm/package.json')));
  if (npmPackage.version !== fixture.npm) throw Error('npm pin mismatch');
  const semver = require(resolve(npmRoot, 'npm/node_modules/semver/index.js'));
  const lock = JSON.parse(await readFile(resolve(scratch, 'package-lock.json')));
  const baseline = JSON.parse(await readFile(resolve(repoRoot, 'package-lock.json')));
  const exempt = new Map([
    ['@sveltejs/kit', '3.0.0'],
    ['@sveltejs/adapter-static', '4.0.0'],
  ]);
  const now = Date.now(),
    rows = [],
    problems = [];
  const entries = Object.entries(lock.packages).filter(([p]) => p);
  for (let i = 0; i < entries.length; i += 4) {
    await Promise.all(
      entries.slice(i, i + 4).map(async ([path, p]) => {
        const name = path.split('node_modules/').at(-1);
        const response = await fetch('https://registry.npmjs.org/' + encodeURIComponent(name));
        if (!response.ok) throw Error('metadata response ' + response.status);
        const registry = await response.json(),
          v = registry.versions[p.version];
        const published = registry.time[p.version],
          eligible = new Date(Date.parse(published) + 72 * 3600e3).toISOString();
        const allowed = exempt.get(name) === p.version;
        const row = {
          name,
          version: p.version,
          published,
          eligible,
          exempt: allowed,
          integrityMatches: p.integrity === v.dist.integrity,
          integrity: p.integrity,
          provenance: !!v.dist.attestations,
          installScripts: ['preinstall', 'install', 'postinstall'].filter((k) => v.scripts?.[k]),
          peers: [],
          delta:
            baseline.packages[path]?.version === p.version
              ? 'unchanged'
              : baseline.packages[path]?.version
                ? 'changed'
                : 'added',
        };
        if (!published || (!allowed && Date.parse(eligible) > now))
          problems.push({ name, version: p.version, reason: 'age' });
        if (!row.integrityMatches) problems.push({ name, version: p.version, reason: 'integrity' });
        if (v.engines?.node && !semver.satisfies(process.version, v.engines.node))
          problems.push({ name, version: p.version, reason: 'node' });
        for (const [peer, range] of Object.entries(v.peerDependencies ?? {})) {
          let parent = path,
            found;
          while (parent) {
            found = lock.packages[parent + '/node_modules/' + peer];
            if (found) break;
            const end = parent.lastIndexOf('/node_modules/');
            parent = end >= 0 ? parent.slice(0, end) : '';
          }
          found ??= lock.packages['node_modules/' + peer];
          const optional = v.peerDependenciesMeta?.[peer]?.optional === true;
          const valid = found ? semver.satisfies(found.version, range) : optional;
          row.peers.push({ name: peer, range, resolved: found?.version ?? null, optional, valid });
          if (!valid) problems.push({ name, version: p.version, reason: 'peer', peer });
        }
        rows.push(row);
      }),
    );
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(
    resolve(scratch, 'preflight.json'),
    JSON.stringify(
      {
        checked: new Date(now).toISOString(),
        node: process.version,
        count: rows.length,
        problems,
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        count: rows.length,
        problems,
        delta: rows
          .filter((x) => x.delta !== 'unchanged')
          .map(({ name, version, published, delta }) => ({ name, version, published, delta })),
      },
      null,
      2,
    ),
  );
  if (problems.length) process.exitCode = 1;
} catch (error) {
  reportFailure(error);
}
