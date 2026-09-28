# 에이전트 시대 기술 스택 재검토 (agent-era-stack.md)

작성일: 2026-09-28 · 대상: `plan.md` 1~2장, `tech-stack.md` "권장 스택" 표(이 두 문서는 수정하지 않음)
질문: 앱·디자인·UI 분야에서 2026년 현재 사실상 표준이거나, 코드 대부분을 AI 코딩 에이전트(Claude Code)가 쓰는 환경에서 생산성이 높은 것 중 **현 계획을 바꿔야 할 것이 있는가.**

**판정 기준**
- **ADOPT**: 지금 도입한다.
- **TRIAL**: 범위를 한정해 시험한다.
- **HOLD**: 조건이 바뀔 때까지 보류한다.
- **REJECT**: 이 프로젝트에는 쓰지 않는다.

**데이터 출처**
- 다운로드: npm 레지스트리와 api.npmjs.org(주간 = 2026-09-20~26).
- 스타·활동: `gh api`(2026-09-28 조회).
- 설문: State of JS 2025(2025-09~11 조사, 13,002명, 2026-02-03 공개), State of CSS 2025.
- ThoughtWorks Tech Radar Vol.33(2025-11), Vol.34(2026-04).
- 각 공식 문서·이슈 트래커.
- "(추정)"은 직접 측정하지 않은 값이다.

## 요약 (결론 먼저)
1. **큰 틀(Svelte 5 + Vite 8 + 직접 작성 Kotlin WebView 셸)은 유지한다.** 에이전트 시대의 증거를 봐도 바꿀 이유보다 유지할 이유가 크다.
2. **꼭 바꿔야 할 것은 하나다. TypeScript 7.0.2 → 6.0.3 기본.** TS 7은 안정 API가 없어 typescript-eslint와 svelte-check가 확정적으로 동작하지 않는다(리스크 R9가 이미 발현됨).
3. **추가할 것은 "에이전트가 틀렸을 때 즉시 알려 주는 장치"다.** Svelte MCP/플러그인, AGENTS.md, fast-check, Vitest 브라우저 모드, `/dev/gallery`와 Playwright 스냅샷·axe, Knip, 번들·성능 예산 검사, 공급망 설정을 더한다.
4. **애니메이션은 라이브러리 없이 WAAPI + FLIP 헬퍼로 한다.** Svelte `animate:flip`만으로는 컨테이너 간 카드 이동을 시퀀싱하기 어렵고, GSAP은 무료지만 비OSI 라이선스에 메인 스레드에서 돈다.
5. **도입하지 않는 것이 더 많다.** Tailwind, Storybook, Biome/oxc 전환, pnpm/Turborepo, Capacitor, Canvas 엔진, SDD 도구가 그 예다.

---

## 1. UI 프레임워크: 에이전트 생산성 관점

### 1.1 채택·만족도 데이터
| 프레임워크 | 현재 버전 | 주간 DL | ★ | SoJS 2025 사용 | 만족도 | 관심 | 최소 앱 전송 크기(압축)* |
|---|---|---|---|---|---|---|---|
| React | 19.3.0 (2026-09-09) | 2억 350만 | 250.8k | 84.8% | 72.4% | 27.2% | 51.4KB (Compiler 적용 50.0KB) |
| Vue | 3.5.43 (3.6 Vapor는 rc.9) | 1,846만 | 54.5k | 52.8% | 84.5% | 47.4% | 23.3KB (Vapor 17.6KB) |
| **Svelte** | **5.57.1** | 683만 | 88.2k | 27.5% | **87.0%** | **63.4%** | **9.7KB** |
| Preact | 10.29.8 (11은 rc.2) | 3,890만 | 38.9k | 15.4% | 81.7% | 27.4% | 5.7KB |
| Solid | 1.9.15 (2.0은 rc.10) | 628만 | 36.1k | 10.6% | 90.0% | 55.8% | 4.5KB |

