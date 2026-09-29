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
  setup-host.sh  호스트 툴체인 1회 설치 (Node·apt·브라우저·Android SDK)
android/      Android 셸 (Kotlin + WebView + Ktor)
docs/         조사 문서, 실기기 테스트 절차·기록
```

의존 방향: `engine ← ai ← web`, `engine ← protocol ← web`, `protocol ← relay-dev`. Android 앱은 TS 패키지에 의존하지 않고 `packages/web/dist`만 앱 자산으로 복사한다.

## 개발 환경

빌드·테스트는 호스트(WSL2 Ubuntu 24.04)에서 네이티브로 실행한다. CI도 같은 명령을 `ubuntu-24.04` 러너에서 네이티브로 돈다. 둘의 동일성은 버전 핀(`.nvmrc`, `package-lock.json`, Gradle 설정, JDK 21)으로 맞춘다. 규범은 [AGENTS.md §5](AGENTS.md).

```sh
tools/setup-host.sh                  # 처음 한 번: Node(.nvmrc), apt(Playwright 의존성·JDK 21·자산 변환 도구, sudo), 브라우저, Android SDK
nvm use                              # 셸마다
npm ci                               # 처음, 그리고 lock이 바뀐 뒤
npm run lint                         # oxlint + oxfmt(순수 TS) / ESLint + Prettier(web)
npm run check                        # tsc 7(순수 TS) / svelte-check + tsc 6(web) / knip
npm test                             # 단위·속성·계약 테스트 (Vitest, Node)
npm run test:browser                 # 웹 컴포넌트 테스트 (Vitest 브라우저 모드, Chromium + WebKit)
npm run build -w packages/web        # 웹 빌드 + 번들 예산(≤1.5MB)·외부 URL 0건 검사
npm run e2e -w packages/web          # Playwright E2E (Chromium + WebKit)
android/gradlew -p android assembleDebug testDebugUnitTest lint   # APK·단위 테스트·Lint
npm run verify                       # 위 검증 전부 차례로
npm run dev -w packages/web          # Vite http://localhost:5173 (#/dev/gallery)
npm run start -w packages/relay-dev  # 중계 ws://localhost:17777/ws?role=host|guest
npm run sim -- 42 --workers 4        # 셀프플레이 시뮬레이션 CLI (공유 머신이면 워커 상한)
```

- `tools/setup-host.sh`는 여러 번 실행해도 되고 설치하는 것을 단계별로 출력한다. sudo 암호와 Android SDK 라이선스 동의는 터미널에서 직접 실행할 때만 묻는다.
- OSS 고지 갱신은 `npm run oss:refresh -w packages/web`로 수동 실행해 생성물 2개를 커밋한다. 웹 빌드는 npm 고지만 대조하고 Android 빌드는 Gradle 런타임 의존성을 대조한다.
- `.npmrc`의 `min-release-age=3`은 게시 3일이 안 된 버전을 설치하지 않는다(공급망 방어). `ignore-scripts=true`로 설치 스크립트도 막는다.
- **개발 이미지 삭제 뒤 정리**(2026-09-30, 선택): 옛 이미지·볼륨은 `docker image rm p2p-gostop-dev:1 p2p-gostop-dev:2 p2p-gostop-dev:3 p2p-gostop-dev:4`, `docker volume rm p2p-gostop-gradle p2p-gostop-npm p2p-gostop-android`로 지운다. 옛 컨테이너가 남긴 root 소유 `node_modules`가 있으면(`ls -ld node_modules`) `sudo chown -R "$USER" node_modules` 뒤 `npm ci`.

## 툴체인 (plan.md 1.8)

| 대상 | 린트 | 포맷 | 타입 검사 |
|---|---|---|---|
| 순수 TS (engine·ai·protocol·relay-dev·sim) | oxlint (`--type-aware`) | oxfmt | TypeScript 7 (tsgo) |
| `packages/web` | ESLint 10 + eslint-plugin-svelte + typescript-eslint | Prettier + prettier-plugin-svelte | svelte-check + TypeScript 6 |

- `.svelte` 템플릿은 Oxc가 아직 지원하지 않고, svelte-check·typescript-eslint는 TS 7을 지원하지 않아 web만 기존 도구를 쓴다.
- 비보안 컨텍스트(게스트의 `http://192.168.x.y`)에서 쓸 수 없는 API(`navigator.share`, `crypto.subtle` 등)는 web ESLint 규칙이 막는다. 엔진·AI의 `Math.random`·타이머는 oxlint가 막는다.

