// 카드 그림 대응표(map.json) ↔ 엔진 카탈로그, 그리고 public/cards 산출물 검사.
import { CARDS, TOTAL_CARD_COUNT } from '@p2p-gostop/engine';
import { describe, expect, test } from 'vitest';
import { ATTRIBUTION_URLS, CARD_ART_AUTHORS, CARD_ART_LICENSE } from './attribution.ts';
import map from './map.json';

describe('src/cards/map.json', () => {
  test('엔진 카탈로그 51장과 월·종류·피 가치가 같다 (카탈로그가 바뀌면 여기서 실패)', () => {
    expect(map.cards).toHaveLength(TOTAL_CARD_COUNT);
    map.cards.forEach((entry, index) => {
      const card = CARDS[index];
      expect(entry.id).toBe(index);
      expect({ month: entry.month, kind: entry.kind, piValue: entry.piValue }).toEqual({
        month: card?.month,
        kind: card?.kind,
        piValue: card?.piValue,
      });
    });
  });

  test('Commons 48장은 서로 다른 파일과 SHA-1, 자체 제작은 보너스 3장뿐', () => {
    const commons = map.cards.filter((c) => c.source === 'commons');
    expect(commons).toHaveLength(48);
    expect(new Set(commons.map((c) => c.file)).size).toBe(48);
    for (const card of commons) {
      expect(card.file).toMatch(/^Hwatu \w+ (Hikari|Tane|Tanzaku|Kasu( \d)?)\.svg$/);
      expect(card.sha1).toMatch(/^[0-9a-f]{40}$/);
    }
    const originals = map.cards.filter((c) => c.source === 'original');
    expect(originals.map((c) => c.id)).toEqual([48, 49, 50]);
    expect(map.back.source).toBe('original');
  });
});

describe('public/cards 산출물', () => {
  const files = [...map.cards.map((c) => `${c.id}.svg`), 'back.svg'];

  test('52개 SVG가 모두 서빙되고, 같은 좌표계에 filter·preserveAspectRatio가 없다', async () => {
    let total = 0;
    for (const file of files) {
      const res = await fetch(`/cards/${file}`);
      expect(res.ok, file).toBe(true);
      const svg = await res.text();
      total += new TextEncoder().encode(svg).byteLength;
      expect(svg.startsWith('<svg'), file).toBe(true);
      expect(svg, file).toContain('viewBox="0 0 103.2 168.2"');
      expect(svg, file).not.toMatch(/<filter|<metadata|<script|preserveAspectRatio|<!--/);
    }
    // 카드 SVG 예산: 약 600 KiB (plan M3 준비 목표). 번들 전체 1.5 MiB는 scripts/check-bundle.mjs가 검사한다.
    expect(total).toBeLessThan(620 * 1024);
  });

  test('ATTRIBUTION.md에 저작자 3명·라이선스·Commons 파일 48개가 모두 있다', async () => {
    const md = await (await fetch('/cards/ATTRIBUTION.md')).text();
    for (const author of CARD_ART_AUTHORS) expect(md).toContain(author.name);
    for (const url of ATTRIBUTION_URLS) expect(md).toContain(url);
    expect(md).toContain(CARD_ART_LICENSE.name);
    for (const card of map.cards.filter((c) => c.source === 'commons')) {
      expect(md).toContain(`[${card.file}](https://commons.wikimedia.org/wiki/File:`);
    }
  });

  test('LICENSE가 CC BY-SA 4.0(0~47)과 CC0(48~50·뒷면)을 나눠 적는다', async () => {
    const text = await (await fetch('/cards/LICENSE')).text();
    expect(text).toContain('0.svg ~ 47.svg');
    expect(text).toContain('Attribution-ShareAlike 4.0');
    expect(text).toContain('48.svg, 49.svg, 50.svg, back.svg');
    expect(text).toContain('CC0');
  });
});
