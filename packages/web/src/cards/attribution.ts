// 카드 그림 저작자 표시의 단일 원본 (spec 6.6·NF-07, code-refs.md 4.2).
// - 앱의 라이선스 화면(src/routes/License.svelte)이 이 값을 그대로 보여 준다.
// - scripts/build-cards.mjs가 이 값으로 public/cards/ATTRIBUTION.md를 만든다.
// - scripts/check-bundle.mjs는 ATTRIBUTION_URLS를 "화면에 글자로만 보여 주는 주소"로 허용한다(요청하지 않음).

/** 저작자 표시 문장 (CC BY-SA 4.0 3(a)(1)). 세 사람을 모두 적는다. */
export const CARD_ART_CREDIT =
  'Hwatu card art by Spenĉjo and Marcus Richert, based on Hanafuda graphics by Louie Mantia, Jr. — Wikimedia Commons, CC BY-SA 4.0';

export const CARD_ART_AUTHORS = [
  { name: 'Spenĉjo', role: '카드별 SVG 추출·최적화 (2024-12)' },
  { name: 'Marcus Richert', role: '원본 화투 도안 Hwatu overview.svg (2021-02)' },
  { name: 'Louie Mantia, Jr.', role: '바탕이 된 Hanafuda 그래픽' },
] as const;

export const CARD_ART_LICENSE = {
  name: 'CC BY-SA 4.0',
  title: 'Creative Commons Attribution-ShareAlike 4.0 International',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
} as const;

export const CARD_ART_SOURCE = {
  name: 'Wikimedia Commons, Category:SVG Hwatu',
  url: 'https://commons.wikimedia.org/wiki/Category:SVG_Hwatu',
} as const;

/** 원본에 가한 변경 (CC BY-SA 4.0 3(a)(1)(B)) */
export const CARD_ART_CHANGES =
  'svgo 4.1.0으로 기계적으로 최적화했다(좌표 소수점 1자리 반올림, 공백·중복 속성 제거, 경로 병합, 루트의 preserveAspectRatio="none" 제거). 도안은 바꾸지 않았고 파일 이름을 카드 번호(<id>.svg)로 바꿨다. 변경본(0~47번)도 CC BY-SA 4.0으로 배포한다.';

export const ORIGINAL_ART_LICENSE = {
  name: 'CC0 1.0',
  title: 'Creative Commons Zero v1.0 Universal (퍼블릭 도메인 헌정)',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  scope:
    '보너스 카드 3장(48~50번: 2피·2피·3피)과 카드 뒷면은 p2p-gostop 기여자가 Commons 세트와 같은 판형·테두리·색으로 직접 그렸다(Commons 그림을 옮기거나 변형하지 않음).',
} as const;

export const CODE_LICENSE = { name: 'MIT', scope: '앱 코드(엔진·UI)는 MIT 라이선스다.' } as const;

/** 화면에 글자로 보여 주는 외부 주소 목록. 앱은 이 주소로 요청을 보내지 않는다(spec NF-01). */
export const ATTRIBUTION_URLS: readonly string[] = [
  CARD_ART_LICENSE.url,
  CARD_ART_SOURCE.url,
  ORIGINAL_ART_LICENSE.url,
];
