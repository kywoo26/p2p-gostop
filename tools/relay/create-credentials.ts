// RP-03A / NP-RP-02. WSL 호스트에서 한 번 실행한다. 비밀은 stdout에 쓰지 않는다.
import { randomBytes } from 'node:crypto';
import { mkdir, open, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

const output = process.argv[2];
const path = resolve(output ?? '');
const allowed = resolve(homedir(), '.local/share/p2p-gostop/relay/creation-secret');
if (output === undefined || path !== allowed) {
  throw new Error(
    '비밀은 사용자 홈의 .local/share/p2p-gostop/relay/creation-secret에만 생성합니다',
  );
}
await mkdir(dirname(path), { recursive: true, mode: 0o700 });
const homeReal = await realpath(homedir());
const parentReal = await realpath(dirname(path));
if (parentReal !== resolve(homeReal, '.local/share/p2p-gostop/relay')) {
  throw new Error('생성 경로에 심볼릭 링크가 있습니다');
}
const file = await open(path, 'wx', 0o600);
try {
  await file.writeFile(`${randomBytes(32).toString('base64url')}\n`, 'utf8');
  await file.chmod(0o600);
} finally {
  await file.close();
}
console.log(
  `생성 자격 파일 생성 완료: ${path} (0600, base64url 43자). 내용을 공개하거나 로그에 붙이지 마세요.`,
);
