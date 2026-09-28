// 사용: node packages/relay-dev/src/cli.ts --port 17777  (환경변수 PORT, HOST도 지원)
import { RELAY_PATH, RELAY_PORT } from '@p2p-gostop/protocol';
import { startRelay } from './index.ts';

const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const portValue = portFlag < 0 ? undefined : args[portFlag + 1];
const port = Number(portValue ?? process.env['PORT'] ?? RELAY_PORT);
if (
  !Number.isInteger(port) ||
  port < 0 ||
  port > 65535 ||
  (portFlag >= 0 && portValue === undefined)
) {
  throw new RangeError('--port는 0~65535 정수여야 합니다');
}
const host = process.env['HOST'] ?? '0.0.0.0';
const relay = await startRelay({ port, host, log: (line) => console.log(`[relay] ${line}`) });
console.log(`[relay] listening on ws://${host}:${relay.port}${RELAY_PATH}?role=host|guest`);

const shutdown = () => {
  void relay.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
