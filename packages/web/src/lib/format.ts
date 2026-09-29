// 숫자·금액 표시 (MN-06: 가상 단위, 현금 암시 문구 금지).
import type { MoneyUnit } from './view-types.ts';

const number = new Intl.NumberFormat('ko-KR');

export function formatNumber(n: number): string {
  return number.format(n);
}

export function formatMoney(n: number, unit: MoneyUnit): string {
  return `${number.format(n)}${unit}`;
}

/** 점수판의 금액. 정확한 금액은 aria-label에 별도로 둔다. */
export function formatCompactMoney(n: number, unit: MoneyUnit): string {
  const value = Math.abs(Math.trunc(n));
  const groups = [
    { amount: 1_000_000_000_000, name: '조' },
    { amount: 100_000_000, name: '억' },
    { amount: 10_000, name: '만' },
  ];
  let remaining = value;
  const parts: string[] = [];
  for (const group of groups) {
    const count = Math.floor(remaining / group.amount);
    if (count > 0) parts.push(`${count}${group.name}`);
    remaining %= group.amount;
    if (parts.length === 2) break;
  }
  if (parts.length === 0) parts.push(number.format(value));
  else if (value < 100_000_000 && remaining > 0) parts.push(String(remaining));
  return `${n < 0 ? '−' : ''}${parts.join('')}${unit}`;
}

export function formatSignedCompactMoney(n: number, unit: MoneyUnit): string {
  return n > 0 ? `+${formatCompactMoney(n, unit)}` : formatCompactMoney(n, unit);
}

/** 부호를 붙인 금액: +2,000냥 / −700냥 (U+2212 빼기 기호) */
export function formatSignedMoney(n: number, unit: MoneyUnit): string {
  if (n === 0) return `0${unit}`;
  return `${n > 0 ? '+' : '−'}${number.format(Math.abs(n))}${unit}`;
}
