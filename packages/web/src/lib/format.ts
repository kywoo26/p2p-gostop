// 숫자·금액 표시 (MN-06: 가상 단위, 현금 암시 문구 금지).
import type { MoneyUnit } from './view-types.ts';

const number = new Intl.NumberFormat('ko-KR');

export function formatNumber(n: number): string {
  return number.format(n);
}

export function formatMoney(n: number, unit: MoneyUnit): string {
  return `${number.format(n)}${unit}`;
}

/** 부호를 붙인 금액: +2,000냥 / −700냥 (U+2212 빼기 기호) */
export function formatSignedMoney(n: number, unit: MoneyUnit): string {
  if (n === 0) return `0${unit}`;
  return `${n > 0 ? '+' : '−'}${number.format(Math.abs(n))}${unit}`;
}
