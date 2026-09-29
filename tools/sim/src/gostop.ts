// AI-06·AI-07: 결정 직전 공개 정보만 기록한다. 계측은 정책 난수·선택에 관여하지 않는다.
import { countsOf, DEFAULT_WEIGHTS, potentialOf } from '@p2p-gostop/ai';
import type { PlayerView } from '@p2p-gostop/engine';

export interface GoStopRecord {
  readonly choice: 'go' | 'stop';
  readonly goCount: number;
  readonly score: number;
  readonly turnsLeft: number;
  readonly deckCount: number;
  readonly opponentScore: number;
  /** 비교 전후에 같은 기본 combo 척도로 측정한다. 승률이 아닌 휴리스틱 단위다. */
  readonly opponentPotential: number;
  readonly opponentPi: number;
  readonly opponentGwang: number;
  readonly ownBakRisk: boolean;
  readonly bakChance: boolean;
}

export function observeGoStop(view: PlayerView, choice: 'go' | 'stop'): GoStopRecord {
  const me = view.seats[view.viewer];
  const op = view.seats[view.viewer === 0 ? 1 : 0];
  const m = countsOf(me.captured, me.score.gukjinAsPi);
  const t = countsOf(op.captured, op.score.gukjinAsPi);
  const piExposed = (pi: number): boolean =>
    pi <= view.rules.piBakThreshold && !(view.rules.piBakZeroExempt && pi === 0);
  return {
    choice,
    goCount: me.goCount,
    score: me.score.total,
    turnsLeft: me.turnsLeft,
    deckCount: view.deckCount,
    opponentScore: op.score.total,
    opponentPotential: potentialOf(t, m, DEFAULT_WEIGHTS.combo),
    opponentPi: t.pi,
    opponentGwang: t.gwang,
    ownBakRisk: (piExposed(m.pi) && t.pi >= 8) || (m.gwang === 0 && t.gwang >= 2),
    bakChance: (piExposed(t.pi) && m.pi >= 8) || (t.gwang === 0 && m.gwang >= 2),
  };
}
