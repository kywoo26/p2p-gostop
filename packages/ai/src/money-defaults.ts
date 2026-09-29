// 가상 머니 기본값 (spec MN-03·MN-04, AC-10). 산정 근거·표: docs/money-model.md (tools/sim 셀프플레이 결과).
// 프리셋마다 상용급 AI 셀프플레이 3,000판(30판 세션 100개)의 판별 순액에서 30판 세션을 복원 추출(200,000세션)해
// 파산 확률 ≤ 5%가 되는 최소 시작 잔액을 점당 100 기준으로 구하고 1·1.5·2·2.5·3·4·5·6·8×10^k 단위로 올렸다.
// 다른 점당 금액은 선형 비례(MN-04 자동 제안, 사용자가 바꿀 수 있음).
import type { PresetId } from '@p2p-gostop/engine';

/** 점당 금액 선택지 (MN-04) */
export const PER_POINT_OPTIONS = [50, 100, 200, 500, 1000] as const;

export type PerPoint = (typeof PER_POINT_OPTIONS)[number];

export const DEFAULT_PER_POINT: PerPoint = 100;

/** 산정 조건 (MN-03) */
export const MONEY_MODEL_BASIS = Object.freeze({
  /** 기준 점당 금액 */
  referencePerPoint: 100,
  /** 기본 세션 길이(판) */
  sessionLength: 30,
  /** 파산 확률 목표 */
  bankruptcyTarget: 0.05,
  /** 프리셋별 셀프플레이 판 수 */
  roundsPerPreset: 3000,
  /** 몬테카를로 세션 수 */
  monteCarloSessions: 200_000,
});

export interface PresetMoneyStats {
  /** 점당 100 기준 시작 잔액 기본값 */
  readonly startBalance: number;
  /** 그 잔액으로 시작한 30판 세션의 파산 확률(몬테카를로 추정) */
  readonly bankruptcyRisk: number;
  /** 이 프리셋으로 직접 산정 */
  readonly basis: 'measured';
  /** 실제 돈 이동이 있는 판의 순액 크기(점, 나가리·무이동 밀기 제외, 즉시 정산 포함) */
  readonly perRoundPoints: {
    readonly mean: number;
    readonly std: number;
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
    readonly max: number;
  };
}

const STANDARD: PresetMoneyStats = Object.freeze({
  startBalance: 150_000,
  bankruptcyRisk: 0.0451,
  basis: 'measured',
  perRoundPoints: Object.freeze({ mean: 44.6, std: 196.6, p50: 16, p95: 116, p99: 544, max: 7680 }),
});

/** 프리셋별 산정 결과 (docs/money-model.md 표와 같다) */
export const MONEY_STATS: Readonly<Record<PresetId, PresetMoneyStats>> = Object.freeze({
  standard: STANDARD,
  traditional: Object.freeze({
    startBalance: 80_000,
    bankruptcyRisk: 0.02076,
    basis: 'measured',
    perRoundPoints: Object.freeze({ mean: 26.9, std: 54.1, p50: 14, p95: 81, p99: 320, max: 832 }),
  }),
  arcade: Object.freeze({
    startBalance: 200_000,
    bankruptcyRisk: 0.044865,
    basis: 'measured',
    perRoundPoints: Object.freeze({
      mean: 57.4,
      std: 206.9,
      p50: 20,
      p95: 184,
      p99: 889,
      max: 4864,
    }),
  }),
});

/** 시작 잔액 제안 = 점당 100 기준값 × 점당 / 100 (선형 비례) */
export function suggestedStartBalance(preset: PresetId, perPoint: number): number {
  return Math.round(
    (MONEY_STATS[preset].startBalance * perPoint) / MONEY_MODEL_BASIS.referencePerPoint,
  );
}

const STANDARD_ROW: Readonly<Record<PerPoint, number>> = Object.freeze({
  50: 75_000,
  100: 150_000,
  200: 300_000,
  500: 750_000,
  1000: 1_500_000,
});

const TRADITIONAL_ROW: Readonly<Record<PerPoint, number>> = Object.freeze({
  50: 40_000,
  100: 80_000,
  200: 160_000,
  500: 400_000,
  1000: 800_000,
});

const ARCADE_ROW: Readonly<Record<PerPoint, number>> = Object.freeze({
  50: 100_000,
  100: 200_000,
  200: 400_000,
  500: 1_000_000,
  1000: 2_000_000,
});

/** 프리셋 × 점당 금액 → 시작 잔액 기본값 (설정 화면·도움말용 표) */
export const START_BALANCE_TABLE: Readonly<Record<PresetId, Readonly<Record<PerPoint, number>>>> =
  Object.freeze({ standard: STANDARD_ROW, traditional: TRADITIONAL_ROW, arcade: ARCADE_ROW });