## 테스트

- **엔진**: 카드 카탈로그 불변식, xoshiro128** PRNG 결정성, fast-check 속성 테스트(셔플은 순열). JSON 규칙 벡터(`packages/engine/test/vectors/`)로 사건·정산을 검증한다.
- **웹 컴포넌트**: Vitest 브라우저 모드 + `vitest-browser-svelte`. Playwright Chromium·WebKit으로 돈다.
- **E2E**: `vite preview`로 빌드 산출물을 띄우고 Playwright로 확인한다. 외부 네트워크 요청이 하나라도 나가면 실패한다.
- CI(`.github/workflows/ci.yml`): `ubuntu-24.04` 러너에서 네이티브로 push·PR마다 lint·check·test·build·Android. 컴포넌트 테스트·E2E는 PR과 수동 실행에서만(분량 절약).

## 에이전트 도구

- 규범은 `AGENTS.md` 하나이고 `CLAUDE.md`는 이를 참조한다.
- Svelte 공식 MCP 서버 `@sveltejs/mcp`는 **무료 오픈소스**이며, 프로젝트 `.mcp.json`에 **로컬 stdio**(`npx -y @sveltejs/mcp@0.1.26`)로 등록해 쓴다. 원격 호스팅 엔드포인트는 쓰지 않는다.

## 문서 지도

- [의도](intend.md) → [명세](spec.md) → [구현 계획](plan.md): 목표·요구사항·현재 마일스톤과 결정.
- [작업 규범](AGENTS.md): 작업 제약과 버전 표의 정본.
- [Galaxy·솔로 계획](plan.md#현재-트랙): 현재 증분·PR 소유권·완료 조건.
- [UI 규범·구현 지도](docs/design/ui-spec.md): UX-01~25, 화면·상태·이벤트·현재 격차; 구 docs/ui.md를 대체.
- [프로토콜](docs/protocol.md): 메시지·전송·세션 계약.
- [규칙 벡터](docs/rules-vectors.md): 규칙 ID와 테스트의 대응.
- [AI 튜닝](docs/ai-tuning.md): 강도·응답 벤치마크와 미달 근거.
- [머니 모델](docs/money-model.md): 표준 3,000판 산정·프리셋 미완 상태.
- [실기기 절차](docs/device-test/procedure.md) / [결과 로그](docs/device-test/results.md): M0·MVP·M4·U1·UI 절차 통합, 사용자 결과 원문 보존.
- [상용 규칙 조사](docs/research/rules-commercial.md): §12가 게임 규칙의 유일한 규범.
- [코드·자산 조사](docs/research/code-refs.md): 설계 비교와 라이선스 근거.
- [플랫폼 조사](docs/research/tech-stack.md) / [도구 비교](docs/research/agent-era-stack.md): 제약·호환성·선택 근거, 설치 버전은 AGENTS.md.
- [완료된 리뷰 인덱스](docs/reviews/README.md): M0·M1·M3·M4·MVP·하네스 감사의 PR/커밋과 남은 이슈.

## 라이선스

코드는 MIT 라이선스입니다.
서드파티 자산과 폰트는 각 고지(`packages/web/assets-src/*/License*`, `packages/web/src/pro-assets/credits.ts`, Pretendard OFL)를 따릅니다.
