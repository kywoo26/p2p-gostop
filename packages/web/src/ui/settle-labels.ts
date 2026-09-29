// 정산·고스톱 화면의 한국어 이름 (spec 6.1: 용어는 상용 서비스 관행)
import type { ScoreRowKind, SettleStepKind, SettlementView } from '../lib/view-types.ts';

export const SCORE_LABEL: Readonly<Record<ScoreRowKind, string>> = {
  gwang: '광',
  yeol: '열끗',
  godori: '고도리',
  tti: '띠',
  hongdan: '홍단',
  cheongdan: '청단',
  chodan: '초단',
  pi: '피',
};

const STEP_LABEL: Readonly<Record<SettleStepKind, string>> = {
  base: '족보 점수',
  goBonus: '고 가산',
  goMultiplier: '3고 이상 배수',
  shake: '흔들기',
  bomb: '폭탄',
  piBak: '피박',
  gwangBak: '광박',
  meongtta: '멍따',
  goBak: '고박',
  nagariCarry: '나가리 이월',
  jackpot: '대박판',
};

export function stepLabel(kind: SettleStepKind, origin?: 'push'): string {
  if (origin === 'push') return '밀기';
  return STEP_LABEL[kind];
}

export const REASON_LABEL: Readonly<Record<SettlementView['reason'], string>> = {
  stop: '스톱',
  autoStop: '자동 스톱',
  threePpeok: '3뻑',
  chongtong: '총통',
  exhausted: '패 소진',
  hudang: '허당',
};

export const INSTANT_LABEL: Readonly<Record<string, string>> = {
  firstPpeok: '첫뻑',
  secondPpeok: '연뻑',
  thirdPpeok: '3연뻑',
  firstTtadak: '첫따닥',
};
