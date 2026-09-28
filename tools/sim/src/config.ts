// 시뮬레이션 설정과 명령행 파싱
import { PRESETS, type PresetId, type RuleOptions } from '@p2p-gostop/engine';

export type PolicySpec = 'random' | 'heuristic' | 'easy' | 'normal' | 'commercial';

export const POLICY_SPECS: readonly PolicySpec[] = [
  'random',
  'heuristic',
  'easy',
  'normal',
  'commercial',
];

export interface SideConfig {
  readonly policy: PolicySpec;
  /** ISMCTS 반복 상한 (commercial만) */
  readonly iterations?: number;
  /** 가중치 JSON 경로 (조정 실험용). 없으면 기본 가중치 */
  readonly weightsPath?: string;
  /** 가중치 JSON 내용 (워커로 전달할 때 채운다) */
  readonly weights?: unknown;
  /** ISMCTS 고/스톱 방식 (조정 실험용) */
  readonly goStop?: 'ev' | 'rule' | 'search';
  /** ISMCTS 루트 탐색 방식 (조정 실험용) */
  readonly search?: 'uct' | 'halving';
}

export interface SimConfig {
  /** match: 독립된 판을 중복(duplicate) 쌍으로 / session: 나가리 배수·선이 이어지는 세션 */
  readonly mode: 'match' | 'session';
  readonly a: SideConfig;
  readonly b: SideConfig;
  readonly preset: PresetId;
  /** match: 판 수(짝수로 올림) / session: 세션 수 × 세션 길이 */
  readonly rounds: number;
  readonly sessionLength: number;
  readonly perPoint: number;
  /** 파산 확률을 구할 시작 잔액(원). 없으면 최소 잔액만 계산 */
  readonly startBalance: number | null;
  /** 파산 확률 목표 (MN-03: 5%) */
  readonly bankruptcyTarget: number;
  readonly seed: number;
  readonly workers: number;
  /** 결정 시간 제한(ms). 없으면 반복 상한만(결정적) */
  readonly timeMs: number | null;
  /** 몬테카를로 세션 수 */
  readonly mcSessions: number;
  readonly out: string | null;
  readonly label: string | null;
}

export function rulesOf(preset: PresetId): RuleOptions {
  return PRESETS[preset];
}

export const DEFAULT_CONFIG: SimConfig = {
  mode: 'match',
  a: { policy: 'commercial' },
  b: { policy: 'normal' },
  preset: 'standard',
  rounds: 200,
  sessionLength: 30,
  perPoint: 100,
  startBalance: null,
  bankruptcyTarget: 0.05,
  seed: 1,
  workers: 0,
  timeMs: null,
  mcSessions: 200_000,
  out: null,
  label: null,
};

export const USAGE = `사용법: npm run sim -- [옵션]
  --mode match|session     match: 독립 판(중복 쌍, 좌석 교대) / session: 나가리·선이 이어지는 세션 (기본 match)
  --a <정책> --b <정책>    random | heuristic | easy | normal | commercial (기본 commercial vs normal)
  --a-iterations N          A가 commercial일 때 ISMCTS 반복 상한 (기본: 패키지 기본값)
  --b-iterations N
  --a-gostop ev|rule|search A가 commercial일 때 고/스톱 방식 (기본 ev, AI-06)
  --b-gostop ev|rule|search
  --a-search uct|halving    A가 commercial일 때 루트 탐색 방식
  --b-search uct|halving
  --a-weights 파일.json     A 가중치 덮어쓰기 (조정 실험)
  --b-weights 파일.json
  --preset standard|traditional|arcade (기본 standard)
  --rounds N                총 판 수 (기본 200)
  --session-length L        세션 길이 (기본 30, MN-03)
  --per-point P             점당 금액 (기본 100)
  --start-balance B         이 시작 잔액의 파산 확률도 계산
  --target 0.05             파산 확률 목표 (기본 0.05)
  --seed S                  기본 시드 (기본 1)
  --workers W               워커 수 (기본: CPU 수)
  --time-ms T               결정 시간 제한(ms). 주면 비결정적
  --mc N                    파산 몬테카를로 세션 수 (기본 200000)
  --out 경로                결과 저장 경로 접두사 (경로.json, 경로.md)
  --label 이름              요약 제목`;

