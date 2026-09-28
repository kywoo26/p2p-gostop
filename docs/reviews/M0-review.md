# M0 리뷰 — 핫스팟 스모크 APK (독립 감사)

- 검토일: 2026-09-28 · 검토 대상: `main` @ `0447e7e` (배포본 `v0.0.1` = `85f3031`)
- 근거 문서: plan.md(§0, §1.1, §1.7, §2, §3 M0, §5, §6, §8.2), spec.md(§2.1, §3.1, §3.4, NP-08, NF-01/04/05/06/10, AC-00, §11), tech-stack.md, AGENTS.md, docs/device-test/M0.md
- 직접 확인한 것
  - `./dev.sh android:test` → BUILD SUCCESSFUL, 단위 테스트 23개 전부 통과(IpSelector 10, WifiQr 6, SmokeServer 4, LogBuffer 3), Android Lint "No issues found"
  - `./dev.sh apk:debug` → BUILD SUCCESSFUL, `app-debug.apk` 11.5MB
  - `gh release view v0.0.1` → `p2p-gostop-v0.0.1.apk` + `.sha256` 첨부, 설치·절차서 링크 포함 노트
  - release 실행 36388623390 → apksigner `CN=p2p-gostop, O=kywoo26, C=KR`(디버그 키 아님), 릴리스 APK 9,474,231바이트
  - ci 실행: 36388623387은 아티팩트 할당량 초과로 실패, `edca5d7` 이후 36389039386·36391195689는 성공
- 범위 밖: `packages/engine`, `packages/web`(다른 작업 중). Context7 사용 여부는 검증할 수 없어 뺐다.

심각도: **심각** = 출시·데이터·보안을 바로 깨뜨림 / **중요** = M4 전에 고쳐야 함 / **경미** = 여유 있을 때 고침

---

## 1. 이행 매트릭스

### 1.1 plan §3 M0 산출물·검증

| 항목 | 판정 | 근거 |
|---|---|---|
| 버튼 하나로 LOHS 시작 | 이행 | `MainActivity.kt:95-103` → `HotspotService.kt:159-185`(API 36 `startLocalOnlyHotspotWithConfiguration(BAND_2GHZ)`, 실패 시 기본 API로 재시도 `:224-233`) |
| SSID/비밀번호/IP 표시 | 이행 | `MainActivity.kt:203-208`, 상태는 `HotspotService.kt:200-215` |
| Wi-Fi QR(`T:WPA`) + URL QR | 이행 | `WifiQr.kt:22-27`, `QrBitmap.kt`, `MainActivity.kt:210-213` |
| Ktor `/` "연결 성공" 페이지 + `/ws` 에코 | 이행 | `SmokeServer.kt:51-86`, `SmokePage.kt` |
| 진단 화면(권한, Wi-Fi, 핫스팟 상태, 오류) | 이행 | `Diagnostics.kt:28-41` |
| 로그 공유 버튼 | 이행(크기 문제 있음, 3.2 참고) | `MainActivity.kt:252-277` |
| 빌드 해시 표시 | 이행 | `build.gradle.kts:19-22,46-47`, `MainActivity.kt:77-78`, `SmokePage.kt:52` |
| QR은 ZXing core로 그림 | 이행 | `libs.versions.toml:6,17` (3.5.4) |
| CI `release.yml`: 태그 → 서명 APK → Releases | 이행 | `release.yml:5-7,58-110`, v0.0.1 릴리스 확인 |
| 서명 키 Docker 1회 생성, `gh secret set`, 사용자 백업 요청 | 이행(보관 방식에 문제, 4.4 참고) | `secrets/README.md`(git 제외), Secrets 4종 사용 `release.yml:2` |
| 자동 검증: IP 파서·QR 문자열 단위 테스트 | 이행(회귀 테스트 빠짐, 3.3 참고) | `IpSelectorTest.kt`, `WifiQrTest.kt` |
| 자동 검증: Ktor `testApplication` 라우트·WS 에코 | 이행 | `SmokeServerTest.kt:29-72` |
| 자동 검증: `assembleRelease` 성공 | 이행 | release 실행 36388623390 (단, ci.yml에는 없음) |
| 사람 검증 (1)~(7) 비행기 ON 경로 | 이행 | `docs/device-test/M0.md:126-138` |
| 사람 검증 (8) 화면 끄고 켜기 후 재접속 | **미이행** | `M0.md:136` "미수행 → 회차 2" |
| 사람 검증 (9) 로그 공유 전달 | 부분 | 회차 1 기록은 로그 내용을 인용하지만 결과표 13번은 채워지지 않음(`M0.md:80-97`, `:124` 빈 행) |
| 사람 검증: 비행기 모드 OFF 회차 | **미이행** | 회차 1은 A회차만 수행 |
| 완료 기준 AC-00 | 이행 | `M0.md:138`, spec §11.1 갱신 |

### 1.2 plan §8.2 작업 순서

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| 1 | 매니페스트 권한(tech-stack 1.1) | 이행 | `AndroidManifest.xml:5-14`. `ACCESS_FINE_LOCATION maxSdk 32`는 minSdk 33이라 필요 없어 뺀 것이 맞다 |
| 1 | `HotspotService`(FGS `connectedDevice`) | 이행 | `AndroidManifest.xml:37-40`, `HotspotService.kt:77-83` |
| 1 | `LocalOnlyHotspotCallback` 처리 | 이행(수명 주기 결함, 3.1) | `HotspotService.kt:199-234` |
| 1 | IP 탐색 | 이행 | `IpSelector.kt`, `HotspotService.kt:258-281` |
| 2 | Ktor 3.6.0 CIO `/`, `/ws`, `/health` | 이행 | `SmokeServer.kt:43-88,124-125` |
| 3 | QR, 상태·진단, 로그 버퍼·공유 인텐트, `BuildConfig` 해시 | 이행 | 위와 같음 |
| 4 | 단위 테스트, release.yml, 키·Secrets, `v0.0.1` 태그 → APK | 이행 | 태그 `v0.0.1`, 릴리스 자산 2개 |
| 5 | `docs/device-test/M0.md` | 이행 | 138줄, 회차 1 기록 포함 |

