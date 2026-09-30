// 카드 SVG 최적화 설정 (svgo 4.1.0, intent/plan.md 1.6·1.8). scripts/build-cards.mjs가 불러 쓴다.
// - 필터·메타데이터·스크립트·주석 제거 (Safari 래스터 성능, spec NF-03)
// - 참조되는 id(<pattern>, <linearGradient> 등)는 cleanupIds가 짧게 바꾸되 참조와 함께 유지한다
// - width/height·viewBox 유지: <img>의 고유 비율이 여기서 나온다
// - 좌표 소수점 1자리: 카드 좌표계가 103.2×168.2라 0.1 단위는 3배율 화면에서도 0.3px 미만이다.
//   48장 합계를 약 600 KiB로 맞추는 핵심 설정이다(3자리 1.2 MiB, 2자리 1.0 MiB).
const PRECISION = 1;

/** @type {import('svgo').Config} */
export default {
  multipass: true,
  floatPrecision: PRECISION,
  js2svg: { pretty: false },
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          convertPathData: { floatPrecision: PRECISION, transformPrecision: 3 },
          cleanupIds: { remove: true, minify: true },
        },
      },
    },
    // preset-default에 없는 제거 규칙
    'removeScripts',
    // 원본의 preserveAspectRatio="none"은 상자 비율이 조금만 달라도 그림을 찌그러뜨린다. 기본값(xMidYMid meet)으로 둔다.
    { name: 'removeAttrs', params: { attrs: 'svg:preserveAspectRatio' } },
    {
      // <filter>와 filter 속성 제거 (svgo 내장 플러그인 없음, detachNodeFromParent와 같은 방식)
      name: 'removeFilters',
      fn: () => ({
        element: {
          enter: (node, parent) => {
            if (node.name === 'filter') {
              parent.children = parent.children.filter((child) => child !== node);
            } else if (node.attributes.filter !== undefined) {
              delete node.attributes.filter;
            }
          },
        },
      }),
    },
  ],
};
