# 에이전트 시대 기술 스택 채택 근거

2026-09-28 조사. 도입 정본은 [plan §1.8](../../intent/plan.md), 버전 정본은 [AGENTS §2](../../AGENTS.md)다. 조사 당시의 버전·통계는 설치 지시가 아니다.

## 채택 결론

| 영역 | 결정 | 근거 |
|---|---|---|
| UI | Svelte 5 + Vite 8 유지 | 공식 MCP/autofixer와 타입 검사로 에이전트 오류를 빨리 발견하고, 작은 번들과 내장 transition이 오프라인 게스트 로딩에 맞는다. React 전환 비용을 정당화하지 못한다. |
| Android | Kotlin Activity + WebView 셸 유지 | LOHS·로컬 서버를 직접 다루고, 별도 웹 프레임워크 셸을 추가하지 않는다. |
| 타입·린트 | web: TS 6 + ESLint/Prettier; 순수 TS: TS 7 + Oxc | svelte-check·typescript-eslint의 TS 7 비호환과 Oxc의 .svelte 미지원 때문에 경계를 나눈다. |
| 애니메이션 | WAAPI FLIP + Svelte transition | 카드가 손패·바닥·획득패 사이를 이동하므로 같은 keyed list에 한정된 animate:flip만으로는 부족하다. transform/opacity를 시퀀싱한다. |
| 검증 | fast-check, Vitest 브라우저 모드, Playwright 갤러리/axe, Knip, 번들 예산 | 규칙·접근성·렌더·미사용 코드 문제를 변경 직후 확인한다. |
| 개발 도구 | npm workspaces, 로컬 Svelte MCP, AGENTS.md | 단일 lockfile과 공식 Svelte 문서/검사 루프를 유지한다. |

Tailwind, shadcn, Storybook, Capacitor, Biome, pnpm, Turborepo, Pixi, Phaser, GSAP은 [plan §1.8](../../intent/plan.md)에 따라 도입하지 않는다. GSAP은 무료이나 MIT가 아닌 [Standard License](https://gsap.com/standard-license)이고, 이 앱의 카드 이동에는 WAAPI로 충분하다. 저장 시 포맷 훅은 워크트리에서 잘못된 체크아웃을 대상으로 삼았으므로 철회했고, 커밋 전 lint:fix와 CI lint를 쓴다.

## 품질 경계

Svelte 5 runes와 공식 문서 조회를 사용한다. 브라우저 자동 검사는 실기기 Galaxy/iPhone 검증을 대신하지 않는다. 구현 여부와 현재 버전은 각 패키지와 [AGENTS](../../AGENTS.md)를 확인한다.