### 1.3 spec 요구사항

| ID | 판정 | 근거·비고 |
|---|---|---|
| FR-01 | 이행 | LOHS를 앱 안에서 켬(`HotspotService.kt:168-184`), 세션마다 QR 재생성(`MainActivity.kt:210-213`, 내용이 바뀔 때만 다시 그림 `:228-248`), 인터페이스를 순회해 IP 탐색(`IpSelector.kt:96-109`), `connectedDevice` FGS 사용 |
| FR-02 | 이행(권한 문제 있음) | 폴백 안내(`strings.xml:36-37`), "주소만 표시"(`HotspotService.kt:54-61`), 설정 열기(`MainActivity.kt:281-294`). 단, 주소만 표시 모드도 NEARBY 권한을 요구함(3.4-3) |
| FR-03 | 이행 | 항상 `T:WPA`(`WifiQr.kt:24`), URL QR, IP 텍스트(`MainActivity.kt:206`). WPA3_SAE_TRANSITION LOHS에 iPhone 접속 성공(`M0.md:130-132`) |
| FR-30 | 부분(M0 범위에서는 충분) | 호스트 링버퍼(`LogBuffer.kt`), 게스트 로그 WS 업로드(`SmokePage.kt:100` → `SmokeServer.kt:69-70`), 공유 시트(`MainActivity.kt:271-277`), 게스트 쪽 선택 가능한 textarea(`SmokePage.kt:60`). 송수신 요약·엔진 이벤트는 M4 범위. 바이트 상한이 없음(3.2) |
| FR-31 | 이행 | 앱(`MainActivity.kt:77`), 페이지(`SmokePage.kt:23,52`), `/health`(`SmokeServer.kt:93-105`). 커밋 7자리와 빌드 시각 |
| FR-32 | 이행 | 권한·Wi-Fi·비행기 모드·핫스팟 상태·서버 포트·WS 접속 수·배터리 최적화 예외 (`Diagnostics.kt:28-41`) |
| NP-08 | 부분 | 정적 페이지와 WS만 제공, 외부 호스트 접근 코드 없음(grep 결과 `http` 문자열은 자기 URL뿐), INTERNET 선언(`Manifest:11`), targetSdk 36(`build.gradle.kts:42`). **"빌드 검사로 보장"은 페이지 HTML 정규식 테스트 하나뿐**(`SmokeServerTest.kt:40`)이고 Kotlin/APK 쪽 정적 검사는 없음 |
| NF-01 | 이행(M0 페이지) | 인라인 CSS·JS, 시스템 글꼴 |
| NF-04 | 부분 | FGS 알림 1개. 그러나 IP를 3초마다 계속 폴링(`HotspotService.kt:273-278`)해서 "폴링 없음"과 충돌한다. WS ping 15초(`SmokeServer.kt:45`)도 spec의 하트비트 25초와 다르다 |
| NF-05 | 미검증 | 페이지가 `visibilitychange`/`pageshow`에서 다시 연결함(`SmokePage.kt:101-102`). 실기기 확인은 회차 2로 미뤄짐 |
| NF-06 | 부분 | 로컬 전용이고 개인정보를 수집하지 않음. 비밀번호는 로그에서 앞 3자만 남기고 마스킹(`HotspotService.kt:325-329`, `MainActivity.kt:246`). 단, "주소만 표시" 모드에서는 집 LAN 전체에 인증 없는 서버가 열림(3.4-4) |
| NF-10 | 이행 | 릴리스 APK 9.47MB(15MB 이하), 위치 권한 없음, 권한을 요청하기 전에 이유 설명(`MainActivity.kt:137-147`) |
| AC-00 | 이행 | 비행기 ON → Wi-Fi ON → LOHS → iPhone QR 접속 → Safari "연결 성공" 순서로 S25 Ultra/Android 16 + iOS 26.5에서 성공(`M0.md:126-138`) |

---

## 2. 원칙 준수 (AGENTS.md)

