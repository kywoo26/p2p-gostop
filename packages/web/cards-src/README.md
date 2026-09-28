# 자체 제작 카드 원본 (CC0 1.0)

보너스 카드 3장과 카드 뒷면의 사람이 읽는 원본이다. `scripts/build-cards.mjs`가 svgo로 최적화해
`public/cards/{48,49,50,back}.svg`로 내보낸다. 이 디렉터리의 파일과 그 산출물은 p2p-gostop 기여자가 직접 그린
것이며 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)으로 공개한다(spec 6.6, code-refs.md 4.2 항목 4).

- 좌표계는 Commons "SVG Hwatu" 세트와 같은 `103.2 × 168.2`, 테두리 모양도 같게 맞췄다(나란히 놓았을 때 크기·테두리 일치).
- 글자는 `<text>` 대신 선(path)으로 그렸다. `<img>` 안의 SVG는 시스템 글꼴에 따라 달라지기 때문이다.
- `bonus-2pi-a.svg`(48), `bonus-2pi-b.svg`(49), `bonus-3pi.svg`(50): 위쪽에 가치(2피·3피), 아래쪽에 "뺏기" 표식
  (상대 패에서 한 장을 갈고리 화살표로 끌어오는 그림). 두 2피는 바탕색만 다르다.
- `back.svg`: 빨간 테두리, 마름모 격자 무늬, 가운데 꽃 문양.
