// AC-10: docs/money-model.md의 기본값 표가 packages/ai의 기본값 상수와 같다.
import { readFileSync } from 'node:fs';
import { PER_POINT_OPTIONS, START_BALANCE_TABLE } from '@p2p-gostop/ai';
import { describe, expect, it } from 'vitest';

const doc = readFileSync(new URL('../../../docs/money-model.md', import.meta.url), 'utf8');
const LABELS = [
  ['standard', '표준'],
  ['traditional', '정통'],
  ['arcade', '아케이드'],
] as const;

describe('머니 모델 문서 (AC-10)', () => {
  it('기본값 표의 각 행이 START_BALANCE_TABLE과 같다', () => {
    for (const [preset, label] of LABELS) {
      const cells = PER_POINT_OPTIONS.map((p) =>
        START_BALANCE_TABLE[preset][p].toLocaleString('en-US'),
      );
      expect(doc).toContain(`| ${label} | ${cells.join(' | ')} |`);
    }
  });
});
