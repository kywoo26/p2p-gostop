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
docker/       개발 이미지 정의 (Dockerfile; compose.yaml은 저장소 루트, .devcontainer/는 VS Code용)
docs/         조사 문서, 실기기 테스트 절차·기록
```

의존 방향: `engine ← ai ← web`, `engine ← protocol ← web`, `protocol ← relay-dev`. Android 앱은 TS 패키지에 의존하지 않고 `packages/web/dist`만 앱 자산으로 복사한다.

## 개발 환경

호스트(WSL)에는 **git, gh, docker CLI만** 있으면 된다. Node·Playwright 브라우저·JDK·Android SDK는 모두 개발 이미지 하나(`docker/Dockerfile`) 안에 있고, 저장소 루트의 `compose.yaml`이 그 이미지를 `dev` 서비스로 띄운다. 별도 래퍼 스크립트는 없다. 표준 `docker compose` 명령을 그대로 쓴다.

```sh
docker compose run --rm dev npm ci                  # 처음 한 번(이미지가 없으면 자동 빌드), lock이 바뀐 뒤
docker compose run --rm dev npm run lint            # oxlint + oxfmt(순수 TS) / ESLint + Prettier(web)
docker compose run --rm dev npm run check           # tsc 7(순수 TS) / svelte-check + tsc 6(web) / knip
docker compose run --rm dev npm test                # 단위·속성·계약 테스트 (Vitest, Node)
docker compose run --rm dev npm run test:browser    # 웹 컴포넌트 테스트 (Vitest 브라우저 모드, Chromium + WebKit)
docker compose run --rm dev npm run build -w packages/web   # 웹 빌드 + 번들 예산(≤1.5MB)·외부 URL 0건 검사
docker compose run --rm dev npm run e2e -w packages/web     # Playwright E2E (Chromium + WebKit)
docker compose run --rm dev android/gradlew -p android assembleDebug testDebugUnitTest lint   # APK·단위 테스트·Lint
docker compose run --rm -p 5173:5173 dev npm run dev -w packages/web          # Vite http://localhost:5173 (#/dev/gallery)
docker compose run --rm -p 17777:17777 dev npm run start -w packages/relay-dev  # 중계 ws://localhost:17777/ws?role=host|guest
docker compose run --rm dev npm run sim -- 42       # 셀프플레이 시뮬레이션 CLI
docker compose run --rm dev bash                    # 컨테이너 셸
```

- OSS 고지 갱신은 개발 이미지에서 `docker compose run --rm dev npm run oss:refresh -w packages/web`로 수동 실행해 생성물 2개를 커밋한다. 웹 빌드는 npm 고지만 대조하고 Android 빌드는 Gradle 런타임 의존성을 대조한다.

- **Dev Container**: VS Code "Reopen in Container"(또는 Codespaces, devcontainer CLI)는 `.devcontainer/devcontainer.json`으로 같은 `dev` 서비스에 붙는다. Claude Code 공식 feature를 설치하고 컨테이너별 `/home/dev/.claude` 볼륨에 설정을 보존한다. 그 안에서는 앞의 `docker compose run --rm dev` 없이 `npm test`, `android/gradlew -p android assembleDebug`처럼 그대로 실행한다.
- 이전 이미지에서 이미 생성된 Claude 설정 볼륨은 root 소유일 수 있다. Dev Container를 닫고 `docker volume ls --format '{{.Name}}'`에서 `p2p-gostop-claude-`로 시작하는 해당 컨테이너의 볼륨명을 확인한 뒤 `docker compose run --rm --user root -v <볼륨명>:/home/dev/.claude dev chown -R 1000:1000 /home/dev/.claude`로 복구하고 다시 연다. 새 이미지에서 처음 만든 볼륨은 dev 소유로 초기화된다.
- 컨테이너는 uid 1000(`dev`)으로 돌아 소스 트리의 파일 소유자가 바뀌지 않는다. `node_modules`는 소스와 함께 바인드 마운트되어 체크아웃(워크트리)마다 따로 있다. Gradle·npm 캐시와 디버그 서명 키(`~/.android`)는 이름이 고정된 볼륨(`p2p-gostop-gradle`, `p2p-gostop-npm`, `p2p-gostop-android`)이라 모든 체크아웃이 공유한다.
- 워크트리마다 Compose 프로젝트(=폴더 이름)가 달라 컨테이너가 자연히 분리된다. 망은 기본 `bridge`를 써서 워크트리가 늘어도 Docker 망이 쌓이지 않는다.
- `docker/Dockerfile`을 바꾸면 `compose.yaml`의 `image: p2p-gostop-dev:<n>` 태그를 올린다. 없는 태그면 다음 `run`이 자동으로 빌드한다(오프라인에서도 기존 이미지로 계속 작업할 수 있게 매번 빌드하지 않는다).
- CI(`ci.yml`)는 같은 이미지를 러너에서 빌드해 위와 같은 명령을 돌린다.
- `.npmrc`의 `min-release-age=3`은 게시 3일이 안 된 버전을 설치하지 않는다(공급망 방어). `ignore-scripts=true`로 설치 스크립트도 막는다.
- **기존 체크아웃 전환**: 옛 개발 컨테이너를 내린 뒤 확인한다. 옛 명명 볼륨이 붙었던 자리의 `node_modules` 디렉터리가 호스트에 root 소유로 남을 수 있다. 먼저 `ls -ld node_modules`로 확인한다. 비어 있으면 `rmdir node_modules`(비어 있지 않으면 실패하므로 내용을 지우지 않음) 후 `docker compose run --rm dev npm ci`를 실행한다. 내용이 있으면 `docker compose run --rm --user root dev chown -R 1000:1000 /work/node_modules`로 해당 디렉터리의 소유권만 복구한 뒤 `npm ci`를 다시 실행한다. 새 이미지의 진입점은 쓰기 불가 디렉터리를 감지해 이 절차를 안내한다.
- 옛 Compose 볼륨(`*_node_modules`, `*_android-home`)은 위 호스트 디렉터리와 별개다. 필요 없으면 옛 컨테이너를 내리고 `docker volume ls --format '{{.Name}}'`로 이름을 확인한 뒤 `docker volume rm <확인한_옛_볼륨_이름>`으로 개별 삭제한다. 새 공용 볼륨(`p2p-gostop-gradle`, `p2p-gostop-npm`, `p2p-gostop-android`)은 이 정리 대상이 아니다.

## 툴체인 (plan.md 1.8)

| 대상 | 린트 | 포맷 | 타입 검사 |
|---|---|---|---|
| 순수 TS (engine·ai·protocol·relay-dev·sim) | oxlint (`--type-aware`) | oxfmt | TypeScript 7 (tsgo) |
| `packages/web` | ESLint 10 + eslint-plugin-svelte + typescript-eslint | Prettier + prettier-plugin-svelte | svelte-check + TypeScript 6 |

- `.svelte` 템플릿은 Oxc가 아직 지원하지 않고, svelte-check·typescript-eslint는 TS 7을 지원하지 않아 web만 기존 도구를 쓴다.
- 비보안 컨텍스트(게스트의 `http://192.168.x.y`)에서 쓸 수 없는 API(`navigator.share`, `crypto.subtle` 등)는 web ESLint 규칙이 막는다. 엔진·AI의 `Math.random`·타이머는 oxlint가 막는다.

## 테스트

- **엔진**: 카드 카탈로그 불변식, xoshiro128** PRNG 결정성, fast-check 속성 테스트(셔플은 순열). JSON 규칙 벡터(`packages/engine/test/vectors/`)로 사건·정산을 검증한다.
- **웹 컴포넌트**: Vitest 브라우저 모드 + `vitest-browser-svelte`. 개발 이미지 안에서 Chromium·WebKit으로 돈다.
- **E2E**: `vite preview`로 빌드 산출물을 띄우고 Playwright로 확인한다. 외부 네트워크 요청이 하나라도 나가면 실패한다.
- CI(`.github/workflows/ci.yml`): 개발 이미지 하나로 push·PR마다 lint·check·test·build·Android. 컴포넌트 테스트·E2E는 PR과 수동 실행에서만(분량 절약).

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