| 규칙 | 판정 | 근거 |
|---|---|---|
| 버전 표: Kotlin 2.4.20 / AGP 9.4.1 / Gradle 9.8.0 / JDK 21 | 준수 | `libs.versions.toml:3-4`, `gradle-wrapper.properties:3`(sha256 고정), CI `setup-java` temurin 21 |
| compile/target/min 36/**36**/33 | 준수 | `build.gradle.kts:37,41-42`. `OldTargetApi` lint 비활성화에 근거 주석 있음(`:99-100`) |
| Ktor 3.6.0 **CIO**(Netty 아님) | 준수 | `libs.versions.toml:13-16`. netty는 packaging exclude 문자열에만 등장 |
| ZXing 3.5.4 | 준수 | |
| 내장 Kotlin, `kotlin.android` 플러그인 미적용 | 준수 | `build.gradle.kts`(루트) 4-15. KGP는 buildscript classpath에만 올림 |
| kapt 금지 / Compose 금지 | 준수 | 둘 다 없음. M0는 클래식 View라서 WebView(androidx.webkit)도 아직 쓰지 않음 |
| minify 끔 | 준수 | `app/build.gradle.kts:64-65` |
| cleartext는 NSC로 127.0.0.1만 | 준수 | `network_security_config.xml`(base false + 127.0.0.1/localhost). `usesCleartextTraffic` 없음. 단, M0에는 WebView가 없어서 이 설정이 실제로 쓰이지는 않았다 |
| 외부 네트워크 요청 없음 | 준수 | 소스 grep 결과 자기 주소 URL만 있음 |
| Docker 전용 빌드 | 준수 | `dev.sh:111-113`, `compose.yml:40-55`. CI는 plan §5대로 러너에서 직접 빌드 |
| 표에 없는 의존성 | 경미 위반 | 테스트 의존성(junit, kotlin-test-junit, ktor-test-host)은 plan 1.8 표에 있음. 그러나 **`kotlinx-coroutines`를 직접 import하면서**(`HotspotService.kt:23-30`, `AppState.kt:7-9`) 선언하지 않고 Ktor에서 전이로 받고 있다 |
| GitHub Actions 버전·`ubuntu-24.04` 고정 | 준수 | 두 워크플로 모두. 단, ci.yml의 Node는 `.nvmrc`("24", 떠다니는 버전)이고 release.yml은 `24.21.0` 고정이라 서로 다르다 |
| Conventional Commits | 준수 | M0 커밋 `f93ecb5 build:`, `acf1876 feat(android):`, `85f3031 build:`, `edca5d7 ci:`, `0447e7e fix(android):`. CLAUDE.md는 커밋에 spec ID를 적으라고 하는데 `acf1876`에는 Refs가 있고 `0447e7e`에는 AC-00만 언급 |

---

## 3. 코드 리뷰 (Android)

### 3.1 HotspotService

| # | 심각도 | 위치 | 문제 | 수정 제안 |
|---|---|---|---|---|
| S-1 | **중요** | `HotspotService.kt:199-215, 283-292` | **정지 후에 늦게 도착한 `onStarted`가 예약을 새게 만든다.** LOHS 요청이 대기 중일 때 사용자가 중지(알림 버튼 또는 토글)를 누르면 `stopAll()` → `stopSelf()`가 실행된다. 그 뒤 도착한 `onStarted`는 이미 파괴된 서비스의 `reservation`에 값을 넣고 `AppState`를 RUNNING으로 바꾼다. 이 예약은 아무도 `close()`하지 않으므로 **핫스팟이 프로세스가 죽을 때까지 켜져 있고**, 화면은 "실행 중"으로 보인다. 다시 "중지"를 눌러도 새 서비스 인스턴스는 `reservation == null`이라 닫지 못한다. `onFailed` → `startLegacy`도 파괴된 서비스에서 실행될 수 있다 | `@Volatile var stopped` 플래그를 두고 콜백 첫 줄에서 `if (stopped) { res.close(); return }`를 한다. 또는 콜백을 세대 번호(`sessionId`)로 묶는다. 예약 보관 위치를 프로세스 단일 객체로 옮기는 방법도 있다 |
| S-2 | **중요** | `AppState.kt:26-27`, `MainActivity.kt:95-103,181`, `HotspotService.kt:108-112,217-222,239-245` | **FAILED/STOPPED 상태에서 서비스가 살아 있는데 앱 안에서 멈출 방법이 없다.** `serviceActive`는 FAILED/STOPPED를 false로 보므로 토글이 "핫스팟 시작"으로 바뀐다. 그러나 서비스·Ktor 서버·3초 IP 폴링·`FLAG_KEEP_SCREEN_ON`(`serverRunning`이 true라서)은 그대로 유지된다. `refreshNotification()`도 `serviceActive`가 false면 건너뛰어서 알림 문구가 "준비하는 중"에 멈춘다. 결국 알림의 중지 버튼만 남는다 | "서비스 생존"(`serviceRunning`)과 "핫스팟 상태"를 나누고, 토글과 알림 갱신은 서비스 생존을 기준으로 한다. `onStopped`에서는 폴백을 명시적으로 선택하지 않았다면 서비스를 정리하거나, "폴백 서버 유지 중 · 중지" 버튼을 보여 준다 |
| S-3 | 경미 | `HotspotService.kt:116-155` | 서버 기동과 정지의 경쟁 조건. `startSmokeServer`가 블로킹 중일 때 `stopServer()`가 오면 `serverJob.cancel()`은 효과가 없고 `server == null`이라 곧바로 반환한다. 그 뒤 기동이 끝나면 `server` 필드에 값이 들어가지만 아무도 멈추지 않아 포트 17777을 계속 붙잡는다. 다음 기동은 BindException으로 5회 실패한다 | 기동 직후 `if (!isActive) { s.stop(); return@launch }`를 확인한다. 또는 기동과 정지를 하나의 `Mutex`나 단일 스레드 디스패처로 직렬화한다 |
| S-4 | 경미 | `HotspotService.kt:94-96, 268-272` | 알림의 "접속 N"은 IP가 바뀔 때만 갱신되어 실제 WS 접속 수와 어긋난다 | `wsClients` 변화(서버 콜백)에서도 `refreshNotification()`을 부르거나 알림에서 접속 수를 빼다 |
| S-5 | 경미 | `HotspotService.kt:258-281` | IP를 찾은 뒤에도 3초마다 `NetworkInterface`를 영구 폴링한다(NF-04 "폴링 없음"). Dispatchers.Default에서 도므로 메인 스레드 문제는 없다 | 찾은 뒤에는 `ConnectivityManager.registerNetworkCallback`(`TRANSPORT_WIFI`, LinkProperties 변화)으로 바꾸거나 간격을 30초 이상으로 늘린다 |
| S-6 | 경미 | `HotspotService.kt:71-75` | `ACTION_STOP` → `stopAll` → `stopSelf` → `onDestroy`에서 `stopAll`이 한 번 더 실행되어 "정지" 로그가 두 번 남는다 | `stopped` 플래그(S-1)로 두 번째 호출을 막는다 |
| 좋음 | — | `:168-197, 224-233` | API 36 구성 변형이 실패하면 기본 API로 재시도하되 `INCOMPATIBLE_MODE`/`TETHERING_DISALLOWED`는 재시도하지 않는다. 콜백은 메인 executor/handler에서 받는다. `startForeground`에 `connectedDevice` 타입을 명시하고, 그 전제 권한(`CHANGE_WIFI_STATE`)을 선언했다 | |