function num(value: string | undefined, name: string): number {
  const n = Number(value);
  if (value === undefined || !Number.isFinite(n)) {
    throw new Error(`${name}: 숫자가 필요합니다`);
  }
  return n;
}

function policy(value: string | undefined, name: string): PolicySpec {
  const found = POLICY_SPECS.find((p) => p === value);
  if (found === undefined) {
    throw new Error(`${name}: ${POLICY_SPECS.join('|')} 중 하나`);
  }
  return found;
}

export function parseArgs(argv: readonly string[]): SimConfig | 'help' {
  let config: SimConfig = DEFAULT_CONFIG;
  let a: SideConfig = config.a;
  let b: SideConfig = config.b;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    const take = (): string | undefined => {
      i++;
      return value;
    };
    switch (flag) {
      case '--help':
      case '-h':
        return 'help';
      case '--mode': {
        const mode = take();
        if (mode !== 'match' && mode !== 'session') {
          throw new Error('--mode: match|session');
        }
        config = { ...config, mode };
        break;
      }
      case '--a':
        a = { ...a, policy: policy(take(), flag) };
        break;
      case '--b':
        b = { ...b, policy: policy(take(), flag) };
        break;
      case '--a-iterations':
        a = { ...a, iterations: num(take(), flag) };
        break;
      case '--b-iterations':
        b = { ...b, iterations: num(take(), flag) };
        break;
      case '--a-gostop':
      case '--b-gostop': {
        const mode = take();
        if (mode !== 'ev' && mode !== 'rule' && mode !== 'search') {
          throw new Error(`${flag}: ev|rule|search`);
        }
        if (flag === '--a-gostop') {
          a = { ...a, goStop: mode };
        } else {
          b = { ...b, goStop: mode };
        }
        break;
      }
      case '--a-search':
      case '--b-search': {
        const mode = take();
        if (mode !== 'uct' && mode !== 'halving') {
          throw new Error(`${flag}: uct|halving`);
        }
        if (flag === '--a-search') {
          a = { ...a, search: mode };
        } else {
          b = { ...b, search: mode };
        }
        break;
      }
      case '--a-weights':
        a = { ...a, weightsPath: take() ?? '' };
        break;
      case '--b-weights':
        b = { ...b, weightsPath: take() ?? '' };
        break;
      case '--preset': {
        const preset = take();
        if (preset !== 'standard' && preset !== 'traditional' && preset !== 'arcade') {
          throw new Error('--preset: standard|traditional|arcade');
        }
        config = { ...config, preset };
        break;
      }
      case '--rounds':
        config = { ...config, rounds: num(take(), flag) };
        break;
      case '--session-length':
        config = { ...config, sessionLength: num(take(), flag) };
        break;
      case '--per-point':
        config = { ...config, perPoint: num(take(), flag) };
        break;
      case '--start-balance':
        config = { ...config, startBalance: num(take(), flag) };
        break;
      case '--target':
        config = { ...config, bankruptcyTarget: num(take(), flag) };
        break;
      case '--seed':
        config = { ...config, seed: num(take(), flag) };
        break;
      case '--workers':
        config = { ...config, workers: num(take(), flag) };
        break;
      case '--time-ms':
        config = { ...config, timeMs: num(take(), flag) };
        break;
      case '--mc':
        config = { ...config, mcSessions: num(take(), flag) };
        break;
      case '--out':
        config = { ...config, out: take() ?? null };
        break;
      case '--label':
        config = { ...config, label: take() ?? null };
        break;
      default:
        throw new Error(`알 수 없는 옵션: ${flag}\n${USAGE}`);
    }
  }
  return { ...config, a, b };
}
