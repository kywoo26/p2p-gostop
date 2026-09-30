// FR-40 / NF-08 / #206: 표시만 분리한다. 저장 이름·좌석·난이도 키는 바꾸지 않는다.
import type { Difficulty } from '@p2p-gostop/ai';
import { DIFFICULTY_LABEL } from './solo.svelte.ts';

export function playerLabel(name: string, computer: boolean): string {
  return computer ? '컴퓨터' : name;
}

export function difficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTY_LABEL[difficulty];
}

/** playback이 만든 이름 선두 알림만 축약한다. 사람 이름과 상세 원문은 호출부에 남긴다. */
export function conciseSoloNotice(text: string, names: readonly [string, string]): string {
  if (
    names[0] === names[1] ||
    names[0].startsWith(`${names[1]} `) ||
    names[1].startsWith(`${names[0]} `)
  )
    return text;
  const prefix = `${names[1]} `;
  // FirstPicked의 제목·사람 이름·두 필드를 먼저 확인한다. 모호한 형식은 그대로 둔다.
  if (text.startsWith('선 고르기: ')) {
    const pick = `선 고르기: ${names[0]} `;
    if (!text.startsWith(pick)) return text;
    const fields = text.slice(pick.length).split(` · ${prefix}`);
    if (fields.length !== 2 || fields.some((field) => !field || field.includes(' · '))) return text;
    return `${pick}${fields[0]} · 컴퓨터 ${fields[1]}`;
  }
  // 이름 선두의 일반 사건·정산 제목만 축약한다.
  return text.startsWith(prefix) ? `컴퓨터 ${text.slice(prefix.length)}` : text;
}
