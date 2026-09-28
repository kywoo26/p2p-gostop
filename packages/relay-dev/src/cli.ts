// 사용: node packages/relay-dev/src/cli.ts  (환경변수 PORT, HOST)
import { RELAY_PATH, RELAY_PORT } from '@p2p-gostop/protocol';
import { startRelay } from './index.ts';

const port = Number(process.env['PORT'] ?? RELAY_PORT);
const host = process.env['HOST'] ?? '0.0.0.0';
const relay = await startRelay({ port, host, log: (line) => console.log(`[relay] ${line}`) });
console.log(`[relay] listening on ws://${host}:${relay.port}${RELAY_PATH}?role=host|guest`);

const shutdown = () => {
  void relay.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
