// UX-11 / FR-14·18: 공개 표시 데이터의 배치 경계. 합법 엔진 재현/규칙 정답이 아니다.
import { fixtures } from './fixtures.ts';

const base = fixtures.settlement;
const decision = {
  winner: true,
  canPush: true,
  nextMultiplier: 2,
  acceptAmount: 2000,
  forfeitedPoints: 20,
};

export function settlementFixture(state: string) {
  switch (state) {
    case 'decision':
      return { view: base, decision };
    case 'guest':
      return { view: null, guest: true, decision: { ...decision, nextMultiplier: 4 } };
    case 'waiting':
      return { view: null, decision: { ...decision, winner: false }, waiting: true };
    case 'pushed':
      return {
        view: {
          ...base,
          pushed: true,
          nextPushes: 1,
          forfeitedPoints: 20,
          finalPoints: 0,
          amount: 0,
          balances: [
            { before: 51200, after: 51200 },
            { before: 48800, after: 48800 },
          ] as const,
        },
      };
    case 'capped':
      return { view: base, decision: { ...decision, canPush: false } };
    case 'nagari':
      return {
        view: { ...base, winner: null, loser: null, breakdown: [], steps: [], amount: 0 },
        nextCarry: 2,
      };
    case 'bankrupt':
      return {
        view: {
          ...base,
          names: ['긴 이름을 사용하는 참가자', '상대 참가자'] as const,
          amount: 100000000,
          balances: [
            { before: 100000000, after: 200000000 },
            { before: 100000000, after: 0 },
          ] as const,
        },
        bankrupt: true,
      };
    default:
      return { view: base };
  }
}
