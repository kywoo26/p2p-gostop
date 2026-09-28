// 이벤트 배너 (spec 6.5): 문구와 색. 색만으로 구분하지 않도록 항상 문구를 함께 쓴다(NF-08).
import type { EngineEvent } from '@p2p-gostop/engine';
import type { UiEvent } from '../lib/view-types.ts';

export type BannerKind =
  | 'ppeok'
  | 'jjok'
  | 'ttadak'
  | 'sseul'
  | 'shake'
  | 'bomb'
  | 'go'
  | 'stop'
  | 'chongtong'
  | 'nagari'
  | 'hudang';

export interface Banner {
  readonly kind: BannerKind;
  readonly text: string;
}

const BANNER_TEXT: Readonly<Record<BannerKind, string>> = {
  ppeok: '뻑',
  jjok: '쪽',
  ttadak: '따닥',
  sseul: '쓸',
  shake: '흔들기',
  bomb: '폭탄',
  go: '고',
  stop: '스톱',
  chongtong: '총통',
  nagari: '나가리',
  hudang: '허당',
};

function simple(kind: BannerKind): Banner {
  return { kind, text: BANNER_TEXT[kind] };
}

/** 배너를 띄우는 이벤트만 골라 종류·문구를 돌려준다(픽스처 이벤트). 나머지 이벤트는 null */
export function bannerFor(event: UiEvent): Banner | null {
  switch (event.type) {
    case 'Ppeok':
      return simple('ppeok');
    case 'Jjok':
      return simple('jjok');
    case 'Ttadak':
      return simple('ttadak');
    case 'Sseul':
      return simple('sseul');
    case 'Shake':
      return simple('shake');
    case 'Bomb':
      return simple('bomb');
    case 'Go':
      return { kind: 'go', text: `${event.n}${BANNER_TEXT.go}` };
    case 'Stop':
      return simple('stop');
    default:
      return null;
  }
}

/** 엔진 이벤트 → 배너 (spec 4.5 엔진 기준 이름: Go.count) */
export function bannerForEngineEvent(event: EngineEvent): Banner | null {
  switch (event.type) {
    case 'Ppeok':
      return simple('ppeok');
    case 'Jjok':
      return simple('jjok');
    case 'Ttadak':
      return simple('ttadak');
    case 'Sseul':
      return simple('sseul');
    case 'Shake':
      return simple('shake');
    case 'Bomb':
      return simple('bomb');
    case 'Go':
      return { kind: 'go', text: `${event.count}${BANNER_TEXT.go}` };
    case 'Stop':
      return simple('stop');
    case 'Chongtong':
      return simple('chongtong');
    case 'Nagari':
      return simple('nagari');
    case 'Hudang':
      return simple('hudang');
    default:
      return null;
  }
}