### 3.2 SmokeServer / SmokePage / 로그

| # | 심각도 | 위치 | 문제 | 수정 제안 |
|---|---|---|---|---|
| L-1 | **중요** | `SmokeServer.kt:69-70`, `LogBuffer.kt:19-26`, `AppState.kt:33` | **64KB/2,000줄 상한 중 "총량"은 강제되지 않는다.** 한 프레임 64KB(`maxFrameSize`, `:47`)와 버퍼 2,000줄은 지켜진다. 그러나 줄 길이에는 상한이 없어서, 개행 없는 64KB 로그를 반복해 보내면 2,000줄 × 64K자(UTF-16 약 128KB) ≈ **최대 약 256MB**가 힙에 쌓인다(OOM). 게스트 로그 줄이 호스트 줄과 같은 버퍼를 쓰므로 한 번 업로드(최대 2,000줄)로 호스트의 진단 이력이 전부 밀려나기도 한다. 핫스팟 비밀번호를 가진 사람, 또는 "주소만 표시" 모드에서는 LAN의 누구나 이렇게 할 수 있다 | 줄 길이 상한(예: 500자에서 자르기)과 버퍼 총 바이트 상한(예: 1MB)을 둔다. 게스트 로그는 별도 버퍼(NP-09 "호스트는 최근 2,000줄")에 두고 업로드 빈도를 제한한다(예: 5초에 1회) |
| L-2 | **중요** | `MainActivity.kt:252-263,271-277,296-302` | **로그 공유 크기 상한이 바인더 한도를 넘을 수 있다.** `MAX_SHARE_CHARS = 180_000`은 문자 수라서 UTF-16으로 약 360KB다. ACTION_SEND는 `EXTRA_TEXT`를 ClipData로도 옮기므로 chooser 트랜잭션에서 두 배가 되어 1MB 바인더 한도에 가까워진다. 이때 나는 `TransactionTooLargeException`(RuntimeException)은 `safeStart`가 잡지 않으므로(`ActivityNotFoundException`만 잡음) **공유 버튼이 앱을 크래시시킨다**. L-1과 겹치면 쉽게 도달한다. 카카오톡 등 받는 앱도 긴 텍스트를 자른다 | `EXTRA_TEXT`는 약 50K자로 줄이고(요약 + 마지막 N줄), 전체 로그는 `cacheDir` 파일 + `FileProvider`(`EXTRA_STREAM`)로 보낸다(M4의 로그 수집 설계에 반영). `safeStart`에서 `RuntimeException`도 잡아 로그로 남긴다 |
| L-3 | 경미 | `SmokePage.kt:100` | 게스트는 `slice(-60000)`으로 **문자 수**를 자르는데 서버 상한은 **UTF-8 바이트**다. 한국어 로그는 1.3~3배로 커지므로 로그가 약 4만 자를 넘으면 프레임이 64KB를 넘는다. 이때 서버가 1009로 연결을 끊어 업로드가 조용히 실패한다 | `TextEncoder`(비보안 컨텍스트에서도 사용 가능)로 바이트를 세서 60,000바이트 이하로 자른다. M4 `protocol`의 NP-09 구현에서 같은 기준을 쓴다 |
| L-4 | 경미 | `SmokeServer.kt:70`, `LogBuffer.kt:21-24` | 로그 주입. 게스트 로그의 각 줄에 호스트 타임스탬프만 붙고 출처 표시가 없어서, 게스트가 "핫스팟 실패: …" 같은 호스트 줄을 흉내 낼 수 있다(원인 분석을 오도할 수 있음) | 게스트 줄마다 `G|` 접두어를 붙이거나 게스트 버퍼를 분리한다(L-1과 함께) |
| L-5 | 경미 | `SmokeServer.kt:74,76` | 에코가 64KB 로그 전체를 그대로 돌려보낸다(`log:` 메시지). 불필요한 전송이다 | `log:` 메시지에는 `ack:<len>`만 응답한다 |
| L-6 | 경미 | `SmokeServer.kt:80-81` | `catch (e: Exception)`이 `CancellationException`도 삼키고 오류로 기록한다 | `catch (e: CancellationException) { throw e }`를 먼저 둔다(또는 `ClosedReceiveChannelException`만 정상 종료로 처리) |
| XSS | 문제 없음 | `SmokePage.kt:8-27,71` | 서버 쪽 삽입값(기기 정보, SHA)은 모두 `escapeHtml`을 거치고, 클라이언트는 `textContent`와 `textarea.value`만 쓴다. 게스트가 보낸 문자열은 어느 페이지에도 렌더링되지 않는다(호스트는 네이티브 TextView). `/health`는 `jsonString`으로 이스케이프한다 | |
| 좋음 | — | `SmokeServer.kt:53,57` | `Cache-Control: no-store`로 세션마다 바뀌는 IP 페이지가 캐시되지 않는다. 서버를 메인 스레드 밖에서 기동한다(`HotspotService.kt:118`) | |

