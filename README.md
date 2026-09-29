# p2p-gostop (맞고 P2P, 가칭)

인터넷 없이 두 사람이 얼굴을 마주하고 치는 **2인 맞고** 앱이다. Android 폰이 핫스팟과 게임 서버를 겸하고(호스트), iPhone은 그 핫스팟에 붙어 Safari로 참가한다(게스트). 혼자 CPU와 연습하는 모드도 있다. 가상 머니만 쓴다.

- 왜: [`intend.md`](intend.md) · 무엇을: [`spec.md`](spec.md) · 어떻게: [`plan.md`](plan.md) · 작업 규범: [`AGENTS.md`](AGENTS.md)
- 규칙의 단일 근거: [`docs/research/rules-commercial.md`](docs/research/rules-commercial.md) 12장

## 구조

```
packages/
  engine/     규칙 엔진 (순수 TS, 카드 카탈로그·시드 PRNG·규칙 옵션·reduce·정산)
  ai/         CPU 상대 (engine에만 의존)
  protocol/   호스트↔게스트 메시지 타입·버전 (spec 5장)
  relay-dev/  개발·E2E용 Node WebSocket 중계 서버 (Android 중계와 같은 규칙)
  web/        Vite + Svelte 5 웹 앱 (호스트·게스트·솔로 화면)
tools/
  sim/        셀프플레이 시뮬레이션 CLI
android/      Android 셸 (Kotlin + WebView + Ktor)
docker/       개발 컨테이너 정의 (compose.yml)
docs/         조사 문서, 실기기 테스트 절차·기록
```

의존 방향: `engine ← ai ← web`, `engine ← protocol ← web`, `protocol ← relay-dev`. Android 앱은 TS 패키지에 의존하지 않고 `packages/web/dist`만 앱 자산으로 복사한다.

## 개발 환경

호스트(WSL)에는 **git, gh, docker CLI만** 있으면 된다. Node·Playwright·Android SDK는 모두 Docker 컨테이너 안에서 돈다. 진입점은 `./dev.sh`다.

```sh
./dev.sh pull          # 이미지 받기 (node, playwright, android)
./dev.sh install       # npm ci (node_modules는 Docker 볼륨)
./dev.sh lint          # oxlint + oxfmt(순수 TS) / ESLint + Prettier(web)
./dev.sh check         # tsc 7(순수 TS) / svelte-check + tsc 6(web) / knip
./dev.sh test          # 단위·속성·계약 테스트 (Vitest, Node)
./dev.sh test:browser  # 웹 컴포넌트 테스트 (Vitest 브라우저 모드, Chromium + WebKit)
./dev.sh build:web     # 웹 빌드 + 번들 예산(≤1.5MB)·외부 URL 0건 검사
./dev.sh e2e           # Playwright E2E (Chromium + WebKit)
./dev.sh dev:web       # Vite 개발 서버 http://localhost:5173 (#/dev/gallery 는 개발 갤러리)
./dev.sh relay         # 개발 중계 서버 ws://localhost:17777/ws?role=host|guest
./dev.sh sim -- 42     # 시드 42로 분배 미리보기 (M2에서 셀프플레이로 확장)
./dev.sh npm <args>    # 컨테이너 안에서 npm (의존성 추가 등)
./dev.sh apk:debug     # Android 디버그 APK
./dev.sh               # 전체 작업 목록
```

- Docker Desktop이 꺼져 있으면 `dev.sh`가 안내하고 끝난다.
- 컨테이너는 uid 1000으로 돌아 소스 트리의 파일 소유자가 바뀌지 않는다. `node_modules`는 명명된 볼륨이라 처음엔 root 소유인데, `./dev.sh install`이 매번 소유자를 맞춘다.
- `.npmrc`의 `min-release-age=3`은 게시 3일이 안 된 버전을 설치하지 않는다(공급망 방어). `ignore-scripts=true`로 설치 스크립트도 막는다.

## 툴체인 (plan.md 1.8)

| 대상 | 린트 | 포맷 | 타입 검사 |
|---|---|---|---|
| 순수 TS (engine·ai·protocol·relay-dev·sim) | oxlint (`--type-aware`) | oxfmt | TypeScript 7 (tsgo) |
| `packages/web` | ESLint 10 + eslint-plugin-svelte + typescript-eslint | Prettier + prettier-plugin-svelte | svelte-check + TypeScript 6 |

