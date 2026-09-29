# 개발 컨테이너 삭제, 네이티브·버전 핀 전환 (NF-09, plan §2)

2026-09-30. 사용자 지시: 컨테이너는 목적이 있을 때만 쓰고, 두 체계를 남기지 않는다. 규범 문구의 정본은 [AGENTS.md §1·§2·§5](../../AGENTS.md)이고, 이 문서는 판정 근거만 남긴다.

## 감사: 컨테이너가 필요했던 이유와 네이티브 대체

| 이유 | 네이티브 대체(공식 근거) | 호스트 확인 (WSL2 Ubuntu 24.04) |
|---|---|---|
| Node 버전 고정 | `.nvmrc`=24.21.0, 호스트 nvm·CI `actions/setup-node` `node-version-file` | npm ci 4 s, lint·check·test(534)·build 1.5 s 통과 |
| Chromium·WebKit 바이너리 | package-lock의 Playwright 1.63.0이 빌드를 고정, `npx playwright install` ([browsers](https://playwright.dev/docs/browsers)) | Chromium 컴포넌트 239건 통과 |
| WebKit 시스템 라이브러리 | `npx playwright install-deps`(root가 아니면 sudo 요청) / CI `install --with-deps` ([CI](https://playwright.dev/docs/ci)) | apt 199개 부족, sudo 필요 |
| 스크린샷 렌더링 동일성 | "기준을 만든 환경에서 실행" ([visual comparisons](https://playwright.dev/docs/test-snapshots)) → 기준 환경 = Ubuntu 24.04 + install-deps(호스트·CI 공통) | deps 없는 호스트에서 15건 불일치(글꼴 fallback 포함) |
| Android SDK | cmdline-tools 23.0(SHA-256 고정) + `platforms;android-36`·`build-tools;36.0.0` ([sdkmanager](https://developer.android.com/tools/sdkmanager)); CI는 러너 내장 SDK(같은 패키지, [runner-images Ubuntu 24.04](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)) | cmdline-tools 174 MB·9 s, 패키지 약 315 MB. 라이선스 동의 필요 |
| JDK 21 | CI `actions/setup-java` Temurin 21, 호스트 apt `openjdk-21-jdk-headless`(21.0.12.1) | 호스트는 JRE만 있어 `javac` 없음 |
| 자산 변환 도구 | apt 후보 버전이 기존 고정값과 같다: python3-pil 10.2.0-1ubuntu1.3, ffmpeg 7:6.1.1-3ubuntu5, libavif-bin 1.0.4-1ubuntu3 | 미설치 |
| 릴리스 웹 빌드 격리(M0 R-1) | 비밀 없는 읽기 권한 전용 잡(새 VM)에서 빌드하고 아티팩트만 서명 잡으로 전달 | — |

sudo가 필요한 apt 일괄 설치: 255개, 내려받기 262 MB, 디스크 +638 MB.

## 결정

- 삭제: `.devcontainer/`, `compose.yaml`, `docker/`, `.github/actions/dev-image`.
- 호스트 설치는 `tools/setup-host.sh` 하나(여러 번 실행 가능, 단계 출력, sudo·라이선스는 터미널에서만 묻고 비대화형이면 보류로 끝낸다).
- 검증은 `npm run verify` 또는 AGENTS §5의 개별 명령. 로컬 E2E 4 workers, `sim --workers 4`, Gradle `--max-workers=4`.
- 로컬·CI 동일성은 버전 핀(`.nvmrc`, package-lock, Gradle 설정, JDK 21, Ubuntu 24.04)으로 담보한다.
- JDK 배포판은 CI Temurin, 호스트 Ubuntu OpenJDK(같은 21.0.12 패치). Adoptium 저장소를 호스트에 추가하지 않는다.
