// RP-03A / NP-RP-02. 개발 이미지에서 한 번 실행한다. 비밀은 stdout에 쓰지 않는다.
import { randomBytes } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = process.argv[2];
if (output === undefined || !output.startsWith('/relay-secret/')) {
  throw new Error('비밀은 저장소 밖 /relay-secret 바인드 마운트에만 생성합니다');
}
const path = resolve(output);
await mkdir(resolve(path, '..'), { recursive: true, mode: 0o700 });
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