\* js-framework-benchmark(2026-09-01 커밋 결과)의 1k행 테이블 앱 압축 전송 크기. "hello world + α"에 가깝다. SoJS = State of JS 2025([프런트엔드 프레임워크](https://2025.stateofjs.com/en-US/libraries/front-end-frameworks/)). Stack Overflow 2025 "Admired"는 Svelte 62.4%, React 52.1%, Vue 50.9%.

**ThoughtWorks Radar Vol.34(2026-04)**: **React와 Svelte 모두 Adopt.** Svelte는 Trial에서 올라왔고, Radar는 "성능과 전달 단순성이 중요한 현대 웹앱의 합리적 기본값"이라고 평했다.

### 1.2 "LLM은 React를 가장 잘 안다"는 주장, 증거로 따져 보기
- **맞는 부분**:
  - 학습 데이터 양은 압도적이다(다운로드 30배, SoJS 사용률 3배).
  - v0·Lovable·Figma Make 같은 프롬프트→UI 도구는 React만 출력한다.
  - React는 API 변화가 점진적이라 "옛 문법" 문제가 적다.
  - LLM이 가장 인기 있는 선택으로 기우는 편향은 연구로 확인됐다(arXiv 2503.17181, 2608.06041).
- **정량 증거는 약하다**:
  - Web-Bench(ByteDance, arXiv 2505.07473, 2025-05)에서 Claude 3.7은 React 65 대 Svelte 25였다. 그러나 thinking 모드에서는 60 대 55이고, DeepSeek-R1은 40 대 40이다. 구세대 모델과 작은 표본이다.
  - SvelteBench(Svelte 5 runes 과제 9개, 2026-09 갱신)에서는 현재 최상위 모델 약 25개가 100%다. 포화된 벤치마크라 "기본 runes는 문제없다"는 것까지만 보여 준다.
  - **현세대 프런티어 모델에서 작은 앱 기준으로 큰 품질 격차를 보인 엄밀한 연구는 찾지 못했다.**
- **Svelte의 실제 위험은 "모른다"가 아니라 "옛 버전을 섞는다"이다.** 전형적인 혼입:
  - `export let` → `$props()`
  - `$:` → `$derived`/`$effect`
  - `on:click` → `onclick`
  - `<slot>` → `{#snippet}`/`{@render}`
  - 스토어 → `$state` 클래스 필드
  - `use:action` → `{@attach}`
- **Svelte 팀은 이 위험을 정면으로 다룬다**:
  - `svelte.dev/llms.txt`에서 llms-full(약 1.19MB), medium(837KB), **small(53KB)** 을 제공한다.
  - **공식 MCP 서버** `@sveltejs/mcp` 0.1.26(첫 배포 2025-09-24)은 로컬 `npx -y @sveltejs/mcp` 또는 원격 `https://mcp.svelte.dev/mcp`로 쓴다. 도구는 `list-sections`, `get-documentation`, **`svelte-autofixer`**(정적 분석, 깨끗해질 때까지 반복 호출), `playground-link`다.
  - **Claude Code 공식 플러그인**: `/plugin marketplace add sveltejs/ai-tools` → `/plugin install svelte`. MCP, `svelte-code-writer`·`svelte-core-bestpractices` 스킬, 파일 편집 서브에이전트를 묶는다. [svelte.dev/docs/ai](https://svelte.dev/docs/ai/overview)
  - 결론: **구문 혼입은 autofixer와 svelte-check가 기계적으로 잡는 종류의 오류**다. 에이전트 루프 안에서 자동 교정된다.
- **이 프로젝트에서 React가 불리한 점**:
  - 런타임이 약 50KB 무겁다. 게스트는 핫스팟으로 첫 로드 ≤ 2초를 지켜야 한다.
  - 내장 트랜지션이 없어 애니메이션 라이브러리가 사실상 필수다.
  - 이미 Svelte로 쓴 계획·문서를 다시 써야 한다.
  - React Compiler 1.0(2025-10-07 안정)이 메모이제이션 부담을 줄였지만, Vite 연결은 `@vitejs/plugin-react` 6.1.1 + `@rolldown/plugin-babel` + `reactCompilerPreset()`으로 바뀌는 중이다(Rust 경로는 실험적). 에이전트가 틀리기 쉬운 새 설정 표면이다.

### 1.3 후보별 판정
| 후보 | 에이전트 친화 자료 | 이 프로젝트 판정 |
|---|---|---|
| **Svelte 5** | llms.txt(4종), 공식 MCP + autofixer, Claude Code 플러그인, 공식 스킬 | **ADOPT(유지)**. Svelte 공식 Claude Code 플러그인(또는 MCP)을 설치하고, AGENTS.md에 "Svelte 5 runes만, SvelteKit 미사용, `experimental.async` 미사용"을 명시. Attachments(5.29+)는 사용 가능. 비동기 Svelte와 원격 함수는 실험적이라 금지 |
| React 19.3 (+Compiler 1.0) | react.dev/llms.txt, 학습 데이터 최다. 공식 MCP 없음 | **REJECT**(이 프로젝트). 새 프로젝트이고 UI가 크고 디자인 도구 출력을 그대로 쓸 계획이라면 합리적 기본값이다. 그러나 여기서는 번들·애니메이션·기존 문서 비용이 이점보다 크다 |
| Preact 10 (+signals) | llms.txt(v10). React 학습 데이터 재사용 가능 | **HOLD**. React 지식과 작은 번들을 둘 다 얻는 유일한 선택지다. 다만 11이 RC라 곧 버전 전환이 오고, 호환 레이어(`preact/compat`) 함정이 있다. Svelte가 실패할 때의 대안 1순위 |
| Solid 1.9 / 2.0 RC | llms.txt | **REJECT**. 2.0 전환 중이라 학습 데이터(1.x)와 현재 API가 어긋난다. 에이전트에 최악의 시점 |
| Vue 3.5 / 3.6 Vapor RC | llms.txt, 커뮤니티 스킬. 공식 MCP 없음 | **REJECT**. 장점이 Svelte와 겹치고, Vapor 전환 중이라 Solid와 같은 문제 |

**결론**: "LLM이 React를 가장 잘 안다"는 사실이다. 하지만 그 차이는 **현세대 모델 + 공식 MCP/autofixer + 타입 검사 루프**에서 대부분 사라진다. 반면 Svelte의 이점(번들 1/5, 내장 트랜지션, 만족도 1위권, Radar Adopt)은 이 앱의 핵심 제약(핫스팟 첫 로드, 애니메이션)에 직접 닿는다.

## 2. 스타일링·디자인 시스템

### 2.1 Tailwind CSS v4
- **무엇**: 유틸리티 클래스 CSS 프레임워크. v4(2025-01-21)는 설정을 CSS로 옮겼다(`@import "tailwindcss"`, `@theme {}`, `@plugin`, `@custom-variant`). Vite는 `@tailwindcss/vite` 플러그인으로 연결한다. 런타임 JS는 없다.
- **채택 근거**: `tailwindcss` **4.3.3**(MIT), 주간 다운로드 1억 4,766만, `@tailwindcss/vite` 5,514만(2026-09-20~26). GitHub 97.7k★, 마지막 푸시 2026-09-25. State of CSS 2025 "CSS 프레임워크" 문항 응답 3,977명 중 2,041명이 사용해 1위다(Bootstrap 1,194, shadcn/ui 766). [State of CSS 2025](https://2025.stateofcss.com/en-US/other-tools/)
- **유지보수 리스크**: 2026-01-06 Tailwind Labs가 엔지니어 4명 중 3명을 해고했다(AI 도구 확산으로 문서 트래픽 −40%, 매출 −80%). 48시간 안에 Vercel·Google AI Studio·Lovable·Supabase 등이 후원을 발표했고 저장소는 계속 활발하다. MIT 코어라 당장 위험하지는 않지만, 팀이 작아 버그 수정은 느려질 수 있다. [devclass 2026-01-08](https://devclass.com/2026/01/08/tailwind-labs-lays-off-75-percent-of-its-engineers-thanks-to-brutal-impact-of-ai/)
- **번들**: 사용한 클래스만 CSS로 출력된다. 보통 gzip 10KB 미만(추정).
- **에이전트 친화도**: 학습 데이터는 가장 많은 축이다. 그러나 **대부분이 v3 문법**이라 LLM이 v3 코드를 자주 쓴다(`tailwind.config.js`, `@tailwind base`, `npx tailwindcss init`, PostCSS 설정, `bg-opacity-*`, `flex-shrink-*`, Svelte `<style>` 안의 `@apply`에 `@reference` 누락). 공식 llms.txt는 없다(tailwindcss.com PR #2388을 정책상 닫음). 공식 MCP도 없어 Context7에 의존해야 한다.
- **이 프로젝트 적합도**: 이 게임은 카드 테이블 한 장면, 모달 몇 개, 설정 화면 정도라 컴포넌트가 적다. 스타일 대부분은 카드 위치·transform·z-index처럼 **동적 계산값**이라 유틸리티 클래스의 이점이 작다. Svelte scoped `<style>`과 CSS 변수만으로 충분하고, LLM도 plain CSS는 버전 혼동 없이 정확하게 쓴다.
- **판정: HOLD.** 도입하지 않는다. 설정·로비 화면 작업이 커져 반복 스타일이 눈에 띄면 그때 v4만 TRIAL한다(CLAUDE.md에 "v4 문법만, config 파일 금지" 명시 조건).

### 2.2 shadcn/ui 계열과 헤드리스 프리미티브
| 라이브러리 | 버전·날짜 | 주간 DL | ★ / 최근 푸시 | 비고 |
|---|---|---|---|---|
| shadcn (CLI, React) | 4.21.0 | 1,116만 | 124.7k / 2026-09-24 | CLI 3.0(2025-08)부터 레지스트리 MCP 서버, CLI 4(2026-03)는 skills/presets. llms.txt 있음 |
| shadcn-svelte | 1.7.0 (2026-09-16), 1.0은 2025-06-08 | 15.2만 | 9.2k / 2026-09-23 | Svelte 5 + Tailwind v4 필수. 코드를 복사해 오는 방식 |
| Bits UI | 2.19.3 (2026-09-22) | 115만 | 3.6k / 2026-09-22 | Svelte 5 헤드리스(shadcn-svelte의 기반). llms.txt 있음 |
| Melt UI | `@melt-ui/svelte` 0.86.6 / 차세대 `melt` 0.44.0 | 18.9만 / 7.5천 | 차세대 저장소 331★, **마지막 푸시 2026-03-04** | Svelte 5 재작성판이 정체. 피한다 |
| Radix Primitives | `radix-ui` 1.6.7 | 1,610만 | 19.3k / 2026-08-08 | React 전용, WorkOS 유지(속도 느려짐) |
| Base UI | `@base-ui/react` 1.8.0 (1.0: 2025-12-11) | 1,650만 | 11.0k | React 전용 |
| Ark UI / Zag.js | `@ark-ui/svelte` 5.24.2 | 1.2만 | 5.4k | Svelte 바인딩 있으나 채택 작음 |

- **적합도**: 게임에 필요한 프리미티브는 다이얼로그(고/스톱, 설정), 바텀 시트, 토스트 정도다. 고/스톱 모달은 게임 연출의 일부라 직접 만드는 편이 낫다. 설정 화면의 접근성(포커스 트랩, ESC)만 헤드리스가 도움이 된다. 그런데 네이티브 `<dialog>` 요소(`showModal()`)가 iOS 15.4+ Safari에서 동작하고 포커스 관리를 제공해 대부분을 해결한다.
- **판정**: **shadcn-svelte·Bits UI: HOLD**(네이티브 `<dialog>`로 부족할 때만 Bits UI 단일 컴포넌트를 TRIAL). **shadcn/ui(React)·Radix·Base UI: REJECT**(React 전용). **Melt UI: REJECT**(정체).

### 2.3 daisyUI 5, Skeleton, Panda CSS, vanilla-extract, CSS Modules
- **daisyUI 5.7.46**(MIT, 114만/주, 42.5k★): CSS만 있는 Tailwind v4 플러그인이고 llms.txt(80KB)도 제공한다. 하지만 결과물이 "일반 웹앱" 모양이라 화투 테이블에는 맞지 않는다. **REJECT.**
- **Skeleton 5.0.1**(v4 2025-10-13, v5 2026-07-17, 6.6만/주): 9개월 사이 메이저 버전이 두 번 올라가 마이그레이션 부담이 크고, `@zag-js/*` 약 30개를 끌어온다. **REJECT.**
- **Panda CSS 1.12.1**(41만/주; State of CSS 3,718명 중 62명)과 **vanilla-extract 1.21.2**(313만/주; 98명): 코드 생성·빌드 단계가 추가된다. Svelte는 이미 스타일을 컴포넌트 범위로 제한한다. **REJECT.**
- **CSS Modules / Svelte scoped `<style>`**: Vite와 Svelte에 내장되어 의존성이 없다. State of CSS 2025 "CSS-in-JS" 문항 1위(1,037명, "없음" 2,110명). LLM이 가장 틀리지 않는 방식이다. **ADOPT**(Svelte scoped style + `:root` CSS 변수).

### 2.4 디자인 토큰 (W3C DTCG, Style Dictionary 5)
- DTCG 명세가 **첫 안정판 2025.10**(2025-10-28)을 냈다. 테마·모드(Resolver), OKLCH/P3 색, 구조화된 치수를 포함한다. [W3C 공지](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)
- Style Dictionary **5.5.5**(Apache-2.0, 247만/주)는 DTCG를 읽지만 2025.10 대응은 부분적이다.
- **적합도**: 출력 대상이 웹 하나(나중에 네이티브 셸이 생겨도 UI는 웹)라 변환 파이프라인의 이점이 없다.
- **판정**: **Style Dictionary REJECT.** **"토큰 파일 하나" 관례는 ADOPT.** `packages/web/src/styles/tokens.css`에 `--color-*`, `--space-*`, `--radius-*`, `--dur-*`(spec 6.4 애니메이션 예산), `--z-*`를 OKLCH로 선언한다. 이름은 DTCG 그룹 규칙과 호환되게 짓는다. 에이전트는 색·간격·시간을 이 변수로만 쓰고, 이를 lint로 강제한다(예: stylelint 없이 `color: #` 금지 grep 검사).

### 2.5 Material 3 Expressive, Apple HIG / Liquid Glass
- **M3 Expressive**(2025-05, Android 16): 스프링 모션, 형태 모핑, 강한 색. Compose·Flutter 대상이고 웹 공식 구현은 없다. 가져올 것은 아이디어뿐이다: 스프링 감의 이징(CSS `linear()`로 근사), 큰 터치 영역.
- **Liquid Glass**(iOS 26): 가독성 비판이 크고(NN/g), `backdrop-filter` 블러는 저사양에서 비싸다. 카드 테이블에는 쓰지 않는다.
- **Apple HIG**: 44pt 최소 터치 영역, safe-area inset, 한 손 엄지 도달 영역은 그대로 적용한다.
- **판정: 두 시스템 모두 REJECT(시각 언어로서).** HIG의 터치·safe area 규칙만 ADOPT.

### 2.6 Storybook 9/10을 에이전트용 컴포넌트 계약으로 쓰기
- 9.0(2025-06): Vitest 애드온(컴포넌트·a11y·시각 테스트), 코어 48% 경량화. 10.0(2025-10-28): ESM 전용, 설치 크기 29% 감소. 현재 **10.6.0**(2026-09-02), 주간 2,587만, 91.2k★. Svelte CSF는 runes·snippets를 지원한다.
- **AI 기능**: `@storybook/addon-mcp` 10.6.0은 "preview" 단계다. 문서 도구 세트는 컴포넌트 매니페스트가 필요한데, 이것을 **React만 생성하고 Svelte는 미지원**이다. [Storybook MCP 문서](https://storybook.js.org/docs/ai/mcp/overview)
- **비용**: 프로덕션 번들 영향은 0이다. 대신 devDependency가 크고 메이저 업그레이드가 잦다(9→10이 5개월 간격).
- **판정: HOLD.** 대신 **`/dev/gallery` 개발 전용 라우트**(카드 51장, 손패 상태, 바닥 배치, 획득패 더미, 모달, 배너를 한 페이지에 고정 상태로 렌더)를 ADOPT한다. Playwright 스냅샷과 axe 검사를 이 페이지에 건다. Storybook이 Svelte 매니페스트를 지원하면 재검토한다.

### 2.7 디자인→코드 AI 도구 (디자이너 없음 전제)
| 도구 | 출력 | 무료 범위 | 이 프로젝트 |
|---|---|---|---|
| Figma MCP(원격) | 코드 컨텍스트 | Starter/View 좌석 월 6~20회, 유료 Dev 좌석 일 200회 | Figma 파일이 없으면 가치 없음 → REJECT |
| Figma Make | React 프로토타입 | 월 500 크레딧 | REJECT |
| v0 / Lovable | React·Next·shadcn | v0 월 $5 크레딧 | REJECT(React) |
| Bolt.new | Svelte/SvelteKit 가능 | 제한적 무료 | HOLD |
| Google Stitch | HTML/Tailwind, Figma 등(Svelte 없음) | 월 350+200회 생성 | **TRIAL**: 테이블·로비 시안 탐색용 |
| Claude Design(Anthropic Labs, 2026-04-17, Pro 이상 프리뷰) | HTML 프로토타입 → Claude Code 인계 | 구독 포함 | **TRIAL**: 시안 탐색용 |

- **결론**: 디자이너가 없으면 "화면 한 장 시안 → 스크린샷을 에이전트에 제공 → Svelte로 이식"이 현실적인 흐름이다. 시안 도구 출력을 코드베이스에 직접 넣지 않는다(React/Tailwind v3 혼입 위험). 시안은 `docs/design/`에 이미지로 두고 계약으로 쓴다.

## 3. 애니메이션·렌더링

### 3.1 후보 비교
| 후보 | 버전·날짜 | 라이선스 | gzip 크기 | 주간 DL / ★ | 에이전트 자료 | 판정 |
|---|---|---|---|---|---|---|
| **Web Animations API(WAAPI) + 직접 FLIP** | 플랫폼(Safari 13.1+) | — | 0KB(헬퍼 약 1KB) | — | MDN, 학습 데이터 풍부 | **ADOPT(카드 이동 전부)** |
| **Svelte 내장** (`svelte/transition`, `animate:flip`, `svelte/motion` Spring/Tween) | svelte 5.57.1 | MIT | 이미 포함 | 683만 / 88k | svelte.dev/llms.txt, Svelte MCP | **ADOPT(UI 요소: 모달·배너·토스트)** |
| Motion(`motion`, 구 framer-motion) | 13.4.4 (2026-09-25) | MIT | 미니 `animate()` **2.3KB**, 하이브리드 18KB, 전체 47.7KB | 2,495만 / 33.8k | llms.txt(62KB), 무료 MCP `mcp.motion.dev`, `npx motion-ai` 스킬 | **TRIAL(시퀀싱이 고통스러울 때 미니 animate만)** |
| GSAP 3 + Flip | 3.15.0 (2026-04-13) | "Standard No Charge" 독자 라이선스(비OSI) | core 28.3KB + Flip 9.7KB ≈ 38KB | 580만 / 28.7k | llms.txt, 공식 에이전트 스킬 `greensock/gsap-skills` | HOLD(대안 1순위) |
| PixiJS 8 | 8.21.0 | MIT | 약 261KB | 125만 / 48k | 있음 | REJECT |
| Phaser 4 | 4.2.1 (4.0 최종: 2026-04-10) | MIT | 약 356KB | 46만 / 40k | 있음 | REJECT |
| Rive | canvas-lite 2.43.1 | 런타임 MIT | JS 46KB + **WASM 360KB** | 133만 | — | REJECT(2025-10부터 에디터 export 유료 $9/월) |
| dotLottie-web | 0.80.0 | MIT | JS 33KB + **WASM 496KB** | 188만 | — | HOLD(장식 효과 한정) |
| Theatre.js | 0.7.2 (2024-05) | Apache-2.0 | 31KB | 3.6만 | — | REJECT(2024-08 이후 공개 저장소 정지) |
| View Transitions API(same-document) | Safari 18.0+, Chromium 111+ | — | 0KB | — | — | HOLD(점진적 향상만. 게스트 목표 iOS 17+ 미지원, 전체 문서 스냅샷·동시 1개 제한) |

### 3.2 GSAP 라이선스 확인
- 3.13(2025-04-29)부터 **SplitText·MorphSVG 등 전 플러그인 포함 100% 무료**이고 상업 사용도 가능하다. 플러그인은 `gsap` npm 패키지에 포함된다. [gsap.com/blog/3-13](https://gsap.com/blog/3-13/)
- 라이선스는 MIT가 아닌 **"Standard 'No Charge' GSAP License"**다(Webflow 소유). [원문](https://gsap.com/standard-license)
  - 금지(Prohibited Uses): "Webflow의 시각적 애니메이션 빌더와 경쟁하는, 코드 없이 애니메이션을 만드는 도구"에 쓰는 것과, 경쟁 제품을 위한 리버스 엔지니어링.
  - Webflow는 약관을 개정할 수 있다. 개정에 동의하지 않으면 이후 버전을 쓸 수 없고 이전 버전은 계속 쓸 수 있다. 위반 시 라이선스가 종료된다.
  - 카드 게임은 명백한 허용 사용이다.
- 평가: 법적 위험은 낮다. 다만 "비OSI + 단일 기업 소유 + 약관 개정 권한"이라, plan.md 원칙 2(검증된 패키지)와 NF-07(오픈소스 고지)에 비해 MIT 대안보다 불리하다. 저장소 푸시도 2026-04-13 이후 없다.

### 3.3 왜 WAAPI 직접 FLIP인가
- **성능**: `element.animate()`로 `transform`·`opacity`만 애니메이션하면 컴포지터 스레드에서 돈다. Svelte 로직이나 AI 결과 처리로 메인 스레드가 바빠도 끊기지 않는다. 반면 GSAP은 requestAnimationFrame으로 메인 스레드에서 매 프레임 인라인 transform을 쓴다. Safari 26.x는 시간 기반 애니메이션 해석을 별도 스레드로 옮겼다. [WebKit Safari 26.4](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/)
- **Svelte 5와의 관계**: Svelte 5의 transition과 `animate:`도 내부적으로 WAAPI(`css(t,u)`를 키프레임으로 샘플링해 `element.animate()` 호출)다. 따라서 같은 엔진이다. 그러나 **`animate:flip`은 같은 keyed `{#each}` 안에서만** 동작한다. 손패→바닥→획득패처럼 **컨테이너를 넘는 이동**은 `crossfade`로 짝지어야 하는데, 타임라인이 없어 시퀀싱이 어렵다.
- **시퀀싱**: `anim.finished` Promise를 `await`하면 이벤트 열 재생 큐가 단순한 async 함수가 된다. 테스트도 쉽다: 재생 시간 상수를 0으로 두면 E2E가 즉시 진행된다.
- **에이전트 관점**: WAAPI와 FLIP은 버전 문제가 없는 웹 표준이다. 약 30줄짜리 헬퍼(`moveCard(el, from, to, {duration, easing, delay})`) 하나를 에이전트가 공유 계약으로 쓰게 하면, 라이브러리 API 변화(예: framer-motion → motion 이름 변경)에 노출되지 않는다.

### 3.4 턴 700ms를 60fps로 맞추는 방법 (iPhone Safari 기준)
1. **이벤트 재생 파이프라인**: 엔진의 `reduce`가 턴 전체 이벤트를 먼저 계산한다. 애니메이션 큐는 계산이 끝난 뒤에만 재생하고, 재생 중에는 Svelte 상태를 바꾸지 않는다. 큐가 끝나면 최신 뷰로 스냅샷 보정한다(plan 1.6 유지).
2. **FLIP 절차**: 시작 rect 측정 → 상태 커밋(Svelte `tick()`) → 끝 rect 측정 → 역변환 transform으로 시작 위치에 둠 → `el.animate([{transform: inv}, {transform: 'none'}], {duration, easing})`.
3. **예산 배분 예**("빠름" 기준, spec 6.4와 일치):
   - 손패→바닥 120ms, 매칭 강조 80ms, 더미 플립 140ms.
   - 획득 이동 160ms(30ms 스태거, 4장이면 250ms).
   - 합계 약 590ms에 여유 약 100ms.
   - 이징은 `cubic-bezier(.2,.8,.2,1)` 또는 CSS `linear()`로 스프링 근사(Safari 17.2+).
4. **transform·opacity만 움직인다.** `top/left/width`, `box-shadow`, `filter`/`drop-shadow`, SVG 속성은 애니메이션하지 않는다. 그림자는 미리 그린 그림자 요소의 opacity로 대체한다. [web.dev animations guide](https://web.dev/articles/animations-guide)
5. **카드 앞면은 `<img src="*.svg">` 또는 사전 래스터화한 2x WebP**로 그린다. 인라인 `<svg>`는 DOM과 스타일 재계산을 키운다. 카드 SVG에서 filter를 제거한다(Safari는 filter가 있는 SVG를 느리게 래스터화한다).
6. **플립**은 앞·뒷면 두 장을 겹쳐 `backface-visibility:hidden` + `rotateY`로 만든다. 더 싸게 하려면 `scaleX 1→0 → 이미지 교체 → 0→1`로 한다.
7. **`will-change`는 움직이는 카드에만** 직전에 걸고 끝나면 제거한다. 48장 전부에 걸면 iOS WebKit의 페이지 메모리 상한을 넘어 WebContent 프로세스가 죽을 수 있다(빈 화면이나 재로드). [MDN will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)
8. **동시 이동 12장 이하**. 분배는 스태거로 나눈다.
9. **`prefers-reduced-motion`**: Svelte 5.7+의 `prefersReducedMotion`으로 지속 시간 배율을 0.1로 둔다. 전역 CSS로 animation-duration을 0으로 만드는 방식은 WAAPI에 적용되지 않으니 주의한다.
10. **계측**: E2E에서 `performance.now()`로 "탭→턴 종료" 시간을 기록하고 700ms 초과 시 실패시킨다(Playwright, Chromium/WebKit). 실기기에서는 Safari Web Inspector의 Timelines → Frames로 확인한다.

### 3.5 피할 것
- Canvas 엔진(Pixi·Phaser): 번들 250~360KB에 DOM/Svelte UI를 재작성해야 한다. 접근성과 텍스트 렌더링도 직접 해야 한다.
- WebGPU: 보안 컨텍스트가 필요해 http 게스트에서 쓸 수 없다.
- Rive·Lottie: WASM 360~500KB. Rive는 export가 유료다.
- Theatre.js: 정지.
- View Transitions를 핵심 경로로 쓰는 것: iOS 17 게스트에서 동작하지 않는다.
- `backdrop-filter` 글래스 효과, 애니메이션되는 그림자.

## 4. 도구 체인

### 4.0 먼저 바로잡을 것: TypeScript 7 단독 사용은 현재 불가능
- TS **7.0.2**(2026-07-08)는 **안정된 프로그래밍 API 없이** 출시됐다. 패키지의 `exports`에는 `./unstable/*`만 있다. TS 팀 발표문도 "Vue, MDX, Astro, Svelte 등을 쓰는 워크플로는 아직 TS 7을 활용하지 못할 가능성이 높다"고 적었다. 7.1에서 새 API가 나올 예정이다. [TS 7.0 발표](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- **typescript-eslint 8.70.1**의 peer 범위는 `typescript >=4.8.4 <6.1.0`이다. 메인테이너는 "TS 7 API가 생기기 전까지 할 수 있는 게 없다, TS 6을 쓰라"고 답했다. [#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518), [#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
- **svelte-check 4.7.6**의 peer 범위는 `typescript ^5 || ^6`이다. TS 7을 설치하면 svelte2tsx가 즉시 크래시한다([#3063](https://github.com/sveltejs/language-tools/issues/3063), 메인테이너: "근본적으로 호환되지 않는다. TS 6이 여전히 필요하다"). `--tsgo` 플래그 경로가 있지만 TS 6과 7을 모두 설치해야 하고, Linux CI 크래시(#3095)와 파일 포함 오류(#3120)가 열려 있다.
- **결론**: tech-stack.md 권장 스택의 "TypeScript 7.0.2 (문제 시 6.0.3)"는 **"TypeScript 6.0.3 기본, TS 7은 선택적 병행"으로 뒤집어야 한다.** 이는 "문제 시" 조건이 아니라 이미 확정된 비호환이다(리스크 R9 발현).
  - `typescript`: `6.0.3`(ESLint, svelte-check, Vite 플러그인이 사용).
  - 선택: `"@typescript/native": "npm:typescript@7.0.2"` 별칭으로 `packages/engine`·`ai`·`protocol`(.svelte 없음)의 빠른 `tsc --noEmit`에만 쓴다. TS 7.1 안정 API가 나오고 typescript-eslint와 svelte-check가 지원을 발표하면 전환한다.

### 4.1 린트·포맷
| 도구 | 버전 | 주간 DL | .svelte 지원 | 금지 API 규칙 | 판정 |
|---|---|---|---|---|---|
| **ESLint 10 + eslint-plugin-svelte + typescript-eslint** | 10.11.0 / 3.23.0 / 8.70.1 | 1억 8,338만 / 163만 / 1억 127만 | 완전(템플릿 포함) | 코어 `no-restricted-properties` + `no-restricted-syntax`로 대부분 해결 | **ADOPT(유지)** |
| **Prettier 3 + prettier-plugin-svelte** | 3.9.9 / 4.1.1 | 1억 5,426만 / 182만 | 완전 | — | **ADOPT(유지)** |
| Biome 2 | 2.5.14 | 1,749만 | **실험적**(`html.experimentalFullSupportEnabled`). GritQL 플러그인은 .svelte에 적용 안 됨 | .svelte에서 불가 | HOLD |
| oxlint 1.x + oxfmt | 1.85.0 / 0.70.0 | 2,530만 / 1,636만 | oxlint는 `<script>` 블록만. JS 플러그인 alpha(2026-03). oxfmt Svelte는 실험적 | 네이티브 `no-restricted-properties` 있음 | HOLD(나중에 ESLint 앞단 고속 1차 패스로 TRIAL 가능) |

- **금지 API 강제는 커스텀 규칙 없이 설정으로 한다** (plan 1.6의 "ESLint 커스텀 규칙"을 단순화):
  - `no-restricted-properties`: `navigator.serviceWorker`, `navigator.wakeLock`, `navigator.clipboard`, `navigator.share`, `crypto.subtle`, `crypto.randomUUID`.
  - `no-restricted-syntax`: `MemberExpression[property.name=/^(serviceWorker|wakeLock|clipboard|subtle|randomUUID|share)$/]`로 `window.`·`globalThis.` 경유도 잡는다.
  - 에이전트가 이해하기 쉽고 유지비가 0이다. 구조 분해 우회(`const {clipboard} = navigator`)만 추가 셀렉터로 막는다.
  - 외부 URL 금지(R5c)는 빌드 후 `dist`에서 `http(s)://` grep하는 스크립트로 처리한다.
- **왜 Biome/oxc로 바꾸지 않나**: 빠르고 "에이전트 시대 표준"으로 떠오르는 중이지만, 이 프로젝트의 핵심 파일 형식(.svelte)을 완전히 다루지 못한다. 속도 이득(수 초)보다 규칙 누락 위험이 크다.

### 4.2 패키지 관리자와 모노레포
- **npm workspaces 유지(ADOPT)**. Node 24.21.0 LTS는 npm **11.19.0**을 번들한다(npm 최신은 12.1.0, Node `^24.15` 요구).
- **보안 설정을 `.npmrc`에 추가한다**: `min-release-age=3`(npm 11 설정, 공개 후 3일 지난 버전만 설치). 2025년 npm 공급망 공격(Shai-Hulud 등) 대응이다. `ignore-scripts=true`도 시도한다(Vite 8/Rolldown, Playwright는 도커 이미지에 브라우저 내장이라 설치 스크립트가 필요 없을 가능성이 높다. 깨지면 그 패키지만 확인).
- pnpm: **HOLD**.
  - 사실: State of JS 2025 모노레포 도구 사용은 pnpm 3,940, npm workspaces 2,129로 pnpm이 사실상 표준이다. pnpm 11은 `minimumReleaseAge=1440`, `strictDepBuilds` 등 안전한 기본값을 가진다. pnpm 12(2026-08-26)는 Rust 재작성판으로 한 달 차다.
  - 이득(엄격한 의존성 격리로 에이전트의 미선언 import 차단)은 **Knip의 unlisted dependencies 검사로 대부분 대체**된다. 세 도커 이미지 모두 추가 설치가 필요하다.
  - 바꾼다면 12가 아닌 **pnpm 11.27.1**.
- Turborepo 2.11.5 / Nx 23.2.1 / moon 2.5.6: **REJECT**. 패키지 6개는 `npm run -ws --if-present`와 `tsc -b` 프로젝트 참조로 충분하다. CI 캐시가 아프면 그때 turbo를 본다.
- tsdown 0.23.0 / tsup 8.5.1(README에서 유지보수 중단, tsdown 권장) / unbuild: **REJECT**. 내부 패키지는 `.ts` 소스를 `exports`로 직접 노출하고 Vite가 번들한다. `relay-dev`는 Node 24의 타입 스트리핑(`erasableSyntaxOnly`)으로 실행한다.
- Changesets 3.0.3, publint 0.3.24, arethetypeswrong 0.18.5: **REJECT**(배포하지 않는 패키지).

### 4.3 테스트
- **Vitest 5.0.2 브라우저 모드: ADOPT.** Vitest 4(2025-10)부터 안정이다. `@vitest/browser-playwright` 5.0.2(Vitest와 정확히 같은 버전 필요)와 `vitest-browser-svelte` 3.1.0을 쓴다. Svelte 컴포넌트를 실제 Chromium/WebKit에서 렌더하고 `expect.element()`로 검사한다. jsdom의 가짜 레이아웃으로는 FLIP 측정(`getBoundingClientRect`)을 테스트할 수 없으므로 이 프로젝트에 특히 중요하다. Playwright 도커 이미지에서 실행한다.
- **Playwright 1.63 E2E: ADOPT(유지).**
- Storybook test-runner: **REJECT**(`@storybook/addon-vitest`로 대체됨). Storybook 자체도 HOLD(2.6절).
- **fast-check 4.10.2**(MIT, 4,839만/주): **ADOPT**. 엔진 불변식(spec 4.4: 카드 보존 48+보너스, 합법 수만 적용, 결정론)을 임의 시드·임의 액션 열로 검사하는 속성 기반 테스트다. JSON 벡터가 "알려진 사례"를 지키고, fast-check가 "모르는 사례"를 찾는다. 에이전트가 작성한 엔진 코드의 숨은 버그를 가장 싸게 잡는다.

### 4.4 에이전트용 브라우저 도구
- **chrome-devtools-mcp 1.10.1**(Google, Apache-2.0, 52.7k★, 306만/주): **ADOPT(개발 시)**. 콘솔·네트워크·성능 트레이스를 준다. 에이전트가 "애니메이션이 60fps인가, 외부 요청이 없는가"를 직접 확인할 수 있다. 도커 컨테이너의 Chromium에 `--remote-debugging-port`로 붙인다.
- **@playwright/mcp 0.0.82**(37.6k★, 774만/주, 아직 0.0.x): **TRIAL**. 접근성 트리 스냅샷으로 조작해 토큰이 많이 든다. 테스트의 기준은 코드로 된 Playwright 테스트이고, MCP는 탐색용이다. ThoughtWorks Radar도 "CLI나 스킬로 될 일에 MCP를 기본값으로 쓰는 것"에 신중하라고 한다.

### 4.5 코드 위생
- **Knip 6.38.0**(ISC, 1,727만/주): **ADOPT**. 에이전트가 남기는 미사용 파일·export·의존성과 미선언 의존성을 CI에서 잡는다. 에이전트 작업의 흔한 부산물을 자동으로 정리하게 해 준다.
- **번들 예산 검사**: `dist` 총 크기 ≤ 1.5MB를 검사하는 스크립트(의존성 0)를 **ADOPT**한다. size-limit 14.1.0은 여러 예산을 관리할 때 고려한다(HOLD).
- **svgo 4.1.0**(MIT): **ADOPT(빌드 시 카드 SVG 최적화)**. 번들 예산과 렌더 성능(filter 제거) 모두에 기여한다. CC BY-SA 저작자 메타데이터 보존 설정에 주의한다.

### 4.6 의존성 업데이트
- **Dependabot: ADOPT.** GitHub 내장·무료이고, 2026-07-14부터 버전 업데이트에 기본 3일 쿨다운이 적용된다(보안 업데이트 제외). devDependencies를 그룹으로 묶어 주 1회 PR 하나로 받는다. `github-actions`와 `gradle` 생태계도 함께 켠다.
- Renovate: HOLD. 더 유연하지만 1인 프로젝트에는 설정 표면이 과하다.

## 5. 모바일 셸 대안

### 5.1 판단의 핵심 사실
이 앱에 네이티브로 필요한 것은 세 가지다: **(1) 실제 TCP 포트의 HTTP+WebSocket 서버(iPhone 게스트가 LAN으로 접속), (2) LocalOnlyHotspot, (3) `connectedDevice` 포그라운드 서비스.** 조사한 어떤 프레임워크도 이 셋을 제공하지 않는다. 어느 셸을 고르든 이 부분은 Kotlin으로 직접 쓴다. 따라서 프레임워크가 줄여 주는 것은 "Activity + WebView + 브리지" 약 100~200줄뿐이고, 대가로 빌드 표면이 늘어난다.

### 5.2 후보별 평가
| 후보 | 현황 | 이 프로젝트에서의 문제 | 판정 |
|---|---|---|---|
| **직접 작성 Kotlin 셸**(현 계획) | Kotlin 2.4.20, AGP 9.4.1, androidx.webkit 1.17.1 | 관례를 직접 만들어야 한다. 그러나 표준 Android API뿐이라 에이전트의 학습 데이터가 가장 풍부하다 | **ADOPT(유지)** |
| **Capacitor 8** | 8.5.2(2026-09-11), 8.0은 2025-12-08. `@capacitor/core` 507만/주, 16.7k★. Android minSdk 24/target 36, AGP 8.13, Gradle 8.14.3, Node 22+. iOS는 SPM 기본(CocoaPods 불필요) | 자산을 `https://localhost` 가짜 스킴으로 서빙하므로 게스트용 서버는 여전히 Ktor로 직접 써야 한다. 그 결과 자산 경로가 두 개가 되거나, `server.url: "http://127.0.0.1:17777"`이라는 비공식 용법(라이브 리로드용)에 기대야 한다. `cap sync`와 `capacitor.settings.gradle`이 `node_modules`를 참조해 Gradle 빌드에 Node가 필요하다. llms.txt 없음(404) | **HOLD → iOS 단계에서 재평가** |
| `@capacitor-community/bluetooth-le` | 8.3.0(2026-08-13), 9.5만/주, 361★ | README에 **"central 역할만 지원"**이라고 명시되어 있다. 폰↔폰 연결에는 한쪽이 peripheral(GATT 서버)이어야 하므로 **단독으로는 BLE 경로 불가** | REJECT(이 용도) |
| `@capgo/capacitor-bluetooth-low-energy` | 8.2.1(2026-09-17), central+peripheral, MPL-2.0 | 9★, 2025-12 생성. 성숙도가 낮다 | HOLD |
| `@capawesome-team/capacitor-android-foreground-service` | 8.1.0, MIT | 문서상 서비스 타입이 `location`·`microphone`뿐이고 `connectedDevice`는 없다 → 결국 직접 작성 | REJECT |
| Tauri 2 mobile | 2.12.0, 111k★, llms.txt 있음 | Docker에 Rust + 4개 Android 타깃 + NDK + cargo-ndk가 필요하다. 플러그인은 Kotlin+Swift+Rust 3언어. APK 15~30MB/ABI. 가짜 스킴 문제는 Capacitor와 동일 | REJECT |
| Expo SDK 57 / React Native 0.87 | Expo 1,036만/주, llms.txt 있음 | `'use dom'` DOM 컴포넌트는 React DOM만 지원 → Svelte와 맞지 않음. RN+Hermes 추가, APK 20MB+. BLE 라이브러리(ble-plx 등)는 central 위주 | REJECT |
| Flutter 3.47 + webview_flutter 4.14 | llms.txt 있음 | Dart 엔진 5~7MB/ABI + WebView 브리지 한 겹 더. 네이티브 서비스는 여전히 Kotlin 플러그인 | REJECT |
| Kotlin Multiplatform + Compose MP | CMP 1.8(2025-05-06) iOS 안정, 현재 1.12.1 | UI를 재작성해야 한다. iPhone Safari 게스트용 웹 UI는 여전히 필요해 UI 두 벌 | REJECT(UI). KMP 로직 공유는 BLE 단계에서 HOLD |

### 5.3 권고
1. **Android는 현 계획(직접 작성 Kotlin 셸)을 유지한다.** Capacitor로 바꿔도 Ktor·LOHS·FGS 코드는 한 줄도 줄지 않는다. 반면 CI에 Node 연동 Gradle, 가짜 스킴 대 실제 포트 문제, Capacitor 메이저 버전마다 다른 플러그인 작성법이 추가된다.
2. **브리지는 Capacitor 모양으로 설계한다**: 이름 있는 플러그인, Promise 기반 호출, 이벤트 리스너. 웹 쪽에 `bridge.ts` 한 파일을 두어 `window.AndroidBridge`(현 `addWebMessageListener`)와 나중의 `Capacitor.Plugins`를 같은 인터페이스로 감싼다. 그러면 나중 전환 비용이 거의 0이다.
3. **iOS 네이티브 + BLE 단계**:
   - Capacitor 8 iOS(SPM, 공개 저장소면 GitHub macOS 러너 무료)를 1순위로 재평가한다.
   - BLE peripheral/central 플러그인은 직접 작성한다(Android `BluetoothGattServer`/`BluetoothLeAdvertiser`, iOS `CBPeripheralManager`, 각 200~400줄). `@capacitor-community/bluetooth-le`에 기대지 않는다.
   - iOS Safari에는 Web Bluetooth가 없으므로 iOS BLE는 어떤 경우에도 네이티브 앱이 필요하다.

## 6. 에이전트 시대 프로젝트 관례

| 관례 | 현황(근거) | 판정·범위 |
|---|---|---|
| **AGENTS.md + CLAUDE.md** | 2025-12-09 OpenAI가 Linux Foundation 산하 Agentic AI Foundation에 기증(MCP와 함께). 6만+ 저장소, Codex·Cursor·Copilot·Gemini CLI 등이 읽는다. Radar Vol.33 Trial, Vol.34는 "팀 공유 지침(CLAUDE.md/AGENTS.md)"을 Adopt. Claude Code는 CLAUDE.md가 **없을 때만** AGENTS.md를 읽는다. [Claude Code memory 문서](https://code.claude.com/docs/en/memory) | **ADOPT**: 규범은 `AGENTS.md` 한 곳에 두고, `CLAUDE.md`는 `@AGENTS.md` 한 줄과 Claude 전용 메모(훅·스킬 사용법)만 둔다. 내용은 실행 명령(`./dev.sh …`), 버전 고정 표, 금지 사항(Svelte 4 문법, Tailwind v3, 비보안 API, 외부 URL), 테스트 기준 |
| **llms.txt(소비)** | svelte.dev/llms.txt(+ medium/small) 제공. GSAP·Motion·Bits UI·shadcn-svelte도 제공. Tailwind는 없음. 사이트 게시용으로는 채택률이 낮다(상위 1,000개 사이트의 8.7%) | **ADOPT(소비만)**: AGENTS.md에 "Svelte 작업 전 svelte.dev/llms-small.txt 또는 Svelte MCP 참조"를 명시. 이 프로젝트가 llms.txt를 게시할 필요는 없음 |
| **Svelte MCP / Claude Code 플러그인**(`@sveltejs/mcp` 0.1.26, `sveltejs/ai-tools`) | 공식. 문서 섹션 검색, `svelte-autofixer`(생성한 컴포넌트를 정적 분석해 Svelte 4 문법·runes 오용 지적), 스킬 2종 | **ADOPT(개발 시)**: `/plugin install svelte` |
| **Context7** | 무료 월 1,000회 + 한도 후 일 20회(API 키 필요). Radar Vol.33 Trial("코드 환각을 크게 줄임") | **ADOPT(유지)**. 사용자 전역 지침과 일치 |
| **스펙 주도 개발 도구**(Spec Kit 139k★, Kiro, Tessl, OpenSpec) | ThoughtWorks Radar Vol.34에서 Spec Kit·OpenSpec은 Assess. Böckeler의 평가: 리뷰 오버헤드와 거짓 통제감 | **REJECT(도구)**. 이미 `intend.md → spec.md → plan.md` 3단 문서와 규칙 벡터가 SDD의 핵심을 갖추고 있음. 도구를 더하면 중복 |
| **"문서가 곧 테스트"(JSON 벡터)** | plan 원칙 7과 이미 일치 | **ADOPT(유지·확장)**. 벡터에 `id`, `ruleRef`(rules-commercial.md 절 번호) 필드를 두고, 모든 벡터가 테스트에서 소비되는지 검사하는 테스트를 하나 추가. 에이전트가 규칙을 바꾸면 벡터부터 바꾸게 강제 |
| **UI 계약** | Storybook은 Svelte 매니페스트 미지원(2.6절) | **ADOPT: `/dev/gallery` 라우트 + 고정 픽스처(`fixtures/*.json`의 playerView)**. 스크린샷과 axe가 이 페이지를 대상으로 삼음 |
| **시각 회귀** | Playwright `toHaveScreenshot`은 무료. 폰트 렌더링 차이 때문에 로컬과 CI 모두 `mcr.microsoft.com/playwright:v1.63.0-noble` 안에서만 실행. Chromatic 무료 월 5,000 스냅샷(Chrome만), Argos 무료 월 5,000(MIT), **Lost Pixel은 2026-04-22 저장소 보관(archived)** | **ADOPT: Playwright 스냅샷(Chromium+WebKit, 도커 안)**. Argos는 HOLD(PR 리뷰 UI가 필요해지면). Chromatic·Lost Pixel REJECT |
| **접근성 검사** | `@axe-core/playwright` 4.13.0(MPL-2.0, 1,203만/주). vitest-axe는 2025-02 이후 정체 | **ADOPT: E2E·갤러리 페이지에 axe 1회**(심각도 serious 이상 실패). 컴포넌트 단위는 브라우저 모드에서 `axe-core`의 `axe.run()` 직접 호출(선택) |
| **Claude Code 훅·스킬** | 공식 문서: 반드시 지켜야 하는 규칙은 CLAUDE.md가 아닌 훅으로 강제 | **ADOPT(최소)**: PostToolUse 훅으로 편집된 파일에 `prettier --write` + `eslint --fix`(도커 경유가 느리면 커밋 전 단계로). 스킬 1~2개: "도커에서 E2E 실행", "규칙 벡터 추가" |

**최소 세트**:
1. AGENTS.md(+CLAUDE.md 임포트).
2. Svelte MCP와 Context7.
3. JSON 벡터와 fast-check.
4. `/dev/gallery`와 Playwright 스냅샷, axe.
5. PostToolUse 포맷·린트 훅.
6. Knip과 Dependabot.

## 7. 그 밖에 점검한 것

| 항목 | 사실 | 판정 |
|---|---|---|
| Vite 네이티브 워커(`new Worker(new URL('./ai.worker.ts', import.meta.url), {type:'module'})`) | Vite 내장, 의존성 0. iOS 15+ 모듈 워커 지원 | **ADOPT**(AI Worker) |
| Comlink 4.4.2 | Apache-2.0, 309만/주. 그러나 마지막 배포 2024-11-07 | **HOLD**. AI 워커는 "상태 → 수" 요청 1종뿐이라 `protocol`의 타입 메시지 + postMessage 20줄이면 충분. 원칙 2(작은 기능은 직접 구현)와도 일치 |
| 런타임 스키마 검증(Zod 4.6.5 MIT 3억 3,595만/주, Valibot 1.5.0 MIT 2,217만/주) | WebSocket으로 들어오는 게스트 메시지는 신뢰할 수 없는 입력. Zod 4는 `zod/mini`로 트리셰이킹 가능. LLM은 Zod를 가장 잘 알지만 v3/v4 API 혼동 위험(`z.string().email()` → `z.email()` 등) | **TRIAL**: `protocol` 패키지에서 메시지 스키마 = 타입 정의의 단일 근거. Zod 4(`zod/mini`)를 쓰고 AGENTS.md에 "Zod 4 문법" 명시. 번들 영향 수 KB |
| 로컬 퍼스트 상태 라이브러리(Yjs, Automerge, TinyBase, Jazz 등) | CRDT 동기화 목적 | **REJECT**. 권위 엔진이 호스트에 하나뿐이고, 판 상태는 휘발성이며 원장은 localStorage JSON이면 충분 |
| 상태 관리 라이브러리(Zustand·Redux·XState 등) | Svelte 5 runes(`$state`, `$derived`, `.svelte.ts` 모듈)로 충분 | **REJECT**. 엔진이 이미 순수 `reduce` 상태 기계 |
| Partytown | 서드파티 스크립트를 워커로 옮기는 용도 | **REJECT**(서드파티 스크립트 없음) |
| vite-plugin-pwa / Workbox | 서비스 워커 기반 | **REJECT**. 게스트는 비보안 컨텍스트라 SW 불가. 호스트는 자산이 APK 안에 있어 불필요 |
| WebGPU / WebGL | 보안 컨텍스트 요구(WebGPU) | **REJECT** |
| 사운드: howler.js 2.2.4 | 마지막 배포 2023-09 | **REJECT**. Web Audio API로 직접(효과음 몇 개를 `AudioBuffer`로 디코드, 첫 탭에서 `AudioContext.resume()`으로 iOS 잠금 해제) |
| 웹폰트 | NF-01 외부 요청 금지, 번들 예산 | **REJECT**. 시스템 글꼴 스택(`-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`) |
| SvelteKit 2.70.3 + adapter-static | 라우팅·SSR 프레임워크 | **REJECT**. 화면 수가 적고 SSR이 필요 없다. 해시 기반 단일 페이지 상태 전환이면 충분(plan의 "Vite + Svelte" 유지). 에이전트가 SvelteKit 관례(`+page.svelte`, load 함수)를 끌어들이지 않도록 AGENTS.md에 명시 |

## 8. 도입 결정 제안

### (a) 도입 결정 표
| 항목 | 판정 | 범위 | 한 줄 이유 |
|---|---|---|---|
| Svelte 5 (현 계획) | **ADOPT(유지)** | `packages/web` 전체 | 번들·내장 애니메이션 이점이 크고, Svelte MCP·llms.txt·svelte-check로 LLM 구문 혼동을 기계적으로 잡을 수 있다 |
| React 19 / Preact / Solid / Vue | REJECT | — | "LLM이 React를 더 잘 안다"는 이점보다 번들과 전환 비용, 이 앱의 작은 UI 표면이 우선한다 |
| **TypeScript 7 단독** | **REJECT(현시점)** | — | typescript-eslint(<6.1)·svelte-check(^5‖^6)와 확정적으로 비호환. **TS 6.0.3 기본**, TS 7은 별칭으로 비Svelte 패키지 타입 검사만 |
| Svelte scoped CSS + `tokens.css`(CSS 변수, OKLCH) | **ADOPT** | web 전체 | 의존성 0, LLM 버전 혼동 0, 동적 카드 위치 스타일에 적합 |
| Tailwind v4 | HOLD | (설정·로비가 커지면 TRIAL) | v3 문법 오생성 위험과 작은 UI 표면. 2026-01 회사 축소 리스크 |
| shadcn-svelte / Bits UI | HOLD | 네이티브 `<dialog>` 부족 시 Bits UI 단일 컴포넌트 | 게임 UI는 대부분 맞춤형 |
| daisyUI·Skeleton·Panda·vanilla-extract·Melt·Style Dictionary | REJECT | — | 일반 웹앱 모양, 빌드 단계, 정체, 단일 출력 대상 |
| Storybook 10 | HOLD | — | Svelte용 AI 매니페스트 미지원. `/dev/gallery`로 대체 |
| `/dev/gallery` + 픽스처 | **ADOPT** | web (dev 전용) | Storybook 가치의 80%를 의존성 0으로 얻음. 스냅샷·axe 대상 |
| Stitch / Claude Design 시안 | TRIAL | M3 착수 전 1회 | 디자이너 없이 시각 방향 결정. 코드는 이식만 |
| Figma MCP / Make / v0 / Lovable | REJECT | — | Figma 파일 없음, React 출력 |
| **WAAPI + FLIP 헬퍼** | **ADOPT** | 카드 이동·플립·획득 | 컴포지터 스레드, 0KB, 표준이라 버전 혼동 없음, `finished`로 시퀀싱 |
| Svelte transition/animate | ADOPT | 모달·배너·토스트 | 이미 포함, 단 컨테이너 간 카드 이동에는 쓰지 않음 |
| Motion 미니 `animate()` | TRIAL | FLIP 헬퍼가 복잡해질 때만 | 2.3KB, MIT, 공식 MCP/스킬 |
| GSAP 3 + Flip | HOLD | — | 무료지만 비OSI·Webflow 약관, 메인 스레드 틱, 38KB |
| Pixi·Phaser·Rive·Lottie·Theatre | REJECT | — | 250~500KB 이상 또는 유료 export 또는 정체 |
| ESLint 10 + Prettier 3 (현 계획) | **ADOPT(유지)** | 전체 | .svelte를 완전히 다루는 유일한 조합 |
| 금지 API = 코어 규칙 설정 | **ADOPT** | web | 커스텀 규칙 대신 `no-restricted-properties`/`no-restricted-syntax` |
| Biome 2 / oxlint·oxfmt | HOLD | — | Svelte 지원 실험적, 플러그인이 .svelte에 미적용 |
| npm workspaces (현 계획) + `.npmrc` `min-release-age=3` | **ADOPT(유지+강화)** | 루트 | 공급망 방어를 설정 한 줄로 |
| pnpm 11/12 | HOLD | — | 사실상 표준이지만 이득을 Knip으로 대부분 대체, 12는 1개월 차 Rust 재작성 |
| Turborepo·Nx·moon·tsdown·tsup·Changesets·publint | REJECT | — | 6개 비배포 패키지에 과함 |
| Vitest 브라우저 모드 + vitest-browser-svelte | **ADOPT** | web 컴포넌트 테스트 | FLIP 측정 등 실제 레이아웃이 필요한 테스트 |
| fast-check | **ADOPT** | engine, ai | 불변식 속성 테스트로 에이전트 코드의 숨은 버그 탐지 |
| Knip | **ADOPT** | CI | 에이전트가 남기는 죽은 코드·미선언 의존성 |
| svgo | **ADOPT** | 카드 자산 빌드 | 번들 예산과 Safari 래스터 성능 |
| Zod 4 (`zod/mini`) | TRIAL | protocol | 신뢰할 수 없는 WS 입력 검증 + 타입 단일 근거 |
| chrome-devtools-mcp | **ADOPT(개발 시)** | 로컬 | 에이전트가 성능·콘솔·네트워크를 직접 확인 |
| Playwright MCP | TRIAL | 로컬 탐색 | 토큰 비용, 테스트 대체 아님 |
| Svelte 공식 Claude Code 플러그인(MCP·autofixer·스킬) + llms.txt | **ADOPT(개발 시)** | 로컬 | Svelte 4 문법 오생성 자동 교정 |
| AGENTS.md + CLAUDE.md(`@AGENTS.md`) | **ADOPT** | 루트 | 도구 중립 규범 한 곳 |
| Claude Code 포맷·린트 훅 | ADOPT | 로컬 | 지켜야 할 규칙은 문서가 아닌 훅으로 |
| Playwright 스냅샷(도커 안) + axe | **ADOPT** | E2E | 무료, 결정적 렌더링 |
| Chromatic / Lost Pixel / Argos | REJECT / REJECT / HOLD | — | 유료·Chrome 한정 / 보관됨 / 필요 시 |
| Dependabot(그룹 + 기본 쿨다운) | **ADOPT** | npm, gradle, actions | 무료, 설정 최소 |
| Spec Kit 등 SDD 도구 | REJECT | — | 기존 intend→spec→plan + 벡터와 중복 |
| Android 셸: 직접 작성 Kotlin (현 계획) | **ADOPT(유지)** | android | 필요한 네이티브 3요소는 어느 프레임워크도 제공하지 않음 |
| 브리지 `bridge.ts`를 Capacitor 모양으로 | **ADOPT** | web | 향후 Capacitor 전환 비용 0에 가깝게 |
| Capacitor 8 | HOLD | iOS 네이티브 단계에서 재평가 | iOS SPM·WKWebView·플러그인 관례는 유리 |
| Tauri / Expo·RN / Flutter / CMP | REJECT | — | 빌드 표면 증가, React·UI 재작성 강요 |
| Comlink / 로컬 퍼스트 / 상태 라이브러리 / PWA 플러그인 / Partytown / WebGPU / 웹폰트 / SvelteKit | HOLD / REJECT ×7 | — | 불필요하거나 비보안 컨텍스트에서 불가 |

### (b) 수정 스택 표 (웹·도구 계층만. Android·CI·배포 계층은 tech-stack.md 그대로)
버전은 2026-09-28 npm 레지스트리 `latest`로 확인했다. **굵게** 표시한 행이 변경 또는 추가다.

| 계층 | 선택 (정확한 버전) | 변경 |
|---|---|---|
| Node | 24.21.0 LTS (번들 npm 11.19.0) | 유지 |
| 패키지 관리 | npm workspaces + **`.npmrc`: `min-release-age=3`**, `ignore-scripts=true`(시도) | **강화** |
| 웹 UI | Vite 8.3.1 + Svelte 5.57.1 + `@sveltejs/vite-plugin-svelte` 7.3.1 | 유지 |
| **언어** | **`typescript` 6.0.3** (기본: ESLint·svelte-check·IDE). 선택: `"@typescript/native": "npm:typescript@7.0.2"`로 engine/ai/protocol 고속 `tsc --noEmit` | **변경**(7 → 6 기본) |
| 타입 검사(.svelte) | `svelte-check` 4.7.6 (TS 6) | **명시** |
| 스타일 | Svelte scoped `<style>` + **`src/styles/tokens.css`**(CSS 변수, OKLCH, `--dur-*`는 spec 6.4 예산) | **추가(관례)** |
| 애니메이션 | **WAAPI + 자체 FLIP 헬퍼**(`src/anim/`) + Svelte transition(비카드 UI). TRIAL: `motion` 13.4.4(미니 `animate`만) | **구체화** |
| 카드 자산 | SVG → **svgo 4.1.0** 최적화 → `<img>` 렌더(인라인 SVG 금지, filter 제거) | **추가** |
| 린트 | ESLint 10.11.0 + `eslint-plugin-svelte` 3.23.0 + `typescript-eslint` 8.70.1. 금지 API는 **코어 `no-restricted-properties`/`no-restricted-syntax`** | 버전 명시, 커스텀 규칙 → 설정 |
| 포맷 | Prettier 3.9.9 + `prettier-plugin-svelte` 4.1.1 | 버전 명시 |
| 단위 테스트 | Vitest 5.0.2 + **fast-check 4.10.2**(engine/ai) | **추가** |
| 컴포넌트 테스트 | **`@vitest/browser-playwright` 5.0.2 + `vitest-browser-svelte` 3.1.0** (Chromium+WebKit) | **추가** |
| E2E | `@playwright/test` 1.63.0 + **`@axe-core/playwright` 4.13.0** + `toHaveScreenshot`(도커 안에서만) | **추가** |
| UI 계약 | **`/dev/gallery` 라우트 + `fixtures/*.json`** | **추가(관례)** |
| 프로토콜 검증 | TRIAL: `zod` 4.6.5 (`zod/mini`) | **추가(시험)** |
| 위생 | **`knip` 6.38.0**, 번들 예산·외부 URL 검사 스크립트(의존성 0) | **추가** |
| QR | `uqr` 0.1.3 | 유지 |
| 의존성 업데이트 | **Dependabot**(npm·gradle·github-actions, devDeps 그룹, 기본 쿨다운) | **추가** |
| 에이전트 도구(로컬, 비의존성) | **AGENTS.md + CLAUDE.md(`@AGENTS.md`)**, Context7, **`@sveltejs/mcp` 0.1.26**, **`chrome-devtools-mcp` 1.10.1**, (TRIAL) `@playwright/mcp` 0.0.82, PostToolUse 포맷 훅 | **추가** |
| Android 셸 | 직접 작성 Kotlin + WebView + Ktor (tech-stack.md 그대로). 웹 쪽 **`bridge.ts`는 Capacitor 플러그인 모양** | 유지 + 설계 지침 |

### (c) 속도와 품질

**원리**: 에이전트가 빠르고 정확해지려면 두 가지가 필요하다. (1) 틀렸을 때 **즉시 기계적으로 알려 주는 신호**, (2) 참조할 **단일한 최신 근거**. 프레임워크를 "LLM이 더 잘 아는 것"으로 바꾸는 것보다 이 두 가지를 갖추는 편이 이득이 크고 비용이 작다.

#### 빨라지는 지점
1. **첫 시도 정확도가 올라간다**:
   - Svelte MCP의 autofixer와 llms.txt가 Svelte 4 문법(`export let`, `$:`, `on:click`, 스토어 남용)을 생성 직후 교정한다.
   - AGENTS.md의 "금지 목록 + 버전 표"가 Tailwind v3·SvelteKit 관례·React 패턴의 혼입을 막는다.
   - 결과적으로 사람이 "이거 옛날 문법이야"라고 지적하는 왕복이 사라진다.
2. **TS 6 고정으로 첫날 막힘을 제거한다**: TS 7로 시작했다면 `npm ci`의 peer 충돌과 svelte-check 크래시로 골격 단계부터 에이전트가 우회책을 찾아 헤맸을 것이다. 이는 이미 발현된 리스크 R9이며, 설정 한 줄로 없앤다.
3. **피드백 루프가 짧아진다**:
   - 저장할 때마다 PostToolUse 훅이 포맷과 린트를 돌린다.
   - Vitest 브라우저 모드로 컴포넌트를 실제 WebKit에서 수 초 안에 검증한다.
   - chrome-devtools-mcp로 에이전트가 성능 트레이스와 콘솔을 직접 본다.
   - 사람이 폰을 들고 확인해야 하는 항목이 "실기기 전용"(핫스팟, 실제 Safari 감각)으로 줄어든다.
4. **애니메이션을 라이브러리 없이 한 헬퍼로 만든다**: 에이전트가 GSAP·Motion 버전별 API를 조회할 필요 없이, 30줄 FLIP 헬퍼와 `--dur-*` 토큰만 알면 모든 카드 연출을 작성한다. 속도 설정(×1.5/×0.6)과 E2E 즉시 모드(×0)도 같은 배율 하나로 처리된다.
5. **빼는 것이 속도다**: Storybook, Tailwind, Turborepo, tsdown, Changesets, Capacitor, Biome 전환을 하지 않으면 의존성 업그레이드와 설정 디버깅에 쓰는 세션이 통째로 사라진다.

#### 품질이 올라가는 지점
1. **엔진 정확성**: JSON 벡터(알려진 사례)와 fast-check 속성 테스트(카드 보존, 결정론, 합법 수만 적용)의 이중망을 둔다. 에이전트가 규칙 코드를 고쳐도 불변식이 깨지면 즉시 실패한다.
2. **UI 회귀**: `/dev/gallery`의 고정 픽스처를 Playwright 스냅샷(Chromium+WebKit, 도커 안)과 axe로 검사한다. 에이전트가 CSS를 바꿔 다른 화면을 망가뜨리면 PR에서 잡힌다.
3. **성능 예산 자동화**: E2E에서 탭→턴 종료 ≤ 700ms를 측정하고, 빌드에서 dist ≤ 1.5MB와 외부 URL 0건을 검사한다. spec NF-03과 R5c를 사람의 주의력이 아닌 CI가 지킨다.
4. **비보안 컨텍스트 금지 API**: 코어 ESLint 규칙이라 .svelte 템플릿·스크립트 모두에서 확실히 동작하고, 에이전트가 규칙 코드를 유지보수할 필요가 없다.
5. **공급망**: `min-release-age=3`과 Dependabot 기본 쿨다운으로, 에이전트가 무심코 방금 배포된 악성 버전을 설치하는 경로를 막는다.
6. **위생**: Knip이 에이전트가 남기는 미사용 export·파일·의존성을 매 PR마다 드러낸다.

#### 바꾸지 말 것
- **Svelte 5 → React로 바꾸지 않는다.** LLM의 React 숙련도 이점은 실재하지만, 이 앱은 화면 수가 적고 애니메이션·번들이 핵심이다. Svelte의 약점(구문 혼동)은 MCP와 svelte-check로 기계적으로 막을 수 있다.
- **직접 작성 Kotlin 셸을 Capacitor·Tauri·RN·Flutter로 바꾸지 않는다.** Ktor·LOHS·FGS는 어차피 직접 써야 한다.
- **ESLint + Prettier를 Biome·oxc로 바꾸지 않는다**(.svelte 지원이 실험적).
- **npm workspaces를 pnpm·Turborepo로 바꾸지 않는다**(설정 강화로 충분).
- **Canvas 엔진(Pixi·Phaser)을 도입하지 않는다.**
- **Storybook과 스펙 주도 도구를 도입하지 않는다**(기존 문서 체계와 갤러리 라우트로 충분).
- **plan.md 원칙 0장(공식 문서 우선, 저명 패키지, 도커 전용, 결정론, 규칙 단일 근거)은 그대로 유지한다.** 이 문서의 모든 권고는 그 원칙을 강화하는 방향이다.
