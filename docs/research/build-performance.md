# 빌드·릴리스 성능 측정 및 채택 구성 (B1)

2026-09-29 측정. 동일 개발 이미지와 전체 검증을 유지한다. 잡 시간은 준비·후처리를 포함하며, 서로 다른 커밋/캐시 상태의 관측값은 통제된 성능 비교가 아니다.

## CI 측정

| 실행 | 구성·범위 | 벽시계 |
|---|---|---:|
| [PR #38](https://github.com/kywoo26/p2p-gostop/actions/runs/36511623992) | 통합 이미지 단일 잡, 전체 검증 | 374초 |
| [채택 구성](https://github.com/kywoo26/p2p-gostop/actions/runs/36515857675) | Node+Android와 브라우저 잡 병렬, 두 잡 성공 | 310초 |
| 같은 채택 실행 | 합산 잡 시간 | 604초 |
| [#38 최종 main 기준](https://github.com/kywoo26/p2p-gostop/actions/runs/36520082974) | 기능·테스트·캐시 상태 변경 후 | 616초 |

최초 비교에서는 전체 벽시계가 64초(17.1%) 줄고 합산 잡 시간은 230초(61.5%) 늘었다. #38 최종 main 616초는 이전 374초와 같은 기준이 아니다. 운영 릴리스 변경 후 전체 시간은 실제 배포하지 않아 미측정이다.

## 채택 구성

- GitHub hosted Ubuntu 24.04, 같은 개발 이미지, Node+Android와 Chromium/WebKit 브라우저 검증을 두 잡에서 병렬 실행한다. timing 프로젝트의 직렬 설정은 유지한다.
- Docker containerd 저장소와 공식 Docker 액션의 레이어 캐시, npm 다운로드 캐시, Gradle setup-gradle 캐시·configuration cache를 쓴다. 캐시 실패로 검사를 건너뛰지 않는다.
- 릴리스는 main 이력과 정확한 SHA의 CI success를 확인한다. 웹 번들 아티팩트가 있으면 같은 SHA 산출물을 복원하고, 없으면 격리 웹 빌드를 수행한다. APK는 태그에서 release variant로 빌드·서명·지문/체크섬을 검사한다.
- 자체 WSL 러너는 절전·업데이트·Docker 소켓 노출과 관리 비용 때문에 기본 릴리스 경로로 채택하지 않았다.

로컬 반복 Android 구성 캐시 비교는 같은 입력에서 6.79→4.84초였으며 최초 저장은 10.63초였다. 큰 개선률로 일반화하지 않는다. 실제 운영 릴리스 시간과 장기 캐시 적중률은 후속 실행에서 측정한다.

공식 근거: [Gradle Actions](https://github.com/gradle/actions/blob/main/docs/setup-gradle.md), [Gradle configuration cache](https://docs.gradle.org/current/userguide/configuration_cache.html), [Docker GHA cache](https://docs.docker.com/build/cache/backends/gha/), [Playwright CI](https://playwright.dev/docs/ci).
