// 평가 가중치 (spec AI-07: 코드와 분리된 파일). weights/default.json을 읽어 형태를 검증한다.
// 조정 기록은 docs/ai-tuning.md.
import defaultJson from './weights/default.json' with { type: 'json' };

type Tuple3 = readonly [number, number, number];

export interface ComboWeights {
  /** 현재 점수 1점의 가치 */
  readonly score: number;
  /** 광 k장(0·1·2) 보유, 3광 완성 가능할 때 부분 점수 */
  readonly gwangPartial: Tuple3;
  /** 3·4광 보유, 다음 광이 살아 있을 때 */
  readonly gwangNext: number;
  /** 고도리 새 k장(0·1·2), 상대가 새를 하나도 안 가졌을 때 */
  readonly godoriPartial: Tuple3;
  /** 홍·청·초단 k장(0·1·2), 상대가 그 단을 하나도 안 가졌을 때 */
  readonly danPartial: Tuple3;
  /** 열끗·띠 5장 문턱까지의 진행도(진행률²에 곱함) */
  readonly countProgress: number;
  /** 피 10 미만일 때 피 1장(가치 1)의 가치 */
  readonly piUnit: number;
  /** 멍따(열끗 7장) 진행: 열끗 5장 이상일 때 1장당 */
  readonly meongttaStep: number;
}

export interface RiskWeights {
  /** 내 피가 피박 문턱 이하일 때의 위험 (상대 피 진행도에 비례) */
  readonly piBak: number;
  /** 내 광 0장이고 상대가 광을 모을 때의 위험 */
  readonly gwangBak: number;
  /** 고를 부른 뒤 지면 고박 */
  readonly goBak: number;
  /** 고 1회당 가산 기대 */
  readonly goBonus: number;
}

export interface TacticWeights {
  /** 내 손패로 바닥을 먹을 수 있는 기회의 가치 */
  readonly handMatch: number;
  /** 바닥 카드를 상대가 먹을 위험(확률 × 가치) */
  readonly exposure: number;
  /** 카드 가치에서 상대가 못 갖게 하는 몫(견제) */
  readonly denial: number;
  /** 피 뺏기 1장의 가치(피 단위) */
  readonly steal: number;
}

export interface RolloutWeights {
  /** 보너스 카드를 먼저 내는 가치 */
  readonly bonus: number;
  /** 폭탄 가산 */
  readonly bomb: number;
  /** 폭탄패(뒤집기만) 가치 */
  readonly flipOnly: number;
  /** 버리는 카드(먹을 게 없음)를 상대가 먹을 확률에 곱하는 벌점 */
  readonly discard: number;
  /** 결정 잡음(동점 깨기·다양성) */
  readonly noise: number;
}

export interface GoStopWeights {
  /** 규칙 기반 고/스톱의 보통 상한. bold > 0인 저위험 박 기회에는 한 번 추가한다. */
  readonly maxGo: number;
  /** 상대 현재 점수가 이 이상이면 스톱 */
  readonly oppScoreStop: number;
  /** 남은 내 턴이 이 미만이면 스톱 */
  readonly minTurns: number;
  /** 상대 피박·광박 등 위험 신호(상대 잠재력)가 이 이상이면 스톱 */
  readonly oppPotentialStop: number;
  /** EV(고)가 스톱 × (1 + evMargin × (1-bold)) 초과일 때 고 */
  readonly evMargin: number;
  /** 과감성 [0, 1]: EV 여유를 줄이고, 낮은 상대 위험의 박 기회에 한 번 더 고한다. */
  readonly bold: number;
  /** 고 EV 롤아웃에서 자기 카드 선택에 더할 잡음. 상대는 rollout.noise를 유지한다. */
  readonly selfNoise: number;
}

export interface SearchWeights {
  /** 보상 = winWeight·sign(p) + (1−winWeight)·tanh(p / pointScale) */
  readonly winWeight: number;
  readonly pointScale: number;
  /** UCB 탐험 상수 */
  readonly ucbC: number;
}