### 3.3 IpSelector

| # | 심각도 | 위치 | 문제 | 수정 제안 |
|---|---|---|---|---|
| I-1 | 경미 | `IpSelector.kt:93-94`, `:26` | **음수 점수 제외 수정(`0447e7e`)의 경계에 구멍이 있다.** 가상 인터페이스(−30)라도 192.168.x 주소(+30)를 가지면 점수가 **0**이 되어 `score >= 0`을 통과한다. 삼성에서 흔한 Wi-Fi Direct `p2p-wlan0-0 = 192.168.49.1`(Quick Share·Smart View)이나 192.168 대역 VPN `tun0`이 swlan0보다 먼저 뜨면 회차 1과 같은 오선택이 다시 난다(swlan0이 뜨면 70점으로 바로잡히긴 한다) | 이름 점수와 주소 점수를 따로 걸러낸다: `nameScore(iface) >= 0 && isPrivateIpv4(ip)`. 또는 기준을 `> 0`으로 올린다 |
| I-2 | 경미 | `IpSelectorTest.kt` | **실기기에서 나온 회귀(tun0 10.5.0.2 선택)에 대한 테스트가 없다.** `0447e7e`는 IpSelector만 고치고 테스트를 추가하지 않았다 | `tun0=10.5.0.2`만 있으면 null, `tun0 + swlan0`이면 swlan0, `p2p-wlan0-0=192.168.49.1`이면 null을 확인하는 테스트 3개를 추가한다 |
| I-3 | 경미 | `IpSelector.kt:87-92` | KDoc 블록 두 개가 연달아 있다(이전 주석이 남음) | 위 블록을 지운다 |
| 참고 | — | | 점수 체계(ap/swlan 50, wlan1 40, wlan 20; 192.168 30 > 172.16 25 > 10 20; CGNAT·링크 로컬·공인 IP 감점)는 합리적이다. 회차 1의 `swlan0 = 10.252.26.140`은 50+20=70으로 1위다. 순위도 결정적이다(`:84`) | |

### 3.4 WifiQr / MainActivity / 리소스

| # | 심각도 | 위치 | 문제 | 수정 제안 |
|---|---|---|---|---|
| Q-1 | 문제 없음 | `WifiQr.kt:11-27` | `\ ; , " :` 이스케이프는 ZXing 관례와 같다. 항상 `T:WPA`, 비밀번호가 없으면 `T:nopass`, QR은 UTF-8 힌트. LOHS 비밀번호 문자 집합(2-9, a-z 일부, 15자·홀수 길이)은 16진 해석 문제도 없다 | 시스템 핫스팟 폴백(C회차)에서 SSID가 16진처럼 보이는 드문 경우만 남는다. M4 `uqr` 이전 때 따옴표 규칙을 확인한다 |
| M-1 | 경미 | `MainActivity.kt:62,138,149-158` | `pendingAction`이 인스턴스 필드라서 권한 대화상자가 떠 있는 동안 회전이나 구성 변경이 일어나면 사라진다. 허용해도 핫스팟이 시작되지 않는다 | `onSaveInstanceState`에 저장하거나 `ActivityResultContracts.RequestMultiplePermissions`(androidx.activity. 표에 없으므로 1.8 근거 필요)를 쓴다 |
| M-2 | 경미 | `MainActivity.kt:104-107,129-135` | "주소만 표시"(FR-02 폴백)는 LOHS를 쓰지 않는데도 NEARBY 권한을 요구한다. 권한을 거부한 사용자는 폴백으로도 갈 수 없다 | `ACTION_ADDRESS_ONLY`는 권한 검사 없이 `startHotspotService`로 보낸다 |
| M-3 | 경미 | `MainActivity.kt:215` | 서비스가 꺼져 있으면 `NetworkInterface`를 **메인 스레드에서 매초** 열거한다 | 버튼 동작이나 백그라운드 갱신으로 옮긴다 |
| M-4 | 경미 | `MainActivity.kt:237-242` | QR 생성이 실패하면 `null`을 반환하므로 매초 다시 시도하고 매초 로그를 남긴다(로그 폭주) | 실패한 내용을 기억해 두고 같은 내용이면 다시 시도하지 않는다 |
| M-5 | 경미 | `strings.xml:19`, `HotspotService.kt:95` | 대기 문구가 "비행기 모드 ON → Wi-Fi ON"을 지시한다. M0 테스트 전용 문구라 일반 사용에서는 오해를 부른다. 알림 문구 "접속"은 Kotlin에 하드코딩되어 있다 | M4에서 웹 UI로 옮길 때 정리한다. 알림 문구는 `strings.xml`로 옮긴다 |
| 좋음 | — | | Android 13+ 권한 흐름: 요청 전에 이유를 설명하고(NF-10), 영구 거부를 감지하면 설정으로 안내한다. `neverForLocation`. targetSdk 36 edge-to-edge 인셋 처리(`:69-75`). `allowBackup=false` + `dataExtractionRules`. 한국어 문자열은 모두 리소스에 있고 Lint 0건 | |
| B-1 | 경미 | `build.gradle.kts:22,47` | `BUILD_TIME = Instant.now()`를 구성 단계에서 계산하므로 빌드마다 BuildConfig가 바뀐다. Gradle 캐시가 무효화되고 재현 가능한 빌드가 아니다 | 태그 빌드에서는 커밋 시각(`git log -1 --format=%cI`)을 쓴다 |
| B-2 | 경미 | `build.gradle.kts:21,43` | `versionCode` = 커밋 수. 브랜치나 이력 재작성에 따라 줄어들 수 있고, 그러면 "다운그레이드"로 설치가 실패한다. ci.yml은 얕은 클론이라 항상 1이다 | 태그에서 계산한다(`v0.M.P` → `M*1000+P`). 또는 릴리스에서만 커밋 수를 쓰고 태그가 main 위에 있는지 검사한다 |

