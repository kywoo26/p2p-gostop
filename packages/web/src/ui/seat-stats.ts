// 좌석 획득패의 화면 숫자 (spec 6.1 족보 진행도, rules S5 국진, M3 리뷰 S-2·L-15).
// 숫자는 화면에서 규칙을 다시 짜지 않고 엔진 scoreCaptured(획득 패, 국진을 쌍피로 세는지)에서 그대로 가져온다.
// 국진을 쌍피로 세면 카드도 피 칸에 그려 칸 숫자와 칸 안의 카드가 늘 같게 한다.
import { getCard, GUKJIN_ID, scoreCaptured, type CardId } from '@p2p-gostop/engine';
import type { CapturedView, JokboProgress, SeatView } from '../lib/view-types.ts';

export type PileKey = 'gwang' | 'yeol' | 'tti' | 'pi';

export interface PileStats {
  readonly key: PileKey;
  readonly name: string;
  /** 이 칸에 그리는 카드 (국진을 쌍피로 세면 피 칸 끝) */
  readonly cards: readonly CardId[];
  /** 칸 숫자: 광·열끗·띠는 장수, 피는 가치 합(쌍피 2, 보너스 2·3, 국진쌍피 2) */
  readonly value: number;
}

export interface CapturedStats {
  readonly piles: readonly [PileStats, PileStats, PileStats, PileStats];
  /** 국진을 가지고 있고 쌍피로 센다 (엔진 ScoreBreakdown.gukjinAsPi) */
  readonly gukjinAsPi: boolean;
  /** 엔진 ScoreBreakdown의 장수 필드 그대로 (피는 가치 합) */
  readonly gwangCount: number;
  readonly yeolCount: number;
  readonly ttiCount: number;
  readonly piCount: number;
  readonly progress: JokboProgress;
}

/** 좌석 뷰에 붙을 수 있는 표시용 값 (솔로 어댑터가 넣는다. 프로토콜 뷰에는 아직 없을 수 있다) */
export interface SeatExtras {
  /** 엔진 score.gukjinAsPi */
  readonly gukjinAsPi?: boolean;
  /** 배수가 붙는 폭탄 횟수 (엔진 SeatState.bombs) */
  readonly bombs?: number | null;
}

const piValue = (ids: readonly CardId[]) => ids.reduce((sum, id) => sum + getCard(id).piValue, 0);

export function hasGukjin(captured: CapturedView): boolean {
  return captured.yeol.includes(GUKJIN_ID);
}

export function capturedStats(captured: CapturedView, gukjinAsPi: boolean): CapturedStats {
  const score = scoreCaptured(captured, gukjinAsPi);
  const moved = score.gukjinAsPi;
  const yeol = moved ? captured.yeol.filter((id) => id !== GUKJIN_ID) : captured.yeol;
  const pi = moved ? [...captured.pi, GUKJIN_ID] : captured.pi;
  const ribbons = captured.tti.map((id) => getCard(id).ribbon);
  const dan = Math.max(
    0,
    ...(['hong', 'cheong', 'cho'] as const).map((r) => ribbons.filter((x) => x === r).length),
  );
  return {
    piles: [
      { key: 'gwang', name: '광', cards: captured.gwang, value: score.gwangCount },
      { key: 'yeol', name: '열끗', cards: yeol, value: score.yeolCount },
      { key: 'tti', name: '띠', cards: captured.tti, value: score.ttiCount },
      { key: 'pi', name: '피', cards: pi, value: score.piCount },
    ],
    gukjinAsPi: moved,
    gwangCount: score.gwangCount,
    yeolCount: score.yeolCount,
    ttiCount: score.ttiCount,
    piCount: score.piCount,
    progress: {
      gwang: score.gwangCount,
      godori: yeol.filter((id) => getCard(id).isGodori).length,
      dan,
      pi: score.piCount,
    },
  };
}

/**
 * 좌석이 국진을 쌍피로 세는지. 어댑터가 넣은 값이 있으면 그것을, 없으면(프로토콜 뷰·픽스처)
 * 진행도의 피(엔진 점수 기준, 국진쌍피면 +2)와 피 칸 가치 합의 차이로 판단한다.
 */
export function gukjinAsPiOf(seat: SeatView & SeatExtras): boolean {
  if (!hasGukjin(seat.captured)) return false;
  if (seat.gukjinAsPi !== undefined) return seat.gukjinAsPi;
  return seat.progress.pi - piValue(seat.captured.pi) >= getCard(GUKJIN_ID).piValue;
}

export function seatStats(seat: SeatView & SeatExtras): CapturedStats {
  return capturedStats(seat.captured, gukjinAsPiOf(seat));
}
