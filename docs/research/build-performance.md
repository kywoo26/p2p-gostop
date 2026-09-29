# 빌드·릴리스 성능 조사 (B1)

2026-09-29. 요구사항: plan.md §2·§3-3 B1·§5, spec.md FR-31·NF-01·NF-02·AC-06.
검사를 생략하지 않고 Docker 안에서 같은 도구·같은 명령을 실행한다.
Context7 도구가 이 세션에 제공되지 않아 아래 공식 문서·공식 액션 소스를 직접 조회했다.

## 1. 변경 전 측정

`gh run list --workflow ci.yml/release.yml`과 `gh run view ID --json jobs`의
startedAt/completedAt 차이. 잡 시간에는 준비·후처리를 포함하고, 큐 대기는 별도다.
서로 다른 커밋·캐시 상태의 관측값이므로 통제된 벤치마크로 해석하면 안 된다.

| 실행 | 범위 | 실측 |
|---|---|---:|
| [기존 main CI 36512387020](https://github.com/kywoo26/p2p-gostop/actions/runs/36512387020) | Android 잡 / Gradle | 210초 / 178초 |
| 같은 실행 | Node 잡 / E2E | 73초 / push에서는 미실행 |
| [PR #38 CI 36511623992](https://github.com/kywoo26/p2p-gostop/actions/runs/36511623992) | 통합 이미지 단일 잡, 전체 검증 | **374초** |
| 같은 실행 | 이미지 / npm ci / lint / check / 단위 테스트 / 웹 빌드 | 72 / 7 / 10 / 12 / 20 / 2초 |
| 같은 실행 | 브라우저 컴포넌트 / E2E / Gradle 복원 / Android | 27 / 150 / 7 / 60초 |
| [v0.2.0 릴리스 36512786231](https://github.com/kywoo26/p2p-gostop/actions/runs/36512786231) | APK 잡 전체 | **170초** |
| 같은 실행 | 격리 웹 빌드 / Gradle / 서명 검증·체크섬 / 업로드 | 16 / 130 / 1 / 8초 |

사용자 초기 추정(릴리스 8~10분) 대신 현재 로그를 기준으로 삼는다. 서명 검증 1초는
키스토어 서명 작업만의 시간이 아니다. APK 서명 태스크 시간은 Gradle 전체에 포함되어 있다.

로컬 WSL2에서 `/usr/bin/time -p`로 Docker CLI 시작·종료를 포함해 측정했다.

| 경로 | 실측 | 조건 |
|---|---:|---|
| 변경 전 `./dev.sh install` | 12.53초 | 새 워크트리 볼륨 |
| 변경 전 `./dev.sh ci` | 223.83초 | 기존 ci 태스크(컴포넌트 테스트는 원래 없음); Gradle 102초 |
| 통합 이미지 `npm ci` | 4.87초 | 다운로드 캐시 있음 |
| 통합 이미지 `docker compose build dev` | 5.01초 | 로컬 레이어 적중; 원격 콜드 비용과 비교 금지 |
| 통합 이미지 Android, 변경 전 | 41.31초 | 18 executed / 34 up-to-date |
| 구성 캐시 첫 실행 | 30.74초 | 18 executed / 34 up-to-date, entry stored |
| 구성 캐시 재사용 | 6.66초 | 1 executed / 51 up-to-date, entry reused |

위 최초·재사용 차이는 task up-to-date 효과도 포함한다. 구성 캐시만으로 84% 개선됐다고
해석하지 않는다. CI 전후 측정은 PR 실행이 완료된 뒤 별도로 기록한다.

## 2. 수단 비교와 우선순위

아래 예상치는 실측 전 가설이며 합산하지 않는다. 캐시 적중·러너 부하에 따라 달라진다.

| 순위 | 수단 | 예상 이득 | 비용·위험·판단 |
|---|---|---|---|
| 1 | 브라우저 검증을 별도 CI 잡으로 분리 | 순차 177초를 Android·Node와 겹침; 약 1~2분 벽시계 단축 | 이미지 준비 중복, runner-minutes 증가. Chromium/WebKit 및 AC-06 직렬 계측은 그대로 유지 |
| 2 | Gradle build/configuration cache + setup-gradle | 변경 없는 컴파일·구성 작업 회피; 수초~수십초 | main만 쓰기, PR·태그는 읽기 전용. 구성 캐시는 암호화 키가 있어야 Actions에 저장 |
| 3 | BuildKit `type=gha` 레이어 캐시 | SDK 다운로드·apt 반복 제거 | 큰 베이스 이미지 다운로드·load 시간은 남음. 첫 실행은 캐시 저장 때문에 더 느릴 수 있음 |
| 4 | 정확한 main CI SHA의 웹 번들 재사용 | 기존 격리 빌드 16초 중 일부 | 아티팩트 만료·계정 할당량 때문에 fallback 필수. APK 버전·서명은 태그에서 다시 생성 |
| 5 | npm 다운로드 캐시 | npm ci의 다운로드 감소 | node_modules 자체를 캐시하지 않음. lockfile 기반 npm ci 유지 |
| 6 | Dockerfile 변경 시 GHCR 이미지 발행 | 매 잡 이미지 build/load 대신 pull | private package 인증·보관·digest 갱신 비용. 먼저 GHA 캐시 실측 후 판단 |
| 7 | Playwright 2개 이상 shard / 프로젝트별 잡 | E2E 150초의 추가 병렬화 | 이미지·npm 중복과 과금 증가. timing 프로젝트 의존성을 잘못 나누면 검증 중복/누락. 우선 전체 E2E 잡 분리 |
| 8 | 20코어 WSL2 자체 러너 | 상시 이미지·디스크 캐시, CPU 작업 가속 | 절전·재부팅·Docker Desktop 가용성, 보안 격리와 관리 비용. 기본 릴리스 러너로는 보류 |

### Gradle·AGP

- `org.gradle.caching=true`는 이미 있었다. setup-gradle은 로컬 task output 캐시와 의존성을
  Actions 캐시로 운반한다. 별도 HTTP remote build-cache 서버를 도입한 것은 아니다.
- setup-gradle v6 기본 enhanced provider는 비공개 저장소에 현재 free preview다. 기본값을
  유지해 암호화 구성 캐시·부분 복원·중복 제거를 사용한다. 향후 과금 조건이 바뀌면 basic
  provider를 평가한다(동일한 기능·캐시 적중률이라고 가정하지 않는다).
- 구성 캐시는 fail 모드로 켠다. 호환성 문제를 warn으로 숨기지 않는다. git 버전 정보는
  `providers.exec`로 추적되어 SHA·태그 변경 시 구성이 무효화되는 것이 정상이다.
- 빌드·단위 테스트·Lint를 한 Gradle 호출로 실행한다. `--no-daemon`을 제거해도
  `docker compose run --rm` 사이에 JVM이 살아남지는 않는다. 이미 한 호출이었던 경로에
  큰 daemon 재사용 이득이 있다고 주장하지 않는다.
- configuration cache는 같은 프로젝트 내 독립 태스크 병렬 실행도 허용한다. 단일 app 모듈에서
  `org.gradle.parallel=true`만의 추가 이득은 작다. CI worker 수는 러너 코어 수에 맞추고,
  WSL 20코어 전체를 무조건 쓰거나 4GB JVM을 여러 개 겹치지 않는다.
- Kotlin incremental compilation은 기본 활성화다. 이 앱에는 annotation processor/KSP가
  없으므로 성능을 위해 KSP를 새로 추가할 이유가 없다. kapt도 추가하지 않는다.
- AGP의 non-transitive R 기본값을 유지하고 Jetifier를 켜지 않는다. debug에 R8/resource
  shrinking을 켜지 않는다. release의 기존 minify/shrink 정책도 변경하지 않는다.

### 릴리스

태그가 main 이력에 있고 해당 SHA의 CI가 성공했다는 게이트, 저장소 읽기 전용 웹 빌드,
`npm ci --ignore-scripts`, 서명자 지문 고정, 키 삭제, 체크섬을 유지한다.
웹 자산이 확정되기 전에 `preBuild`·APK 패키징을 병렬 실행하면 빈/이전 자산이 들어갈 수 있다.
이 의존성을 임의로 끊지 않는다.

CI debug APK를 그대로 재서명하는 것은 release variant와 같지 않다. 태그 전후의
`git describe`(versionName), shallow clone의 versionCode, Vite의 빌드 시각도 재현성을 방해한다.
따라서 이번에는 정확한 SHA의 웹 번들만 재사용하고 APK는 태그에서 한 번 빌드한다.
완전한 build-once/sign-later는 태그와 무관한 버전 주입·unsigned release variant·출처 검증을
별도 설계한 뒤 적용한다.

`--only-changed`는 개발 피드백에는 유용하지만 전체 회귀 검증을 대체하지 않는다. 이 PR에서는
테스트 필터, 재시도 수, 스크린샷 허용 오차, AC-06 예산을 바꾸지 않는다.

## 3. 자체 러너 권고

우선 GitHub-hosted Ubuntu 24.04 + 캐시 + 2개 병렬 잡을 권한다. WSL2는 선택적인 신뢰된
개발 브랜치 실험용으로 평가한다. private repo도 PR 코드·npm 설치가 러너에서 실행되므로
개인 PC의 SSH 키·서명 키·다른 저장소와 분리된 전용 VM/호스트가 필요하다.

공식 `actions/runner`를 컨테이너로 운영할 수 있지만 Docker 소켓을 주면 호스트 Docker를
제어할 수 있어 컨테이너만으로 강한 격리가 되지 않는다. 1잡 후 폐기하는 ephemeral 등록,
외부 로그 보관, 자동 업데이트, 접근 가능한 저장소/브랜치 제한, 오프라인 시 hosted 경로가
필요하다. 절전·Windows 업데이트 중에는 잡이 큐에 남는다. 20코어가 있어도 네트워크·압축·
직렬 UI 계측이 비례 가속되지는 않는다. 실제 설치·러너 등록은 이번 범위가 아니다.

## 4. 공식 근거

- [Gradle Actions 설정·캐시 정책·암호화](https://github.com/gradle/actions/blob/main/docs/setup-gradle.md), [v6 입력 계약](https://github.com/gradle/actions/blob/v6/setup-gradle/action.yml)
- [Gradle build cache](https://docs.gradle.org/current/userguide/build_cache.html), [configuration cache](https://docs.gradle.org/current/userguide/configuration_cache.html), [활성화·암호화](https://docs.gradle.org/current/userguide/configuration_cache_enabling.html), [daemon](https://docs.gradle.org/current/userguide/gradle_daemon.html)
- [Android 빌드 최적화](https://developer.android.com/build/optimize-your-build), [Kotlin incremental/cache](https://kotlinlang.org/docs/gradle-compilation-and-caches.html)
- [Docker Actions 캐시](https://docs.docker.com/build/ci/github-actions/cache/), [GHA backend·scope](https://docs.docker.com/build/cache/backends/gha/), [build-push-action](https://github.com/docker/build-push-action)
- [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/), [Playwright CI](https://playwright.dev/docs/ci), [sharding](https://playwright.dev/docs/test-sharding)
- [아티팩트 다운로드](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts), [자체 러너](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners), [러너 보안](https://docs.github.com/en/actions/reference/security/secure-use)