---

## 4. CI/배포 리뷰

### 4.1 release.yml

| # | 심각도 | 위치 | 내용 |
|---|---|---|---|
| R-1 | **중요** | `release.yml:23-39,69-75` | **공급망: 서명 비밀을 쓰는 잡 안에서 `npm ci`(설치 스크립트 실행)가 돈다.** `packages/web`이 생기면서 v0.0.1 릴리스에서도 실제로 `npm ci`(227개 패키지)와 웹 빌드가 실행됐다(실행 로그 "assets/web 복사 완료: 5개 파일"). 악성 postinstall은 작업 트리(예: `gradlew`, `build.gradle.kts`)를 바꿀 수 있고, 다음 단계인 Gradle은 키스토어 경로와 비밀번호를 환경변수로 받는다. 또 checkout 기본값(`persist-credentials: true`)이 `contents: write` 토큰을 `.git/config`에 남긴다. **조치:** 웹 빌드를 별도 잡(`permissions: contents: read`, `npm ci --ignore-scripts` 검토)으로 나눠 dist를 아티팩트로 넘기고, 서명 잡은 `persist-credentials: false`로 한다. `.npmrc min-release-age=3`만으로는 부족하다 |
| R-2 | 좋음 | `:26` | `fetch-depth: 0`이라 `git describe --tags`와 커밋 수가 정확하다 |
| R-3 | 좋음 | `:58-67,77-85` | 디버그 서명 거부를 두 겹으로 한다(base64 secret이 없으면 실패, apksigner DN에 `CN=Android Debug`가 있으면 실패). 비밀번호 secret만 빠진 경우도 Gradle이 debug로 폴백한 뒤 DN 검사에 걸린다. 비밀번호는 Gradle 단계 env에만 넘긴다 |
| R-4 | 경미 | `:81-85` | "디버그가 아님"만 검사한다. **기대 인증서 지문(SHA-256 `c83292d0…ef5944`)을 고정**하면 다른 키로 서명된 APK(덮어쓰기 설치 불가)도 막을 수 있다 |
| R-5 | 경미 | `secrets/README.md:25`, 실행 로그 | `ANDROID_KEY_ALIAS`(값 `app`)를 secret으로 등록해서 **로그의 모든 "app"이 `***`로 가려진다**(`:***:testDebugUnitTest`, `android/***/src`, 커밋 제목 "web *** shell"). 로그 가독성이 떨어지고, 가려지는 패턴 때문에 alias도 쉽게 드러난다. alias는 비밀이 아니므로 `vars.ANDROID_KEY_ALIAS`(Variables)로 옮긴다 |
| R-6 | 경미 | `:5-7` | 태그가 main 위에 있는지 검사하지 않는다. 릴리스가 immutable이 아니다(`immutable: false`). 태그 보호 규칙이나 `git merge-base --is-ancestor`로 검사하고, immutable release를 검토한다 |
| R-7 | 경미 | `:90` | 키스토어 삭제가 성공 경로에만 있다(임시 러너라 실제 위험은 낮음). `if: always()` 정리 단계로 옮긴다 |
| R-8 | 좋음 | `:77-110` | sha256 체크섬 첨부, APK 크기 출력, 릴리스 노트에 설치 방법과 태그 고정 절차서 링크 |
| 참고 | — | | M0 APK에 쓰이지 않는 `assets/web`(5개 파일)이 들어갔다. 해는 없지만 로그 문구("M0는 내장 테스트 페이지만 사용")와 실제 동작이 다르다 |

### 4.2 ci.yml

