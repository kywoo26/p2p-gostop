import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function writeArtifact(
  root: string,
  wireVersion: number,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  const hash = createHash('sha256');
  for (const [name, body] of Object.entries(files).toSorted(([a], [b]) => a.localeCompare(b))) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), body);
    hash.update(name);
    hash.update('\0');
    hash.update(body);
  }
  await writeFile(
    join(root, 'version.json'),
    JSON.stringify({ wireVersion, hash: hash.digest('hex') }),
  );
}
