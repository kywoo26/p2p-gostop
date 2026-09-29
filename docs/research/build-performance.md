# 빌드·릴리스 성능 조사 (B1)

2026-09-29. 요구사항: plan.md §2·§3-3 B1·§5, spec.md FR-31·NF-01·NF-02·AC-06.
검사를 생략하지 않고 Docker 안에서 같은 도구·같은 명령을 실행한다.
Context7 도구가 이 세션에 제공되지 않아 아래 공식 문서·공식 액션 소스를 직접 조회했다.

**최초 채택 결과:** 전체 PR CI 374초 → 310초(-17.1%). 같은 검증을 두 잡에서 병렬로 실행한다.
합산 잡 시간은 374초 → 604초(+61.5%)로 늘었다. 아래는 캐시 상태와 실패한 성능 실험까지
포함한 기록이며, 운영 릴리스 변경 후 시간은 실제 배포를 하지 않아 미측정이다.

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

위 최초·재사용 차이는 task up-to-date 효과도 포함한다. 기본 워크트리 마운트는 공용 Git
디렉터리를 포함하지 않아 Android 빌드 시각이 현재 시각으로 fallback하는 기존 제약도 있다.
구성 캐시만으로 84% 개선됐다고 해석하지 않는다.

공용 Git 디렉터리를 같은 경로에 읽기 전용 추가 마운트한 통제 비교(같은 커밋·웹 번들,
`--max-workers=2`, 각 경로 준비 실행 뒤 반복): **구성 캐시 없음 6.79초 → 재사용 4.84초**.
둘 다 `1 executed, 51 up-to-date`. 구성 캐시 첫 저장은 10.63초였다. 따라서 이 단일 모듈의
반복 구성 이득은 약 2초이며 최초 저장 비용을 별도로 보아야 한다.

배포 없는 릴리스 경로 검증도 개발 이미지에서 수행했다. 읽기 전용 소스 + 임시 빌드
디렉터리 + `npm ci --ignore-scripts` 웹 빌드는 5.39초. 임시 RSA-2048 키로
`testDebugUnitTest assembleRelease`는 최초 43.10초, 구성 캐시 저장 7.93초,
재사용 5.77초였다(최초는 release variant 작업이 필요하므로 전후 가속률로 쓰지 않음).
`apksigner sign` 자체는 0.303초이며 인증서 SHA-256이 생성한 임시 키와 일치했다.
실제 릴리스 키·태그·업로드를 사용하지 않아 **운영 릴리스의 변경 후 전체 시간은 아직 미측정**이다.

구성 캐시를 재사용한 상태에서 웹 자산 파일을 추가하고 제거해 APK를 두 번 생성했으며,
APK 안의 추가·삭제가 반영되는 것도 확인했다. 캐시 때문에 이전 번들이 남지 않는다.

### 첫 CI 실험과 조정