- `.svelte` 템플릿은 Oxc가 아직 지원하지 않고, svelte-check·typescript-eslint는 TS 7을 지원하지 않아 web만 기존 도구를 쓴다.
- 비보안 컨텍스트(게스트의 `http://192.168.x.y`)에서 쓸 수 없는 API(`navigator.share`, `crypto.subtle` 등)는 web ESLint 규칙이 막는다. 엔진·AI의 `Math.random`·타이머는 oxlint가 막는다.

## 테스트

- **엔진**: 카드 카탈로그 불변식, xoshiro128** PRNG 결정성, fast-check 속성 테스트(셔플은 순열). JSON 규칙 벡터(`packages/engine/test/vectors/`)로 사건·정산을 검증한다.
- **웹 컴포넌트**: Vitest 브라우저 모드 + `vitest-browser-svelte`. Playwright 이미지 안에서 Chromium·WebKit으로 돈다.
- **E2E**: `vite preview`로 빌드 산출물을 띄우고 Playwright로 확인한다. 외부 네트워크 요청이 하나라도 나가면 실패한다.
- CI(`.github/workflows/ci.yml`): push·PR마다 lint·check·test·build. E2E는 PR과 수동 실행에서만(분량 절약). Android 잡은 `android/settings.gradle.kts`가 있을 때만 빌드한다.

## 에이전트 도구

- 규범은 `AGENTS.md` 하나이고 `CLAUDE.md`는 이를 참조한다.
- Svelte 공식 MCP 서버 `@sveltejs/mcp`는 **무료 오픈소스**이며, 프로젝트 `.mcp.json`에 **로컬 stdio**(`npx -y @sveltejs/mcp@0.1.26`)로 등록해 쓴다. 원격 호스팅 엔드포인트는 쓰지 않는다.

## 라이선스

코드는 MIT. 카드 이미지는 Wikimedia Commons 화투 SVG(CC BY-SA 4.0, 저작자 Spenĉjo, Marcus Richert, Louie Mantia Jr.)를 번들하며 앱의 설정 > 라이선스에 표기한다. 배포 의존성 고지 완성은 #74에서 추적한다.

## 문서 지도

- [의도](intend.md) → [명세](spec.md) → [구현 계획](plan.md): 목표·요구사항·현재 마일스톤과 결정.
- [작업 규범](AGENTS.md): 작업 제약과 버전 표의 정본.
- [Galaxy·솔로 계획](https://github.com/kywoo26/p2p-gostop/pull/76): 현재 증분·PR 소유권·완료 조건(미병합 PR #76의 docs/plan-galaxy-solo.md).
- [UI 규범·구현 지도](docs/design/ui-spec.md): UX-01~25, 화면·상태·이벤트·현재 격차; 구 docs/ui.md를 대체.
- [프로토콜](docs/protocol.md): 메시지·전송·세션 계약.
- [규칙 벡터](docs/rules-vectors.md): 규칙 ID와 테스트의 대응.
- [AI 튜닝](docs/ai-tuning.md): 강도·응답 벤치마크와 미달 근거.
- [머니 모델](docs/money-model.md): 표준 3,000판 산정·프리셋 미완 상태.
- [실기기 절차](docs/device-test/procedure.md) / [결과 로그](docs/device-test/results.md): M0·MVP·M4·U1·UI 절차 통합, 사용자 결과 원문 보존.
- [상용 규칙 조사](docs/research/rules-commercial.md): §12가 게임 규칙의 유일한 규범.
- [코드·자산 조사](docs/research/code-refs.md): 설계 비교와 라이선스 근거.
- [플랫폼 조사](docs/research/tech-stack.md) / [도구 비교](docs/research/agent-era-stack.md): 제약·호환성·선택 근거, 설치 버전은 AGENTS.md.
- [M0 리뷰](docs/reviews/M0-review.md): 초기 Android·배포·스모크 검토 이력.
- [M1 리뷰](docs/reviews/M1-review.md): 엔진 규칙·보안·벡터 검토 이력.
- [M3 리뷰](docs/reviews/M3-review.md): 솔로 표시·프롬프트·UX 사후 검토 이력.
- [M4 프로토콜 리뷰](docs/reviews/M4-protocol-review.md): 공정성·재접속·전송·복원 검토 이력.
- [하네스 감사](docs/reviews/harness-audit.md): 에이전트 설정·훅·권한 정리 이력.
- [MVP 감사](docs/reviews/mvp-rush-audit.md): 알파 출시 당시 생략·결함 기록. 리뷰의 구경로·행 번호는 당시 커밋을 가리킨다.
