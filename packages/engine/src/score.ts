// 족보 점수 (rules 12.3 S1~S5).
import { getCard, type CardId } from './cards.ts';
import type { RuleOptions } from './rules.ts';
import type { CapturedPile, ScoreBreakdown } from './state.ts';

/** 국진(9월 열끗) 카드 ID */
export const GUKJIN_ID: CardId = 32;

const DAN_SIZE = 3;
const DAN_POINTS = 3;
const GODORI_POINTS = 5;

function hasGukjin(captured: CapturedPile): boolean {
  return captured.yeol.includes(GUKJIN_ID);
}

/** 5장 1점, 이후 1장당 +1 (S2·S3), 피는 10장 1점 (S4) */
const countPoints = (count: number, threshold: number): number =>
  count >= threshold ? count - threshold + 1 : 0;

/** S1: 3광 3, 비삼광 2, 4광 4(비광 무관), 5광 15 */
function gwangPoints(ids: readonly CardId[]): number {
  if (ids.length >= 5) {
    return 15;
  }
  if (ids.length === 4) {
    return 4;
  }
  if (ids.length === 3) {
    return ids.some((id) => getCard(id).isBiGwang) ? 2 : 3;
  }
  return 0;
}

function piValueOf(ids: readonly CardId[]): number {
  return ids.reduce((sum, id) => sum + getCard(id).piValue, 0);
}

/** 국진 위치를 정해 점수를 계산한다. */
export function scoreCaptured(captured: CapturedPile, gukjinAsPi: boolean): ScoreBreakdown {
  const movesGukjin = gukjinAsPi && hasGukjin(captured);
  const yeolIds = movesGukjin ? captured.yeol.filter((id) => id !== GUKJIN_ID) : captured.yeol;
  const piCount = piValueOf(captured.pi) + (movesGukjin ? getCard(GUKJIN_ID).piValue : 0);
  const ribbons = captured.tti.map((id) => getCard(id).ribbon);
  const dan = (ribbon: 'hong' | 'cheong' | 'cho'): number =>
    ribbons.filter((r) => r === ribbon).length === DAN_SIZE ? DAN_POINTS : 0;
  const godoriCount = yeolIds.filter((id) => getCard(id).isGodori).length;

  const gwang = gwangPoints(captured.gwang);
  const yeol = countPoints(yeolIds.length, 5);
  const godori = godoriCount === 3 ? GODORI_POINTS : 0;
  const tti = countPoints(captured.tti.length, 5);
  const hongdan = dan('hong');
  const cheongdan = dan('cheong');
  const chodan = dan('cho');
  const pi = countPoints(piCount, 10);
  return {
    gwang,
    yeol,
    godori,
    tti,
    hongdan,
    cheongdan,
    chodan,
    pi,
    total: gwang + yeol + godori + tti + hongdan + cheongdan + chodan + pi,
    gwangCount: captured.gwang.length,
    yeolCount: yeolIds.length,
    ttiCount: captured.tti.length,
    piCount,
    gukjinAsPi: movesGukjin,
  };
}

/** 이 좌석이 쓸 수 있는 국진 위치 후보. 자동 모드는 둘 다, 묻기 모드는 고른 쪽만 (S5). */
export function gukjinOptions(
  captured: CapturedPile,
  asPi: boolean,
  rules: RuleOptions,
): readonly boolean[] {
  if (!hasGukjin(captured)) {
    return [false];
  }
  return rules.gukjin === 'auto' ? [false, true] : [asPi];
}

/** 현재 점수: 자동 모드면 총점이 큰 쪽(같으면 열끗) (S5 "7점 도달·고/스톱 직전 자동 이동"). */
export function seatScore(
  captured: CapturedPile,
  asPi: boolean,
  rules: RuleOptions,
): ScoreBreakdown {
  return gukjinOptions(captured, asPi, rules)
    .map((option) => scoreCaptured(captured, option))
    .reduce((best, score) => (score.total > best.total ? score : best));
}