[36514356603](https://github.com/kywoo26/p2p-gostop/actions/runs/36514356603)은 전체 성공했지만
599초(Android 포함 잡) / 484초(브라우저 잡)로 느려졌다. image+install은 263/257초,
Gradle은 캐시가 없어서 252초였다. 이 수치를 개선으로 포장하지 않는다.

브라우저 잡 로그에서 docker-container builder의 이미지 export/load 96.6초와 초기 GHA
캐시 export 51.5초를 확인했다(Android 잡의 cache export는 120.9초). 그래서 공식
`setup-docker-action`으로 containerd 저장소를 켜고 `docker` driver를 사용한다. 기존 main의
`android` job ID도 유지하여 setup-gradle 캐시를 이어받는다. PR의 읽기 전용 정책을 풀어
벤치마크만 빠르게 만드는 방법은 쓰지 않았다.

[36515213933](https://github.com/kywoo26/p2p-gostop/actions/runs/36515213933)은 383초 / 317초로
전체 성공했다. 이미지+설치는 75/88초로 줄었지만 Gradle 홈이 여전히 비어 234초를 썼다.
기존 main은 기본 `~/.gradle`, 초기 구현은 `$RUNNER_TEMP/gradle-home`을 사용했다.
Actions 캐시 버전은 경로도 포함하므로 기본 홈을 유지하고 그 절대 경로를 컨테이너에도
같이 마운트하도록 수정했다. 이후 실행에서 실제 복원 여부를 확인한다.

이 실행의 Playwright 로그는 `Running 56 tests using 1 worker`였다. 2코어 러너에서 일반
테스트는 `--workers=2`로 실행하고, timing 프로젝트의 `workers: 1`·직렬 의존성은 유지한다.
이미지 이름은 `docker compose config --images dev`에서 읽어 CI·릴리스·로컬의 태그를 일치시킨다.

### 채택 구성의 CI 실측

[36515857675](https://github.com/kywoo26/p2p-gostop/actions/runs/36515857675), head `8bd36f0`,
두 잡 모두 success. Docker 레이어와 npm 다운로드 캐시는 같은 PR의 이전 실행에서,
Gradle 홈은 main에서 복원했다. 구성 캐시는 이 SHA의 그래프를 새로 저장했다.

| 항목 | PR #38 기준 | 채택 구성 | 해석 |
|---|---:|---:|---|
| 검증 전체 벽시계(가장 긴 잡) | 374초 | **310초** | **64초, 17.1% 감소** |
| 합산 잡 시간 | 374초 | 604초 | 병렬화 비용 +61.5%; 큐 대기·과금 반올림 제외 |
| Node + Android 잡 | 단일 잡에 포함 | 294초 | 브라우저와 동시 실행 |
| 브라우저 잡 | 단일 잡에 포함 | 310초 | 컴포넌트 28초 + E2E 191초 + 준비·후처리 |
| 이미지 + npm ci | 79초 | 79/87초 | 레이어 캐시가 있어도 큰 이미지 다운로드·unpack은 필요 |
| Gradle 복원 / 실행 | 7 / 60초 | 11 / 116초 | 기존 CI 캐시 상태·빌드 입력이 달라 직접 속도 비교 금지 |
| Gradle 미적중 후보 → 경로 수정 후 | 234초(36515213933) | 116초 | main 캐시 8개 복원 확인 |

E2E의 2 workers 자체 이득은 확인되지 않았다(직전 1 worker 실행 185초, 이번 191초).
전체 성공·재시도 없음은 확인했으며, 17.1% 전체 단축을 worker 수 변경 덕분이라고 주장하지
않는다. 시간 계측 프로젝트의 직렬 실행·예산·기존 skip 2건은 그대로다. 추가 샤딩은 보류한다.

PR은 Gradle 캐시를 저장하지 않는다. main에 병합된 뒤 처음 성공한 쓰기 가능한 실행에서
암호화 구성 캐시가 원격에 생성된다. 이번 검증 범위는 Actions의 main Gradle 홈 복원,
CI 내 구성 캐시 저장, 로컬 구성 캐시 재사용까지다. 원격 구성 캐시 hit를 관측했다고
주장하지 않는다. `GRADLE_ENCRYPTION_KEY` 저장소 Secret은 생성해 연결했다.

검증: Node 439 tests, Chromium/WebKit 컴포넌트 224 tests, E2E 54 passed + 기존 2 skipped,
타입·lint·웹 예산/외부 URL 검사·Android assembleDebug/testDebugUnitTest/lint·actionlint 통과.
서명 경로는 임시 키로 검증했고 테스트 키·테스트 release APK는 제거했다.

운영 제약: 아티팩트 업로드는 현재 계정 저장 할당량 초과로 실패한다(기존대로 보조 아티팩트는
continue-on-error). 릴리스는 이 경우 격리 웹 빌드를 반드시 실행한다. 따라서 저장 할당량이
풀리기 전에는 웹 번들 재사용의 시간 이득도 발생하지 않는다. main 이력·CI 성공·서명 지문
검증은 실패를 무시하지 않는다.

### PR #38 최종 병합본 동기화

`origin/main`의 `c6a637e`(#38 병합 커밋 `f5df64f` 포함)를 일반 merge로 반영했다.
개발 이미지 `p2p-gostop-dev:3`·진입점·이미지 태그 검사·소유권 복구 안내를 보존했다.
plan의 단일 버전 표 원칙을 따르고, 삭제된 M4 실기기 문서 대신 통합 procedure.md를 사용한다.
릴리스 링크도 procedure.md로 맞췄다. 캐시 정책·두 잡의 전체 검증·동일 SHA 웹 번들 복원과
격리 fallback은 유지한다. 재검증 CI의 시간과 실행 링크는 PR #73 본문에 기록한다.

최신 비교 기준인 [#38 최종 CI 36520082974](https://github.com/kywoo26/p2p-gostop/actions/runs/36520082974)는
**616초(10분 16초)**였다. 이미지 71초, npm ci 8초, lint/check 각 14초, Node 31초,
웹 빌드 3초, 컴포넌트 28초, E2E 233초, Gradle 복원 10초, Android 185초다.
위 최초 기준 374초와 섞지 않는다. main의 기능·테스트가 늘었고 캐시 상태도 달라졌다.

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
- [KSP incremental processing](https://kotlinlang.org/docs/ksp-incremental.html), [kapt → KSP](https://kotlinlang.org/docs/ksp-kapt-migration.html)
- [Docker Actions 캐시](https://docs.docker.com/build/ci/github-actions/cache/), [GHA backend·scope](https://docs.docker.com/build/cache/backends/gha/), [build-push-action](https://github.com/docker/build-push-action)
- [docker driver의 containerd 캐시 지원](https://docs.docker.com/build/cache/backends/), [공식 setup-docker 설정](https://docs.docker.com/build/ci/github-actions/multi-platform/)
- [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/), [Playwright CI](https://playwright.dev/docs/ci), [sharding](https://playwright.dev/docs/test-sharding)
- [아티팩트 다운로드](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts), [자체 러너](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners), [러너 보안](https://docs.github.com/en/actions/reference/security/secure-use)
- [ephemeral 러너·업데이트·외부 로그 보관](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- [Actions 캐시 버전·경로·브랜치 범위](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)