- **아티팩트 실패 무시**(`:38-43,92-98`, `continue-on-error`): 할당량 초과로 첫 실행이 실패한 뒤 적용한 조치로, 타당하다. 다만 원인을 줄이려면 `web-dist` 업로드를 push마다 하지 말고 PR/수동 실행에서만 한다. debug APK도 Releases가 정본이므로 PR에서만 올리는 편이 낫다.
- **Android 감지 단계**(`:80-81`): `hashFiles`는 잡 수준 `if`에서 쓸 수 없다는 주석은 맞다. 이제 `android/`가 있으므로 감지 단계는 죽은 코드다. 지워서 스텝마다 붙은 `if`를 없앤다.
- **분 사용량**: push 한 번에 node 약 0.5분 + android 약 4분, 태그 한 번에 약 5.5분(v0.0.1 기준). 월 2,000분 안이지만 문서만 바뀐 커밋에도 android 잡이 돈다. `paths` 필터(android/**, .github/**, gradle 관련)나 별도 워크플로로 나누기를 권한다.
- ci.yml에 `assembleRelease`가 없어서 릴리스 빌드 회귀가 태그에서야 드러난다(minify가 꺼져 있어 위험은 낮음). 경미.
- Node 버전: ci.yml은 `.nvmrc`("24")를 써서 버전이 고정되지 않는다. AGENTS 표(24.21.0)와 release.yml(24.21.0 고정)과 다르다. 경미.

### 4.3 Dependabot

- npm(devDeps 그룹, TS·@types/node·Playwright 무시 규칙), gradle(`/android`), github-actions: 구성 자체는 타당하다.
- 주석 "쿨다운은 Dependabot 기본값(3일)"(`dependabot.yml:1`)은 근거를 확인할 수 없다. 기본값에 기대지 말고 각 생태계에 `cooldown: { default-days: 3 }`를 **명시**하기를 권한다(.npmrc `min-release-age=3`과 맞추기 위함).
- gradle: Ktor 아티팩트 3개가 PR 여러 개로 갈라질 수 있다 → `groups: ktor: patterns: ["io.ktor:*"]`. Kotlin/AGP를 올리려면 AGENTS 표도 함께 고쳐야 한다는 점을 PR 템플릿이나 주석에 남긴다.

### 4.4 .gitignore와 비밀 유출

- `.gitignore`가 덮는 것: `secrets/`, `*.jks`, `*.keystore`, `.env`, `local.properties`, `build/`, `.gradle/`, `*.apk`, `*.aab`, `assets/web/`. 이상 없음.
- 빠진 것(경미): `android/.kotlin/`(Kotlin 2.x가 세션·오류 로그를 쓰는 폴더로 현재 존재하고 무시되지 않음), `*.p12`, `*.pem`, `.idea/`, `*.iml`.
- **이력 검사 결과 유출 없음**: `git log --all -- secrets '*.jks' '*.keystore' '.password'` 결과 없음. `git rev-list --all --objects`에도 secret·jks·keystore 객체 없음. `git log --all -S <실제 키스토어 비밀번호>` 0건. `secrets/` 밖 작업 트리 전체 grep 0건. `-S jks`에 걸린 커밋 3개(`6bbc914`, `f93ecb5`, `acf1876`)는 문서·.gitignore·release.yml의 문자열일 뿐이다. 릴리스 로그에도 비밀번호가 출력되지 않았다(마스킹된 것은 토큰과 alias `app`뿐).
- **중요(K-1)**: `secrets/README.md`에 **키스토어 비밀번호가 평문으로** 적혀 있고, README는 "이 폴더 전체를 개인 클라우드 등에 백업"하라고 안내한다. 이대로 백업하면 키와 비밀번호가 한곳에 모여, 백업 하나만 유출돼도 서명 키가 통째로 넘어간다. **조치:** README에서 비밀번호를 지우고 비밀번호 관리자에만 보관하게 하며, 백업 안내를 "jks 파일은 클라우드, 비밀번호는 비밀번호 관리자"로 나눈다. `.password` 파일은 로컬 서명 빌드용이면 남겨도 되지만 백업 대상에서는 뺀다. (README 파일 권한 644는 상위 폴더가 700이라 로컬 위험은 낮다.)
- `dev.sh:111-113`의 `bash -c "... $*"`는 인자가 따옴표 없이 셸 문자열에 들어간다(자기 자신만 쓰는 도구라 경미). `"$@"`를 넘기는 형태로 바꾼다.

---

## 5. 실기기 결과 대조 (회차 1 ↔ AC-00)

| AC-00 단계 | 회차 1 결과 | 판정 |
|---|---|---|
| 비행기 모드 ON → Wi-Fi ON | 수행(로그의 "비행기 모드=예"로 확인 가능) | ○ |
| 핫스팟 시작 | `startLocalOnlyHotspotWithConfiguration(BAND_2GHZ)` 성공, `AndroidShare_1279`, 15자, WPA3_SAE_TRANSITION, 채널 1 | ○ |
| SSID/비밀번호/IP 표시 | swlan0 = 10.252.26.140(약 3초 뒤. 그 전에는 VPN tun0 10.5.0.2로 잘못 선택됨) | ○(결함 발견, 수정됨·미배포) |
| iPhone Wi-Fi QR 접속 | `T:WPA` QR로 WPA3 전환 모드 AP에 접속 성공 | ○ |
| Safari 테스트 페이지 | iOS 26.5, `secure=false`, `wakeLock=undefined`(예상대로) | ○ |
| (추가) WS 에코 | 19ms | ○ |
| (추가) 게스트 로그 업로드 | 183자 | ○ |

**결론: AC-00은 충족된다. 리스크 R1(삼성 비행기 모드 LOHS 차단)은 해소되었다.** tech-stack "열린 항목" 중 인터페이스 이름(swlan0), `T:WPA` ↔ SAE 전환 모드 호환, 10/8 대역 IP 세 가지는 실기기로 확정됐다.

**아직 검증하지 않은 것**
1. iPhone 잠금·복귀 후 자동 재접속(10초·1분), 즉 NF-05·NF-04 경로 — `M0.md:136`
2. 캡티브 시트("인터넷 없이 사용")가 떴는지 — `M0.md:137`, 사용자 회신 대기
3. B회차(비행기 모드 OFF, 모바일 데이터 ON). 셀룰러 rmnet과 함께 있을 때의 IP 선택
4. C회차(폴백: 시스템 핫스팟 / 같은 Wi-Fi + 주소만 표시). 시스템 핫스팟이 비행기 모드에서 막히는지
5. 호스트 백그라운드 1분 후 에코(선택 항목 12)
6. **호스트 화면 끄기(전원 버튼)** — plan §3 M0 (8)의 "화면 끄고 켜기"가 호스트를 뜻한다면 절차서에 해당 단계가 없다. FGS와 Wi-Fi AP 절전의 실제 위험은 이쪽에 있다
7. 세션마다 자격 증명이 바뀌는지(두 번째 세션 SSID·비밀번호 비교)
8. 수정된 IP 선택(`0447e7e`)의 실기기 확인 — **아직 태그가 없어 설치할 APK가 없다**(v0.0.2 필요)

**절차서 품질(비개발자 기준)**: 전반적으로 명확하다. 준비물, 단계별 기대 화면, 실패할 때 할 일, 문제 해결 표, 복사해서 쓰는 결과표가 갖춰져 있다. 보완할 점:
- 회차 1의 결과표(`M0.md:80-97`)와 회차 요약표(`:124`)가 비어 있다. 결과가 에이전트의 서술형 기록으로만 남아 사용자 관찰(캡티브 시트, 공유 성공 여부)과 구분되지 않는다. 결과표 형식으로 채우고 출처(사용자 관찰 / 로그)를 표시한다.
- "VPN 앱을 끄고 시작" 단계를 추가한다(회차 1의 tun0 오선택 원인).
- 호스트 전원 버튼 화면 끄기 단계(위 6번)를 추가하고, 회차 2의 대상 빌드(`v0.0.2`)를 명시한다.
- `보안 컨텍스트`, `navigator.wakeLock`은 "표에 보이는 글자를 그대로 적기"라고 한 줄 덧붙이면 충분하다.

---

## 6. 총평과 권고

### 판정: **M0 완료 인정(조건부)**
plan §3 M0의 완료 기준은 "AC-00 통과"이고, 이는 실기기 증거로 충족됐다. 프로젝트 최대 리스크 R1이 해소되어 M1~M4 아키텍처를 그대로 진행할 수 있다. 빌드·테스트·Lint·서명 릴리스 파이프라인도 동작한다(직접 재실행으로 확인). 다만 plan이 적어 둔 사람 검증(잠금·복귀, 비행기 모드 OFF, 폴백)은 절반이 남았다. HotspotService의 수명 주기 결함 2건과 로그 상한 결함 2건은 **M4가 이 셸을 확장하기 전에** 고쳐야 한다. 심각 등급 결함은 없다.

### M4 전 상위 5개 조치
1. **HotspotService 수명 주기 정리**(S-1, S-2, S-3): 정지 후 늦게 온 콜백의 예약을 닫는다. "서비스 생존"과 "핫스팟 상태"를 분리해 토글·알림·화면 켜짐을 일관되게 만든다. 서버 기동과 정지를 직렬화한다. 각 경로에 대한 JVM 테스트(콜백 순서 시뮬레이션)를 추가한다.
2. **로그 상한을 바이트 기준으로 재설계**(L-1, L-2, L-3): 줄 길이와 총 바이트 상한, 게스트 전용 버퍼, 업로드 빈도 제한을 둔다. 공유는 짧은 요약 텍스트 + 파일(EXTRA_STREAM)로 보내고, `safeStart`에서 RuntimeException도 잡는다. 이 기준을 M4 `protocol`의 NP-09 계약과 Kotlin·Node 중계 공통 테스트로 옮긴다.
3. **release.yml 분리·강화**(R-1, R-4, R-5): 웹 빌드는 읽기 전용 잡으로, 서명 잡은 `persist-credentials: false` + 인증서 지문 고정으로 바꾼다. alias는 Variables로 옮긴다. M4부터 웹 빌드가 실질 입력이 되므로 우선순위가 높다.
4. **IP 선택 경계 보완과 회귀 테스트, v0.0.2 태그**(I-1, I-2): 이름 점수 ≥ 0 조건과 tun0·p2p 테스트를 넣고 `v0.0.2`를 배포한다. 그다음 회차 2(잠금·복귀, B회차, 호스트 화면 끄기, 캡티브 시트, C회차)를 진행해 결과표를 채운다.
5. **비밀 보관 방식 수정**(K-1): `secrets/README.md`에서 평문 비밀번호를 지우고 백업 경로를 키와 비밀번호로 나눈다. `.gitignore`에 `android/.kotlin/` 등을 추가한다.

### plan.md / spec.md로 돌려보낼 것
- **spec NP-09**: "64KB"를 **UTF-8 바이트**로 명시하고, 호스트 보관 상한을 "게스트 로그 전용 2,000줄 + 줄당 N자 + 총 M바이트"로 구체화한다.
- **spec NF-04**: "폴링 없음"과 IP 감시가 충돌한다. 이벤트 기반(ConnectivityManager)으로 하거나 예외를 명시한다. 하트비트 25초와 Ktor `pingPeriod`(현재 15초)를 하나로 정한다.
- **spec FR-02**: "주소만 표시" 폴백에는 런타임 권한이 필요 없음을 명시한다(M-2).
- **spec NP-08**: "빌드 검사로 보장"의 구체 수단(예: 소스·APK 문자열 검사 스크립트, 허용 목록 = 자기 주소)을 plan §5 CI 게이트에 넣는다. 현재는 페이지 HTML 정규식 하나뿐이다.
- **spec NF-06**: "주소만 표시" 모드에서는 서버가 집이나 공용 LAN 전체에 열린다는 점과 M4 세션 토큰의 적용 범위(`/ws` 접속 인증)를 명시한다.
- **plan §3 M0 / M5**: 사람 검증에 "호스트 전원 버튼 화면 끄기"와 "VPN 끄기"를 명시한다. 회차 기록은 결과표 형식으로 남긴다는 규칙을 둔다.
- **plan §1.8 / AGENTS 표**: `kotlinx-coroutines`(Ktor 전이, 직접 사용)를 명시적으로 선언하거나 표에 근거를 추가한다. Dependabot 쿨다운을 명시 설정한다.
- **plan §5**: 릴리스 잡 분리(웹 빌드 읽기 전용 → 서명), `versionCode` 산정 규칙(태그 기반), 인증서 지문 고정을 적는다.
- **tech-stack.md "열린 항목"**: swlan0, `T:WPA` ↔ WPA3_SAE_TRANSITION, 10/8 대역, 2.4GHz 채널 1을 "확인됨(회차 1)"으로 갱신하고, VPN(tun0) 간섭을 리스크 R3에 덧붙인다.
