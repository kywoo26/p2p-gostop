// MN-05: 버전 분기 → 알려진 보완 → v1 검증. 모르는 버전은 복원하지 않는다.
import * as z from 'zod/mini';
import type { SessionState } from '../game/session.ts';
import { Balances, Money } from './session-game-schema.ts';
import { isObject, SessionV1 } from './session-schema.ts';

const LegacyBalance = z
  .object({
    config: z.object({ startBalance: Money }),
    ledger: z.object({ balances: Balances }),
  })
  .check(
    z.refine(
      ({ config, ledger }) => ledger.balances[0] + ledger.balances[1] === config.startBalance * 2,
    ),
  );

/** v0(재충전 합계 필드 전)는 잔액 합이 초기값일 때만 보완한다. */
function migrateSession(raw: Record<string, unknown>): Record<string, unknown> | null {
  // v1 초기 저장에는 hintUsage가 없다. 정산 때도 미확인으로 이어지도록 필드 부재를 그대로 둔다.
  if (raw['version'] === 1) return raw;
  if (raw['version'] !== 0) return null;
  const legacy = LegacyBalance.safeParse(raw);
  if (!legacy.success) return null;
  // 검증 결과의 복사본 대신 원래 잔액 참조도 유지한다(기존 v0 보완과 동일).
  const ledger = raw['ledger'] as Record<string, unknown>;
  return {
    ...raw,
    version: 1,
    refilled: [0, 0],
    roundStart: raw['roundStart'] ?? ledger['balances'],
  };
}

/** localStorage 입력을 검증한다. 추가 필드와 규칙 속성 순서를 보존하도록 원본을 반환한다. */
export function parseSession(raw: unknown): SessionState | null {
  if (!isObject(raw)) return null;
  const migrated = migrateSession(raw);
  if (migrated === null || !SessionV1.safeParse(migrated).success) return null;
  return migrated as unknown as SessionState;
}
