// 이벤트 배너 (spec 6.5): 문구와 색. 색만으로 구분하지 않도록 항상 문구를 함께 쓴다(NF-08).
import type { UiEvent } from '../lib/view-types.ts';

export type BannerKind = 'ppeok' | 'jjok' | 'ttadak' | 'sseul' | 'shake' | 'bomb' | 'go' | 'stop';

const BANNER_TEXT: Readonly<Record<BannerKind, string>> = {
  ppeok: '뻑',
  jjok: '쪽',
  ttadak: '따닥',
  sseul: '쓸',
  shake: '흔들기',
  bomb: '폭탄',
  go: '고',
  stop: '스톱',
};

/** 배너를 띄우는 이벤트만 골라 종류·문구를 돌려준다. 나머지 이벤트는 null */
export function bannerFor(event: UiEvent): { kind: BannerKind; text: string } | null {
  switch (event.type) {
    case 'Ppeok':
      return { kind: 'ppeok', text: BANNER_TEXT.ppeok };
    case 'Jjok':
      return { kind: 'jjok', text: BANNER_TEXT.jjok };
    case 'Ttadak':
      return { kind: 'ttadak', text: BANNER_TEXT.ttadak };
    case 'Sseul':
      return { kind: 'sseul', text: BANNER_TEXT.sseul };
    case 'Shake':
      return { kind: 'shake', text: BANNER_TEXT.shake };
    case 'Bomb':
      return { kind: 'bomb', text: BANNER_TEXT.bomb };
    case 'Go':
      return { kind: 'go', text: `${event.n}${BANNER_TEXT.go}` };
    case 'Stop':
      return { kind: 'stop', text: BANNER_TEXT.stop };
    default:
      return null;
  }
}
