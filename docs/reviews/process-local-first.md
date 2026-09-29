# 로컬 우선 툴체인 전환 (NF-09, plan §2)

2026-09-30. 지시: 컨테이너는 목적이 있을 때만 쓰고, 로컬 표준 스택으로 되는 것은 로컬을 표준으로 한다. 규범 문구는 [AGENTS.md §1·§5](../../AGENTS.md)가 정본이고, 이 문서는 판정 근거만 남긴다.

## 감사: 명령별 컨테이너 목적

호스트: WSL2 Ubuntu 24.04, nvm Node 24.21.0/npm 11.19.0, sudo 없음(에이전트).

| 명령 | 컨테이너 목적 | 호스트 실측 | 판정 |
|---|---|---|---|
| `npm ci`·`lint`·`check`·`test`·`build` | 없음(Node 도구, `.nvmrc`·engines로 고정) | 모두 통과, `npm ci` 4 s, `build` 1.5 s | 로컬 |
| `test:browser`(Chromium) | 없음. 브라우저는 `npx playwright install`이 `~/.cache/ms-playwright`에 받는다(sudo 불필요) | 35 files / 239 tests 통과, 6 s | 로컬 |
| `test:browser`·`e2e`(WebKit) | 시스템 라이브러리. WebKit은 GStreamer·GTK4·flite 등 apt 196개가 필요하고 `install-deps`는 sudo가 필요하다([Playwright browsers](https://playwright.dev/docs/browsers#install-system-dependencies)) | deps 없이 `browserType.launch` 실패 | 사람이 `sudo`로 1회 설치하면 로컬, 그 전에는 이미지 |
| `e2e` 스크린샷 비교 | 렌더링 동일성. "기준 이미지를 만든 환경에서 실행해야 한다"([Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)). 기준은 이미지(글꼴 50종)에서 만들었다 | 호스트 Chromium에서 15건 불일치(543~61,224 px, 높이 2346→2339 1건) | 이미지(`@visual`) |
| `e2e` 그 밖 | 없음 | Chromium 124건 통과(스크린샷·WebKit 제외) | 로컬(스냅샷 무시) |
| `sim`·relay-dev·Vite dev | 없음 | — | 로컬 |
| 자산 변환(Pillow·FFmpeg·libavif) | 출력 재현성(apt 버전 고정). 호스트에 없음, 설치에 sudo | — | 이미지 |
| Android `gradlew` | Android SDK(이미지 315 MB) + Temurin 21. 호스트 JDK는 Ubuntu OpenJDK 21 | SDK 없음 | 이미지(사용자 결정 2) |
| CI | 로컬·CI 동일성 | — | 이미지 |

## 결정

- 스크린샷 비교는 이미지 전용이다. `compose.yaml`이 `P2P_GOSTOP_DEV_IMAGE=1`을 주고, `playwright.config.ts`는 그 값이 없으면 `ignoreSnapshots`로 비교(와 `--update-snapshots`)를 건너뛴다. 스크린샷 테스트는 `@visual` 태그로 이미지에서 따로 돈다(`npm run e2e:visual`).
- 진입점: 호스트 `npm run verify`(lint·check·test·build·test:browser·e2e), 이미지가 필요한 것만 `npm run verify:image`(`@visual`·Android). 처음 한 번 `tools/host/setup.sh`.
- 공유 머신 부하: 로컬 E2E 워커 4(설정 기본값), `sim`은 `--workers 4`, `@timing`은 기존대로 직렬.
- 로컬·CI 동일성: CI는 같은 이미지로 전 명령을 돈다. PR 본문에 호스트 `verify`와 CI 결과 수치를 함께 적어 차이를 드러낸다.

## 사용자 결정 항목

1. **호스트 WebKit 의존성**(추천: 설치). 사람이 Playwright 공식 명령 `npx playwright install --with-deps chromium webkit`을 1회 실행한다(apt 196개, root가 아니면 Playwright가 sudo를 요청). 설치 전에는 WebKit이 필요한 `test:browser`·`e2e`를 이미지에서 돌린다.
2. **Android SDK 로컬화**(추천: 이미지 유지). sudo 없이 cmdline-tools를 `~/Android/Sdk`에 풀 수 있지만([sdkmanager](https://developer.android.com/tools/sdkmanager)) Android 작업 빈도가 낮고, 호스트 JDK가 버전 표의 Temurin과 달라 불일치 지점이 늘어난다.