export interface Weights {
  readonly combo: ComboWeights;
  readonly risk: RiskWeights;
  readonly tactic: TacticWeights;
  readonly rollout: RolloutWeights;
  readonly goStop: GoStopWeights;
  readonly search: SearchWeights;
}

/** 형태 검증용 틀: 숫자는 'n', 길이 3 튜플은 't3' */
const SHAPE = {
  combo: {
    score: 'n',
    gwangPartial: 't3',
    gwangNext: 'n',
    godoriPartial: 't3',
    danPartial: 't3',
    countProgress: 'n',
    piUnit: 'n',
    meongttaStep: 'n',
  },
  risk: { piBak: 'n', gwangBak: 'n', goBak: 'n', goBonus: 'n' },
  tactic: { handMatch: 'n', exposure: 'n', denial: 'n', steal: 'n' },
  rollout: { bonus: 'n', bomb: 'n', flipOnly: 'n', discard: 'n', noise: 'n' },
  goStop: {
    maxGo: 'n',
    oppScoreStop: 'n',
    minTurns: 'n',
    oppPotentialStop: 'n',
    evMargin: 'n',
    bold: 'n',
    selfNoise: 'n',
  },
  search: { winWeight: 'n', pointScale: 'n', ucbC: 'n' },
} as const;

type Shape = 'n' | 't3' | { readonly [key: string]: Shape };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function check(value: unknown, shape: Shape, path: string): void {
  if (shape === 'n') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`가중치 ${path}: 유한한 숫자가 아닙니다`);
    }
    return;
  }
  if (shape === 't3') {
    if (!Array.isArray(value) || value.length !== 3) {
      throw new TypeError(`가중치 ${path}: 숫자 3개 배열이 아닙니다`);
    }
    value.forEach((v: unknown, i) => check(v, 'n', `${path}[${i}]`));
    return;
  }
  if (!isRecord(value)) {
    throw new TypeError(`가중치 ${path}: 객체가 아닙니다`);
  }
  for (const key of Object.keys(value)) {
    if (!(key in shape)) {
      throw new TypeError(`가중치 ${path}.${key}: 알 수 없는 키`);
    }
  }
  for (const [key, sub] of Object.entries(shape)) {
    check(value[key], sub, path === '' ? key : `${path}.${key}`);
  }
}

/** 신뢰할 수 없는 JSON을 검증해 Weights로 돌려준다. 키 누락·추가·비숫자면 예외. */
export function parseWeights(value: unknown): Weights {
  assertWeights(value);
  const goStop = value.goStop;
  if (goStop.bold < 0 || goStop.bold > 1) throw new RangeError('goStop.bold: 0~1 범위여야 합니다');
  if (goStop.selfNoise < 0) throw new RangeError('goStop.selfNoise: 음수일 수 없습니다');
  return deepFreeze(value);
}

/** SHAPE와 Weights 인터페이스는 같은 모양이다: 형태 검사를 통과하면 Weights다 */
function assertWeights(value: unknown): asserts value is Weights {
  check(value, SHAPE, '');
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const sub of Object.values(value)) {
      deepFreeze(sub);
    }
    Object.freeze(value);
  }
  return value;
}

/** 기본 가중치 (weights/default.json) */
export const DEFAULT_WEIGHTS: Weights = parseWeights(cloneJson(defaultJson));

/** 일부만 바꾼 가중치 (조정 실험용). 결과도 검증한다. */
export function withWeights(base: Weights, patch: DeepPartial<Weights>): Weights {
  return parseWeights(merge(cloneJson(base), patch));
}

export type DeepPartial<T> = {
  -readonly [K in keyof T]?: T[K] extends readonly number[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function merge(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) {
    return patch === undefined ? base : patch;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = merge(base[key], value);
  }
  return out;
}
