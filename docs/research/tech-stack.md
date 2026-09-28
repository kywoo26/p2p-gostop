# 기술 스택 검증 (tech-stack.md)

- 작성일: 2026-09-28
- 범위: Android 16 호스트(LocalOnlyHotspot + 내장 HTTP/WebSocket 서버 + WebView) ↔ iPhone(iOS 26.5) Safari 웹 클라이언트, 인터넷 없음
- 근거 수준 표기: **확인**(공식 문서, 레지스트리, AOSP 소스로 직접 확인) / **미확인**(공식 근거 미확보, 실기기나 추가 조사 필요) / **추론**
- AOSP 소스는 android.googlesource.com이 조사 시점에 503을 반환해 **LineageOS 23.2(Android 16 QPR2 기반) GitHub 미러**로 확인했다. OEM(삼성 등) 빌드는 다를 수 있다.

## 요약

1. **LOHS SSID/비밀번호는 일반 앱이 정할 수 없다.** Android 16에서 `startLocalOnlyHotspotWithConfiguration` + `SoftApConfiguration.Builder`가 공개됐지만, AOSP 구현상 일반 앱의 config는 **밴드(채널)만 반영**되고 SSID(`AndroidShare_####`)와 15자 비밀번호는 **매 시작마다 무작위**로 생성된다. → 세션마다 Wi-Fi QR을 새로 보여 주는 흐름으로 설계.
2. **게이트웨이 IP는 고정이 아니다**(192.168.0.0/16 등에서 무작위 /24). → `NetworkInterface` 순회로 찾아 URL QR 생성.
3. **비행기 모드 + LOHS는 AOSP상 가능하나 삼성 One UI 7+는 시스템 핫스팟을 비행기 모드에서 막는다는 보고**가 있다. LOHS도 막히는지는 미확인. **가장 큰 위험이며, 실기기 확인이 최우선.**
4. iPhone Safari에서 `http://192.168.x.y`는 **보안 컨텍스트가 아니다**(WebKit 소스 확인). Wake Lock, Service Worker(오프라인), Web Share, `crypto.subtle`/`randomUUID`를 쓸 수 없다 → 재접속/재동기화 설계가 필수. Safari는 로컬 네트워크 권한 프롬프트 대상이 아니다(TN3179).
5. 서버는 **Ktor 3.6.0 + CIO**, 셸은 **Activity + WebView(Compose 불필요)**, 웹은 **Vite 8 + Svelte 5 + TypeScript**, 빌드는 **cimg/android + GitHub Actions**.

## 1. Android LocalOnlyHotspot (LOHS)

### 1.1 API 개요와 권한

| 항목 | 내용 | 출처 |
|---|---|---|
| 기본 API | `WifiManager.startLocalOnlyHotspot(LocalOnlyHotspotCallback, Handler)` (API 26+). 인터넷 없는 핫스팟. 콜백 `onStarted(LocalOnlyHotspotReservation)`에서 `getSoftApConfiguration()`으로 SSID, 보안 유형, 비밀번호를 받는다. 이 정보를 사용자에게 전달하는 것은 앱의 몫이다. | [WifiManager 레퍼런스](https://developer.android.com/reference/android/net/wifi/WifiManager#startLocalOnlyHotspot(android.net.wifi.WifiManager.LocalOnlyHotspotCallback,%20android.os.Handler)) |
| 신규 API (Android 16) | `startLocalOnlyHotspotWithConfiguration(SoftApConfiguration, Executor, LocalOnlyHotspotCallback)` **API 36에서 공개 API로 추가**. `CHANGE_WIFI_STATE` + `NEARBY_WIFI_DEVICES` 필요. 이 방식으로 켠 핫스팟은 다른 앱의 기본 LOHS와 공존하지 않는다(먼저 요청한 쪽이 이김). | 같은 페이지 |
| 권한 (targetSdk 33+) | `CHANGE_WIFI_STATE` + `NEARBY_WIFI_DEVICES`(런타임 권한, "주변 기기" 그룹). 위치 권한 불필요. 매니페스트에 `android:usesPermissionFlags="neverForLocation"` 권장. | [LOHS 가이드(2026-09-16 갱신)](https://developer.android.com/develop/connectivity/wifi/localonlyhotspot), [Wi-Fi 권한](https://developer.android.com/develop/connectivity/wifi/wifi-permissions) |
| 권한 (targetSdk 32 이하) | `CHANGE_WIFI_STATE` + `ACCESS_FINE_LOCATION` + **위치 서비스 켜짐** 필수. 하위 호환용으로 `ACCESS_FINE_LOCATION`에 `android:maxSdkVersion="32"`. | 같은 곳, AOSP `WifiServiceImpl.startLocalOnlyHotspot` |
| 포그라운드 조건 | AOSP 코드상 **호출 시점에 앱이 포그라운드가 아니면 `ERROR_INCOMPATIBLE_MODE`** 반환. 시스템 테더링 핫스팟이 켜져 있어도 `ERROR_INCOMPATIBLE_MODE`. 관리자 정책(`DISALLOW_CONFIG_TETHERING`)이면 `ERROR_TETHERING_DISALLOWED`. | [LineageOS 23.2(Android 16 QPR2) WifiServiceImpl.java](https://github.com/LineageOS/android_packages_modules_Wifi/blob/lineage-23.2/service/java/com/android/server/wifi/WifiServiceImpl.java) (AOSP 미러. android.googlesource.com은 조사 시점에 503) |

권장 매니페스트 조각:

```xml
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES"
    android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"
    android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

### 1.2 SSID/비밀번호를 앱이 정할 수 있는가 → **일반 앱은 불가 (무작위 자격 증명)**

- `SoftApConfiguration.Builder`는 API 36에서 공개됐고(`Builder()`, `setChannels()`는 API 36, `setWifiSsid()`/`setPassphrase()`/`setBssid()`는 **36.1 = Android 16 QPR2**), 겉보기엔 SSID/비밀번호를 지정할 수 있어 보인다. [SoftApConfiguration.Builder 레퍼런스(2026-08-03 갱신)](https://developer.android.com/reference/android/net/wifi/SoftApConfiguration.Builder)
- 그러나 **AOSP 구현을 확인한 결과**, Android 16(B)에서 `publicBandsForLohs` 플래그가 켜진 경우 요청자 우선순위가 `PRIORITY_SYSTEM`(시스템/특권 앱) 이상일 때만 custom config가 "exclusive"로 취급된다. 일반 포그라운드 앱(`PRIORITY_FG_APP`)이 넘긴 config는 **채널/밴드만 반영**되고, SSID는 `AndroidShare_<난수>` 형태로, 비밀번호는 **매 시작마다 15자 무작위**(`23456789abcdefghijkmnpqrstuvwxyz`에서 생성)로 덮어쓴다. 보안 유형은 기기가 WPA3를 지원하면 `WPA3_SAE_TRANSITION`, 아니면 `WPA2_PSK`. 또한 LOHS는 **자동 종료(auto shutdown)가 꺼진 상태**로 만들어진다.
  - 근거: `WifiServiceImpl.LohsSoftApTracker.startForFirstRequestLocked()`의 `mIsExclusive = (customConfig != null) && currentWsPriority >= PRIORITY_SYSTEM`, `WifiApConfigStore.generateLocalOnlyHotspotConfig()`의 non-exclusive 분기 ([WifiApConfigStore.java](https://github.com/LineageOS/android_packages_modules_Wifi/blob/lineage-23.2/service/java/com/android/server/wifi/WifiApConfigStore.java), [WorkSourceHelper.java](https://github.com/LineageOS/android_packages_modules_Wifi/blob/lineage-23.2/service/java/com/android/server/wifi/util/WorkSourceHelper.java))
  - 주의: 이것은 AOSP(LineageOS 미러) 코드 기준이다. 삼성 One UI 등 OEM 빌드는 Wi-Fi 프레임워크를 수정하므로 **실기기에서 `reservation.softApConfiguration`을 로그로 찍어 확인**해야 한다.
- 결론: 앱은 `onStarted`에서 받은 SSID/비밀번호로 **매 세션 QR을 새로 만들어 보여 주는** 흐름을 전제로 설계한다. iPhone은 세션마다 새 네트워크(`AndroidShare_xxxx`)를 저장하게 되지만 기능상 문제는 없다.

### 1.3 밴드(2.4/5GHz)

- 기본 LOHS는 `BAND_2GHZ`(프레임워크가 채널 자동 선택). API 36부터 일반 앱도 `startLocalOnlyHotspotWithConfiguration` + `Builder().setChannels(SparseIntArray{BAND_5GHZ→0})`로 **밴드 선택 가능**(위 AOSP 코드에서 non-exclusive라도 `setChannels(customConfig.getChannels())`는 반영됨). 2개 밴드 동시(브리지 AP)는 `isBridgedApConcurrencySupported()` 확인 필요.
- 5GHz는 국가 코드에 따라 가용 채널이 정해진다. 비행기 모드에서는 셀룰러 기반 국가 코드를 못 얻을 수 있어 `ERROR_NO_CHANNEL` 가능성이 있다(추론, 미검증). **기본값 2.4GHz, 5GHz는 옵션**으로 두고 실패 시 2.4GHz로 폴백하는 것이 안전하다. 두 기기 거리 1m 이내라 2.4GHz로 충분하다.

### 1.4 비행기 모드

- AOSP `ActiveModeWarden`에는 SoftAP 시작 시 비행기 모드 검사가 없고, "SoftAp was enabled during airplane mode"라는 처리 분기가 있다. 즉 **AOSP 기준으로는 비행기 모드 중에도 LOHS 시작 가능**(Wi-Fi STA가 꺼져 있어도 AP 모드 매니저 단독으로 기동). [ActiveModeWarden.java](https://github.com/LineageOS/android_packages_modules_Wifi/blob/lineage-23.2/service/java/com/android/server/wifi/ActiveModeWarden.java)
- 단, **삼성 One UI 7 이후 시스템 "모바일 핫스팟"은 비행기 모드에서 켤 수 없다는 사용자 보고**가 있다(S25, 2025-02, adb 우회도 실패. OnePlus 13에서는 동작). LOHS가 같은 제한을 받는지는 공개 자료가 없어 **미검증**. [XDA 스레드](https://xdaforums.com/t/airplane-mode-disables-mobile-hotspot-no-workaround.4717988/), [Samsung Community](https://us.community.samsung.com/t5/Tips/Airplane-mode/td-p/3282684)
- 비행기 모드를 켠 뒤 Wi-Fi를 다시 켜는 것 자체는 Android 표준 기능이며(기기가 "비행기 모드에서 Wi-Fi 유지"를 기억), 핫스팟 AP 동작과는 별개다. [Pixel 도움말](https://support.google.com/pixelphone/answer/12639358?hl=en)
- **최우선 실기기 검증 항목**: 사용자 Android 16 기기에서 (1) 비행기 모드 ON → (2) Wi-Fi ON → (3) LOHS 시작 → (4) iPhone 접속.

### 1.5 핫스팟 게이트웨이 IP 얻기

- LOHS 예약 객체와 `SoftApConfiguration`에는 **IP 정보가 없다**. 인터페이스/IP를 알려 주는 `TetheringManager` 콜백, `registerSoftApCallback`은 시스템 API다.
- 과거의 고정 IP(`192.168.43.1`)는 더 이상 보장되지 않는다. 최신 테더링 모듈의 `PrivateAddressCoordinator`는 `192.168.0.0/16`에서 무작위 /24를 고르며, 기능 플래그에 따라 `172.16.0.0/12`, `10.0.0.0/8`에서도 고른다(자주 쓰이는 192.168.0/1/88/100.x는 회피). [PrivateAddressCoordinator.java](https://github.com/LineageOS/android_packages_modules_Connectivity/blob/lineage-23.2/staticlibs/device/com/android/net/module/util/PrivateAddressCoordinator.java)
- 실무 방법: `onStarted` 직후(필요 시 수백 ms 재시도) `java.net.NetworkInterface.getNetworkInterfaces()`를 순회해 **up 상태이고 loopback이 아니며 사설 IPv4를 가진 인터페이스**를 찾는다. 이름은 기기마다 `wlan1`, `ap0`, `swlan0`(삼성) 등으로 다르다. 비행기 모드에서는 셀룰러/STA 인터페이스가 없으므로 후보가 사실상 하나다. 서버는 `0.0.0.0`에 바인딩하고, 찾은 IP로 `http://<ip>:<port>/` QR을 만든다.
- 대안인 mDNS(`.local`) 광고는 Android 17 targetSdk 37부터 로컬 네트워크 권한 대상이고 iOS 쪽 해석도 불확실하므로 쓰지 않는다.

### 1.6 수명 주기

- `LocalOnlyHotspotReservation.close()`를 부르거나 **요청한 프로세스가 죽으면** 핫스팟이 내려간다(요청 추적, binder death). 사용자가 설정에서 끄거나 긴급 모드 등으로도 멈출 수 있고 `onStopped()`가 온다. [WifiManager 레퍼런스](https://developer.android.com/reference/android/net/wifi/WifiManager#startLocalOnlyHotspot(android.net.wifi.WifiManager.LocalOnlyHotspotCallback,%20android.os.Handler))
- 시작은 포그라운드 Activity에서만 가능하다(1.1). 화면이 꺼지거나 앱이 백그라운드로 가도 프로세스와 서버를 유지하려면 **포그라운드 서비스가 사실상 필수**다.
  - 타입: `connectedDevice`(`FOREGROUND_SERVICE_CONNECTED_DEVICE`, 전제 조건으로 `CHANGE_WIFI_STATE` 선언이면 충족). 시간 제한 없는 타입이다(`dataSync`/`mediaProcessing`/`shortService`와 달리). [FGS 타입 문서](https://developer.android.com/develop/background-work/services/fgs/service-types)
  - Android 13+ 알림 권한(`POST_NOTIFICATIONS`) 요청 권장(거부돼도 FGS는 동작하나 알림이 안 보임).
  - Doze 중 네트워크 제한은 FGS가 있는 앱에는 적용되지 않는다(일반 원칙). 게임 중에는 `FLAG_KEEP_SCREEN_ON`으로 화면을 켜 두는 것이 가장 간단하다.

### 1.7 Android 16(API 36) 관련 변경 사항

| 변경 | 영향 | 출처 |
|---|---|---|
| `startLocalOnlyHotspotWithConfiguration`, `SoftApConfiguration.Builder` 공개 | 밴드 선택 가능. SSID/비밀번호는 일반 앱에 반영 안 됨(1.2). | 위 레퍼런스 |
| Android 16 QPR2 = SDK **36.1** (2025-12-02 출시). `Build.VERSION.SDK_INT_FULL >= VERSION_CODES_FULL.BAKLAVA_1`로 확인 | `setWifiSsid`/`setPassphrase`는 36.1 API. 쓰더라도 위 이유로 효과 없음. | [Android 16 QPR2 출시 블로그](https://android-developers.googleblog.com/2025/12/android-16-qpr2-is-released.html) |
| 로컬 네트워크 보호(LNP) | Android 16에선 opt-in 테스트만. **Android 17 + targetSdk 37부터 LAN 인바운드/아웃바운드 TCP 모두 `ACCESS_LOCAL_NETWORK` 필요**(NEARBY_DEVICES 그룹이라 `NEARBY_WIFI_DEVICES` 허용 시 사전 허용). **targetSdk 36 유지 시 영향 없음.** 루프백(127.0.0.1)은 LAN이 아님. | [Local network permission](https://developer.android.com/privacy-and-security/local-network-permission), [Android 16 동작 변경](https://developer.android.com/about/versions/16/behavior-changes-16) |
| Edge-to-edge opt-out 불가 (targetSdk 36) | WebView 화면에 인셋 처리 필요(CSS `env(safe-area-inset-*)` + `viewport-fit=cover`, 또는 네이티브 패딩). | [동작 변경(targetSdk 36)](https://developer.android.com/about/versions/16/behavior-changes-16) |
| 대화면(sw≥600dp)에서 방향 고정 무시 | 폴더블/태블릿에서 세로 고정이 풀린다. 웹 UI가 반응형이면 문제 없음. | 같은 곳 |
| 예측형 뒤로 가기 migration | WebView 뒤로 가기 처리 시 `OnBackPressedCallback` 사용. | 같은 곳 |
| 16KB 페이지 | Ktor/순수 Kotlin은 네이티브 so가 없어 무관. 네이티브 라이브러리 추가 시 주의. | [모든 앱 대상 동작 변경](https://developer.android.com/about/versions/16/behavior-changes-all) |

### 1.8 대안: 사용자가 시스템 "모바일 핫스팟"을 직접 켜는 방식

| 항목 | LOHS (앱이 켬) | 시스템 테더링 핫스팟 (사용자가 켬) |
|---|---|---|
| 조작 | 앱 버튼 하나. 권한 1회 허용. | 설정 → 핫스팟 켜기. 앱은 프로그래밍으로 켤 수 없음(`startTethering`은 시스템 API). |
| SSID/비밀번호 | 매번 무작위(1.2). 매 세션 Wi-Fi QR 필요. | 사용자가 고정 가능. iPhone이 한 번 저장하면 다음부터 자동 접속. Wi-Fi QR은 최초 1회만. |
| 통신사 제한 | 테더링 entitlement 검사 대상 아님. | 일부 통신사/요금제에서 테더링 제한 가능. |
| 비행기 모드 | AOSP상 가능, OEM 미검증. | 삼성 One UI 7+에서 불가 보고. Pixel은 가능하다는 보고가 많음(미검증). |
| 자동 꺼짐 | LOHS는 auto shutdown 꺼짐. | "연결된 기기 없으면 자동 끄기" 설정(기본 켜짐인 경우 많음). |
| IP | 무작위 서브넷 → NetworkInterface로 탐색. | 동일(무작위). |
| 수명 | 앱 프로세스에 종속. | 앱과 독립. |

권장: **LOHS를 기본 경로**로 구현하고, 앱이 테더링 인터페이스(사설 IPv4)를 감지하면 "이미 켜진 핫스팟 사용" 모드로도 동작하도록 한다(서버는 어차피 `0.0.0.0` 바인딩). 추가 비용이 거의 없고 LOHS가 OEM에서 막힐 때 우회로가 된다.

## 2. iPhone(iOS 26.5) 접속 경로와 Safari

참고: Safari 27 / iOS 27이 2026-09-17에 출시됐다([WebKit Safari 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)). 상대방이 27.x일 수도 있지만 26.1~27.0 릴리스 노트에서 아래 결론을 바꾸는 내용은 찾지 못했다.

### 2.1 Wi-Fi QR

| 항목 | 내용 | 상태 |
|---|---|---|
| 지원 | iOS 11부터 기본 카메라가 `WIFI:` QR을 인식한다. Apple 가이드는 QR 스캔 일반만 다루고 Wi-Fi 형식은 따로 언급하지 않는다. | 커뮤니티 확인 ([Apple Dev Forums 97060](https://developer.apple.com/forums/thread/97060), [Apple QR 가이드](https://support.apple.com/guide/iphone/scan-a-qr-code-iphe8bda8762/ios)) |
| 형식 규격 | WPA3 Specification v3.5 §7: `WIFI:[T:..;][R:..;]S:..;[H:true;][I:..;][P:..;][K:..;];`. `T`에 정의된 값은 `WPA`뿐이며 **WPA3 Transition Mode(SAE/PSK)도 `T:WPA`로 표기**한다. 모르는 필드는 무시한다. `H:`는 숨김 SSID일 때만 쓰므로 생략. | 확인 ([WPA3 Spec v3.5](https://www.wi-fi.org/system/files/WPA3%20Specification%20v3.5.pdf)) |
| 주의 | **`T:SAE`나 `T:WPA3`는 쓰지 말 것.** iOS가 인식하지 못했다는 보고가 있다(iOS 14/15). Android 자체 공유 QR은 `T:SAE;...;H:false`를 만들므로 그대로 따라 하면 안 된다. | 커뮤니티 ([Dev Forums 652510](https://developer.apple.com/forums/thread/652510), [stevetech](https://stevetech.me/posts/wifi-qr-codes-are-broken)) |
| 이스케이프 | 관례는 두 가지다. ZXing은 `\ ; , " :`를 백슬래시로 이스케이프하고, WPA3 규격은 퍼센트 인코딩을 쓴다. LOHS 자격 증명(SSID `AndroidShare_1000~9999`, 비밀번호 `[2-9a-z]` 15자)에는 특수문자가 없으므로 **이스케이프가 필요 없다**. 사용할 문자열: `WIFI:T:WPA;S:AndroidShare_1234;P:<pass>;;` | 확인 |
| QR 2개 | 하나의 QR에 Wi-Fi와 URL을 함께 담을 수 없다. **QR 1은 Wi-Fi, QR 2는 `http://<IP>:8080/`** 로 만든다. URL QR은 카메라가 링크 배너를 띄우고 Safari로 연다. | 확인(규격 문법) |

### 2.2 인터넷 없는 망에 접속할 때

- LOHS에서는 `captive.apple.com` 프로브가 응답을 받지 못한다. 따라서 **캡티브 포털(CNA) 시트가 뜨지 않고**, 설정의 SSID 아래에 "인터넷 연결 없음"이 표시되며 **연결은 유지된다**. 사용자는 QR의 "연결"만 누르면 된다. [Apple 111786](https://support.apple.com/en-us/111786)에서 이 라벨을 확인했고, 연결 유지는 커뮤니티 보고([ESP32 soft-AP 사례](https://www.esp32.com/viewtopic.php?t=9378))와 추론에 근거한다.
- 시트가 뜨는 경우, Apple 문서상 **"취소"를 누르면 연결이 끊기고 "인터넷 없이 사용"을 누르면 유지된다**([Apple 102554](https://support.apple.com/en-us/102554), 확인). intend.md의 "인터넷 없이 사용" 단계는 시트가 뜰 때만 해당한다. 안내 그림에는 "시트가 뜨면 반드시 '인터넷 없이 사용'"을 넣는다.
- 비행기 모드라 셀룰러로 넘어갈 곳이 없다. Wi-Fi Assist는 현재 "Connectivity Assist"라는 이름이다([Apple 127686](https://support.apple.com/en-us/127686)).
- 로컬 주소는 IP 리터럴이라 DNS가 필요 없다. 반면 **CDN, 웹폰트 같은 외부 리소스는 DNS 타임아웃까지 멈춘다**. 모든 자산을 번들해서 내장 서버에서 서빙해야 한다(추론).
- 세션마다 SSID가 새로 생기므로 iPhone의 "알려진 네트워크"에 항목이 계속 쌓인다(추론).

### 2.3 로컬 네트워크 권한

- **Safari는 로컬 네트워크 권한 프롬프트 대상이 아니다.** TN3179 원문: "Traffic originating from WKWebView, SFSafariViewController, and Safari doesn't require local network access." ([TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy), 확인)
- WebKit도 Chrome식 Local Network Access(LNA)를 구현하고 있지만 아직 출시되지 않았다. `LocalNetworkAccessEnabled` 플래그의 기본값은 false이고, 프롬프트 PR은 아직 열려 있다([PR #72725](https://github.com/WebKit/WebKit/pull/72725), [#74003](https://github.com/WebKit/WebKit/pull/74003), [#74740](https://github.com/WebKit/WebKit/pull/74740)). 출시되더라도 이 계획은 영향이 없을 가능성이 높다. 검사는 더 사설인 주소 공간으로 요청할 때만 걸리는데, 이 계획은 페이지와 WebSocket이 같은 로컬 origin이기 때문이다(병합된 로직 기반 추론).

### 2.4 Safari의 http와 ws 처리

- **HTTPS 우선 시도**: Safari 18.2부터 HTTPS를 먼저 시도하고, 실패하면 조용히 HTTP로 돌아간다. 선택 설정 "안전하지 않은 연결 경고"(Settings > Apps > Safari)는 **기본값이 꺼짐**이다([Apple 가이드](https://support.apple.com/guide/iphone/get-http-website-warnings-iphfba2ed790/ios), 확인).
  - WebKit 소스(`CachedResourceLoader.cpp`의 `shouldPerformHTTPSUpgrade`)를 보면 업그레이드 대상은 **메인 프레임 내비게이션뿐**이고 `ws://`는 업그레이드하지 않는다(확인).
  - QR로 연 IP URL이 업그레이드되는지는 문서화되지 않았다. 최악의 경우에도 TLS 시도가 빠르게 실패한 뒤 HTTP로 폴백하고, 경고 설정을 켠 사용자만 경고를 한 번 넘기면 된다(추론).
- `http` 페이지에서 `ws://`를 여는 것은 혼합 콘텐츠가 아니다.
- **보안 컨텍스트가 아니다**: W3C Secure Contexts와 WebKit `SecurityOrigin.cpp`는 https, 127.0.0.0/8, ::1, localhost만 신뢰할 수 있는 origin으로 본다. `192.168.x.y`, `10.x`, `172.16/12`는 제외된다(확인).
- WebKit IDL에서 `[SecureContext]`로 표시돼 있어 **이 origin에서는 undefined인 API**(확인):

| API | 영향 |
|---|---|
| `navigator.wakeLock` | 화면 자동 잠금을 막을 수 없다. Safari는 16.4+에서 지원하지만 http에서는 쓸 수 없다. |
| `navigator.share` / `canShare` | 공유 불가 |
| `navigator.serviceWorker`, `caches` | 오프라인 캐시/PWA 불가 |
| `crypto.subtle`, **`crypto.randomUUID()`** | 이를 쓰는 라이브러리가 조용히 깨진다. **`crypto.getRandomValues()`는 사용 가능.** commit-reveal 해시는 순수 JS SHA-256으로 구현하거나 서버(Android)에서 계산해야 한다. |
| `navigator.clipboard`, `storage`, `locks`, `mediaDevices`, `DeviceOrientation/Motion`, `AudioWorklet`, 배지 API, WebAuthn | 사용 불가 |

- 보안 컨텍스트와 **무관하게 iPhone에서 안 되는 것**: Vibration API(iOS Safari 27.2까지 미지원), iPhone의 요소 전체 화면(iPad만 지원), `screen.orientation.lock()`([caniuse vibration](https://caniuse.com/vibration), [caniuse fullscreen](https://caniuse.com/fullscreen)).
- **사용 가능한 것**: WebSocket, Web Audio(`AudioContext`, 사용자 제스처로 시작해야 함), `localStorage`. 단, origin(IP)이 세션마다 바뀌므로 저장 데이터는 사실상 세션 한정이다.

### 2.5 홈 화면 추가

- iOS 26에서는 홈 화면에 추가한 모든 사이트가 기본적으로 웹 앱으로 열린다([WebKit Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), 확인).
- 이 계획에서는 Service Worker가 없어 오프라인으로 동작하지 않고, IP가 매번 바뀌어 저장된 URL이 다음 세션에서 틀린다. **홈 화면 추가는 권장하지 않는다**(추론).

### 2.6 화면 잠금과 백그라운드

- iOS는 백그라운드로 간 프로세스를 곧 일시 중단한다. 웹 페이지는 백그라운드 시간을 요청할 수 없다([Dev Forums 716118](https://developer.apple.com/forums/thread/716118)).
- 잠금이나 탭 전환 시 소켓이 끊기거나 멈추고, `onclose`가 오지 않는 경우도 있다([WebKit 247943](https://bugs.webkit.org/show_bug.cgi?id=247943)).
- iOS 26.0의 WebSocket 회귀([WebKit 298616](https://bugs.webkit.org/show_bug.cgi?id=298616))는 HTTP/3 위 `wss://` 문제였고 26.1에서 수정됐다. 이 계획과는 무관하다.
- 대응:
  - `visibilitychange`(visible)와 `pageshow` 때 소켓을 무조건 새로 연다.
  - 앱 수준 ping/pong 타임아웃으로 멈춘 소켓을 감지한다.
  - 게임 상태의 기준은 Android 서버에 두고, 재접속하면 재동기화한다.
  - 자동 잠금은 "안 함"으로 바꾸도록 사용자에게 안내한다. 무음 루프 비디오(NoSleep) 트릭은 iOS 26에서 검증되지 않았다.

### 2.7 실기기 스모크 테스트 목록

1. 비행기 모드에서 Wi-Fi QR로 접속한 뒤 "인터넷 연결 없음" 표시와 연결 유지를 확인한다.
2. URL QR로 Safari를 열었을 때 경고 설정이 꺼진 상태와 켜진 상태 모두에서 http 로드를 확인한다.
3. 화면을 잠갔다 풀었을 때 WebSocket이 복구되는지 확인한다.
4. `typeof navigator.wakeLock === "undefined"`인지 확인한다.

## 3. Android 내장 서버

### 3.1 Ktor 3.x

| 항목 | 내용 | 출처 |
|---|---|---|
| 최신 안정 버전 | **3.6.0** (GitHub 릴리스 2026-09-18, Maven Central `io.ktor:ktor-server-core/-cio/-websockets` 3.6.0). 직전 안정 버전 3.5.2(2026-08-04). | [Maven Central](https://repo1.maven.org/maven2/io/ktor/ktor-server-cio/maven-metadata.xml), [GitHub Releases](https://github.com/ktorio/ktor/releases) |
| 엔진 플랫폼 | 공식 표의 서버 엔진 지원 플랫폼은 Netty/Jetty/Tomcat=JVM, **CIO=JVM, Native, GraalVM, JS, WasmJs**. Android는 서버 쪽 공식 지원 플랫폼으로 명시돼 있지 않다(클라이언트 CIO는 "Android 7.0+"로 명시). 다만 Ktor 변경 이력에 Android 서버 관련 수정이 꾸준히 있어 사실상 사용되고 있다. | [Server engines](https://ktor.io/docs/server-engines.html), [Client engines](https://ktor.io/docs/client-engines.html), [CHANGELOG](https://github.com/ktorio/ktor/blob/main/CHANGELOG.md) |
| Netty vs CIO | **CIO 사용.** Netty는 Android에서 `VerifyError`(3.3.0부터, KTOR-8916), 고부하 예외(KTOR-6195) 등 이력이 있고 의존성이 크다. CIO는 순수 Kotlin 코루틴 기반이라 가볍다. HTTP/2는 불필요. | CHANGELOG, [KTOR-6195](https://youtrack.jetbrains.com/issue/KTOR-6195) |
| WebSockets | `install(WebSockets) { pingPeriod = 15.seconds; timeout = 15.seconds; maxFrameSize = ... }` 후 `webSocket("/ws") { ... }`. CIO 엔진에서 지원. | [Server WebSockets](https://ktor.io/docs/server-websockets.html) (Context7 `/websites/ktor_io`) |
| 정적 파일 | `staticResources()`(클래스패스), `staticFiles()`(파일시스템), `staticZip()`, `preCompressed()`. APK의 `assets/`는 클래스패스가 아니므로 **`context.assets.open(path)`로 읽어 `respondBytes`/`respondOutputStream` 하는 20줄 내외 커스텀 라우트를 권장**(MIME은 `ContentType.defaultForFilePath`). 웹 빌드를 `src/main/resources/web`에 넣고 `staticResources("/", "web")`를 쓰는 방법도 가능하나 Android 클래스로더 동작을 실기기에서 확인해야 한다. | [Serving static content](https://ktor.io/docs/server-static-content.html) |
| minSdk | Ktor CIO 클라이언트 기준 Android 7.0(API 24)+. 3.5.0에서 Android 7 크래시(KTOR-9607) 수정 이력. 이 프로젝트는 대상이 Android 16이고 LOHS 권한 모델을 단순화하려면 **minSdk 33(Android 13) 이상 권장**(위치 권한 분기 제거). | CHANGELOG |
| R8/ProGuard | 알려진 이슈: 릴리스 빌드 서버 시작 시 "Array has more than one element"(KTOR-7298, 수정됨), `java.lang.management.ManagementFactory` 누락(KTOR-8714, 수정됨), 3.2.0의 R8 회귀(3.2.1에서 수정). R8이 `missing_rules.txt`를 생성하면 `-dontwarn`으로 추가. **개인 사이드로드 앱이므로 `isMinifyEnabled = false`로 시작하는 것을 권장**(APK 크기 차이 수 MB 수준, 디버깅 리스크 제거). | CHANGELOG, [KTOR-7814](https://youtrack.jetbrains.com/issue/KTOR-7814) |
| 스레드 | 서버는 포그라운드 서비스에서 `embeddedServer(CIO, host = "0.0.0.0", port = 8080) {...}.start(wait = false)`. 메인 디스패처에서 블로킹 금지(KTOR-6803 참고). | CHANGELOG |

### 3.2 대안 비교

| 후보 | 최신 | 상태 | 평가 |
|---|---|---|---|
| **Ktor (CIO)** | 3.6.0 (2026-09) | 활발(JetBrains) | 코루틴, WebSocket 내장, 테스트용 `testApplication`. JVM에서 같은 서버 코드를 단위 테스트 가능. **권장.** |
| NanoHTTPD | 2.3.1 (2016-08, 마지막 커밋 2019-07) | 사실상 중단 | 작고 Android 친화적이지만 WebSocket 모듈(nanohttpd-websocket)이 오래되어 유지보수 리스크. |
| Javalin | 7.2.3 (2026-08) | 활발 | Jetty 12 기반, JDK 17+ 가정. Android(ART)에서 Jetty 전체 구동은 비권장. 부적합. |

## 4. Android WebView (호스트 측 게임 화면)

| 항목 | 내용 | 출처 |
|---|---|---|
| 평문 HTTP | targetSdk 28+는 기본 차단. `usesCleartextTraffic` 속성은 targetSdk 38부터 무시 예정이므로 **Network Security Config**로 `localhost`, `127.0.0.1`만 허용한다. Android 17(API 37)+에서는 localhost 암묵 허용이 추가되지만 targetSdk 36/Android 16에서는 명시가 필요하다. | [Network security config](https://developer.android.com/privacy-and-security/security-config), [application 요소](https://developer.android.com/guide/topics/manifest/application-element) |
| 보안 컨텍스트 | `http://127.0.0.1`은 웹 표준상 "potentially trustworthy"라 **WebView 안에서는 보안 컨텍스트**(Wake Lock 등 사용 가능). iPhone Safari의 `http://192.168.x.y`는 보안 컨텍스트가 아니다(2장 참고). | W3C Secure Contexts |
| JS 브리지 | 권장: `androidx.webkit`의 `WebViewCompat.addWebMessageListener(webView, "HostBridge", setOf("http://127.0.0.1:8080"), listener)`. 허용 origin 규칙을 강제하고 양방향(`JavaScriptReplyProxy`). `loadUrl` 전에 등록. `addJavascriptInterface`는 origin 제어가 없는 레거시. | [Native API access / JS bridge](https://developer.android.com/develop/ui/views/layout/webapps/native-api-access-jsbridge) |
| 브리지 용도 | 게임 통신은 iPhone과 똑같이 `ws://127.0.0.1:8080/ws`로 한다(코드 경로 단일화). 브리지는 핫스팟 시작/정보(SSID, 비밀번호, IP), 진동(`Vibrator`), 화면 켜짐 유지, 공유 같은 네이티브 기능에만 쓴다. | 설계 판단 |
| Compose 필요 여부 | **불필요.** 단일 `Activity` + `WebView` + 포그라운드 서비스로 충분하다. 핫스팟 안내, QR 표시, 권한 안내도 웹 UI(같은 Svelte 앱의 호스트 전용 화면)에서 그리고 브리지로 네이티브 호출을 한다. 권한 요청 다이얼로그는 네이티브가 띄우므로 Compose 없이 `ActivityResultContracts.RequestMultiplePermissions`로 처리. Compose는 네이티브 설정 화면이 커질 때 도입해도 늦지 않다. | 설계 판단 |
| 기타 | `settings.javaScriptEnabled = true`, `domStorageEnabled = true`, `mediaPlaybackRequiresUserGesture = false`(효과음), edge-to-edge 인셋 처리, 뒤로 가기 `OnBackPressedCallback`. | |

Network Security Config 예시(`res/xml/network_security_config.xml`):

```xml
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>
```

WebView는 앱 내부에서 서버에 접속하므로 핫스팟 IP가 아니라 루프백을 쓴다. iPhone은 핫스팟 IP로 같은 서버에 접속한다.

## 5. 툴체인 최신 안정 버전 (2026-09-28 레지스트리 직접 조회)

| 도구 | 최신 안정 | 날짜 | 확인 경로 / 비고 |
|---|---|---|---|
| Android Gradle Plugin | **9.4.1** (9.5.0은 alpha07) | 2026-09-18 | [Google Maven](https://dl.google.com/dl/android/maven2/com/android/tools/build/gradle/maven-metadata.xml). AGP 9.4: 최대 API 37, **Gradle 최소 9.6.0**, Build Tools 최소 36.0.0, **JDK 최소 17**. [AGP 릴리스 노트](https://developer.android.com/build/releases/gradle-plugin) |
| AGP 9 내장 Kotlin | AGP 9.0+는 Kotlin 지원 내장. `org.jetbrains.kotlin.android` 플러그인을 적용하면 오히려 빌드 실패. 기본 KGP는 2.2.10이므로 Kotlin 2.4.20을 쓰려면 최상위 buildscript classpath에 KGP 추가. `kapt` 불가(KSP 사용), `kotlinOptions{}` → `kotlin.compilerOptions{}` | | [Migrate to built-in Kotlin](https://developer.android.com/build/migrate-to-built-in-kotlin) |
| Gradle | **9.8.0** | 2026-09-24 | [services.gradle.org](https://services.gradle.org/versions/current) |
| Kotlin | **2.4.20** (2.5.0-Beta1은 프리릴리스) | 2026-09-07 | [Maven Central](https://repo1.maven.org/maven2/org/jetbrains/kotlin/kotlin-gradle-plugin/maven-metadata.xml) |
| JDK | **Temurin 21** 권장 (AGP 최소 17) | | cimg/android, GitHub 러너 모두 21 보유 |
| compileSdk / targetSdk | **compileSdk 36, targetSdk 36** (요구 사항 기준). Android 17(API 37)은 2026-06 안정 출시, SDK platform 37.x 안정 채널에 있음. compileSdk 37로 올려도 되지만 **targetSdk는 36 유지** 권장(targetSdk 37부터 LAN 인바운드에 `ACCESS_LOCAL_NETWORK` 필요, 1.7절). | | [Android 17 발표](https://developer.android.com/about/versions/17/blog-release), SDK repository2-3.xml |
| cmdline-tools / build-tools | 23.0 / 37.0.0 | 2026-08-19 / 2026-03-26 | [repository2-3.xml](https://dl.google.com/android/repository/repository2-3.xml) |
| androidx.webkit | **1.17.1** | 2026-09-23 | Google Maven. `addWebMessageListener` |
| androidx.activity / core-ktx | 1.13.0 / 1.19.1 | | Google Maven |
| Compose BOM | 2026.09.00 | 2026-09-09 | 사용 안 함(4장) |
| Ktor | **3.6.0** | 2026-09-18 | 3.1절 |
| ZXing core | **3.5.4** | 2025-11-11 | Maven Central. 생성만 필요하면 core만. `zxing-android-embedded`(4.3.0, 2021)는 사실상 미유지·불필요. QR을 웹 UI에서 그리면 Android 쪽 QR 라이브러리 자체가 불필요. |
| Node.js | **24.21.0 LTS "Krypton"** | 2026-09-07 | [nodejs.org](https://nodejs.org/dist/index.json). Vite 8: `^20.19 \|\| >=22.12`, Vitest 5: `^22.12 \|\| ^24 \|\| >=26`, Playwright: 22/24/26 |
| Vite | **8.3.1** | 2026-09-24 | npm |
| TypeScript | **7.0.2** (Go 네이티브 컴파일러). 6.x 마지막은 6.0.3 | 2026-07-08 | npm. svelte-check 등 TS JS API 의존 도구의 TS 7 호환은 **미확인** → 문제 시 `typescript@6.0.3` 고정 |
| Svelte | **5.57.1**, `@sveltejs/vite-plugin-svelte` **7.3.1**(peer: vite ^8, svelte ^5.46.4) | 2026-09 | npm |
| SolidJS / Preact | 1.9.15 / 10.29.8 | 2026-08 | npm. 대안. Svelte는 `transition`/`animate`/`flip` 내장이 카드 애니메이션에 유리해 우선 |
| Vitest | **5.0.2** | 2026-09-25 | npm |
| Playwright | **1.63.0** (Chromium 153, Firefox 155, **WebKit 26.6** 번들) | 2026-09-04 | npm, GitHub 릴리스. WebKit은 Ubuntu 22.04/24.04/26.04, Debian 12/13, WSL, Docker에서 헤드리스 동작 |
| 웹 QR | **`uqr` 0.1.3** (무의존, ~4.4KB gzip, SVG 출력) / `qrcode-generator` 2.0.4 / `qrcode` 1.5.4(의존성 多, 2024-08 이후 정체) | | npm |

Playwright WebKit과 iOS Safari의 거리 ([Playwright browsers 문서](https://playwright.dev/docs/browsers)):
- WebKit main 브랜치 소스에서 빌드하며 "Apple Safari에 반영되기 전인 경우가 많다". 브랜드 Safari와는 패치 때문에 동일하지 않고, OS별로 기능 차이(예: 미디어 코덱)가 있으며 "가장 Safari에 가까운 경험은 mac에서 WebKit 실행"이라고 명시한다.
- `devices['iPhone 17']` 등 디스크립터(iPhone 15~17e 존재)는 뷰포트·UA·터치만 흉내 낸다. iOS의 백그라운드 탭 정지, 화면 잠금 시 소켓 끊김, 주소창에 따른 뷰포트 변화, 캡티브/네트워크 동작은 재현 불가.
- 결론: CSS/JS 호환성의 1차 필터로는 유용, 최종 확인은 실제 iPhone.

## 6. Docker 이미지

| 이미지 | 최신 태그 | 크기(압축) | 평가 |
|---|---|---|---|
| `mcr.microsoft.com/playwright` | **`v1.63.0-noble`** (jammy, resolute=26.04 변형) | 약 956MB (amd64) | 웹 E2E. npm `@playwright/test` 버전과 태그를 정확히 맞출 것. |
| `cimg/android` (CircleCI) | **`2026.08.1`**, `-node`, `-browsers`, `-ndk` (2026-08-03) | 3.4GB / node 3.5GB / browsers 3.8GB / ndk 5.0GB | platforms 34~37.2, build-tools 35~37, Gradle 9.6.1, JDK 8/17/21(기본 21). **APK 빌드용 1순위.** `-node` 변형이면 웹 빌드까지 한 이미지. |
| `mingc/android-build-box` | latest/nightly (2026-08-10) | 약 5.9GB | 유지되지만 과대. |
| `thyrlian/android-sdk` | `10.0`=latest (2024-09-29) | 657MB | 2년간 이미지 갱신 없음 → 비권장. |
| `node:24-bookworm-slim` | 2026-09-19 | 약 81MB | 엔진 단위 테스트(Vitest)용 경량 이미지. |
| Google 공식 Android SDK 이미지 | 없음 | | `google/android-emulator-container-scripts`는 이미지가 아니라 스크립트 모음이며 README상 "실험적" 기능. |
| `budtmo/docker-android` | v3.7.0-p1 (2026-09-18) | 2.6~3.3GB | 에뮬레이터 이미지가 Android 9~14(API 28~34)뿐. **API 35/36/37 없음.** `--device /dev/kvm` 필요. |

KVM과 에뮬레이터에 대한 정직한 평가:
- 이 개발 머신에서 직접 시험한 결과, WSL2는 `/dev/kvm`을 노출하지만 사용자 `k`가 `kvm` 그룹에 없어 권한 오류(EACCES)가 난다(`sudo usermod -aG kvm k`로 해결). **Docker Desktop 4.89.0(WSL2 백엔드)에서 `--device /dev/kvm`을 주면 컨테이너 안에서 KVM이 동작**했다(`KVM_CREATE_VM` 성공).
- 그러나 에뮬레이터의 Wi-Fi는 VirtIO Wi-Fi(mac80211_hwsim) **클라이언트**가 호스트 측 가상 AP에 붙는 구조다. 게스트 내 SoftAP/LOHS가 동작하거나 외부 기기(iPhone)가 붙을 수 있다는 공식 근거는 없다 → **핫스팟은 에뮬레이터로 검증 불가로 간주**. 가상 Bluetooth/Wi-Fi는 이 프로젝트의 핵심 위험을 줄여 주지 않는다. ([에뮬레이터 고급 네트워킹](https://developer.android.com/studio/run/emulator-networking-advanced))
- 에뮬레이터 용도는 WebView 셸 UI, 권한 흐름, 서버 기동 스모크 테스트 정도로 한정(선택 사항). 서버/게임 로직은 JVM 테스트(Ktor `testApplication`) + 헤드리스 브라우저 2개 E2E로 검증.

## 7. GitHub Actions

| 항목 | 내용 | 출처 |
|---|---|---|
| 요금 | 공개 저장소: 표준 러너 무료. **비공개(GitHub Free): 월 2,000분, 아티팩트 500MB**, 캐시 저장소당 10GB. Linux 1코어 초과분 $0.002/분. 자가 호스팅 러너 과금 계획(2026-03 예정)은 연기되어 현재 무료. | [Actions 과금 문서](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| 러너 | `ubuntu-latest` = Ubuntu 24.04 (이미지 20260920): JDK 8/11/**17(기본)**/21/25, Gradle 9.7.1, Kotlin 2.4.20, Node 22, build-tools 34~37, platforms 34~37.2. **2026-11에 ubuntu-latest가 26.04로 전환 예정** → `runs-on: ubuntu-24.04` 고정 권장. | [Ubuntu2404-Readme](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md) |
| 액션 버전 | `actions/checkout@v7`, `actions/setup-java@v6`(temurin 21), `gradle/actions/setup-gradle@v6`, `actions/setup-node@v7`, `actions/upload-artifact@v7`, `softprops/action-gh-release@v3`, (선택) `reactivecircus/android-emulator-runner@v2`(v2.38.0, 호스티드 러너 KVM 사용 가능, udev 규칙 필요) | GitHub API releases |
| 흐름 | 태그 푸시 → 웹 빌드(Vite) → `app/src/main/assets/web`에 복사 → `./gradlew assembleRelease` → `softprops/action-gh-release`로 APK 첨부. 사용자는 폰 브라우저로 Releases에서 다운로드·설치. **비공개 저장소면 폰 브라우저에서 GitHub 로그인 필요**(공개 저장소가 설치 경험상 가장 단순). | 설계 |
| 서명 | `keytool -genkeypair -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias app`로 1회 생성 → base64로 Secrets 저장(비밀번호·alias 포함) → CI에서 `base64 -d` 복원 → `signingConfigs { create("release") {...} }`. AGP 기본 v1+v2(+v3) 서명. targetSdk 30+는 v2 이상 필수. **키를 고정해야 업데이트 덮어쓰기 설치가 된다.** debug APK를 배포할 경우에도 같은 `debug.keystore`를 Secrets로 고정해야 함. | AGP 기본 동작, Android 11 동작 변경(이번 세션 재조회 안 함) |
| 사이드로드 정책 | Google 개발자 인증은 **2026-09-30부터 브라질·인도네시아·싱가포르·태국에서만** 시작, 2027년 전 세계 확대. **2026-09 한국은 영향 없음**(국가 목록 기준 추론). 2027년 이후 미등록 앱은 "고급 설치 흐름"(개발자 모드, 재시작, 1회 24시간 대기, 생체 인증) 필요, **ADB 설치는 예외**. 무료 "제한 배포" 계정(최대 20대)도 있음. | [Developer verification FAQ](https://developer.android.com/developer-verification/guides/faq), [Play Console 도움말](https://support.google.com/android-developer-console/answer/16561738) |

## 권장 스택

| 계층 | 선택 (정확한 버전) | 한 줄 근거 |
|---|---|---|
| 호스트 네트워크 | `WifiManager.startLocalOnlyHotspot` (기본 2.4GHz). API 36에선 `startLocalOnlyHotspotWithConfiguration`으로 밴드만 옵션 | 통신사 테더링 제한 무관, 앱에서 원클릭. 자격 증명은 무작위이므로 QR로 전달. 이미 켜진 시스템 핫스팟도 감지해 폴백. |
| Android 언어/빌드 | Kotlin **2.4.20**, AGP **9.4.1**(내장 Kotlin), Gradle **9.8.0**, JDK **Temurin 21** | 현재 최신 안정 조합, AGP 9.4 요구치(Gradle ≥9.6, JDK ≥17) 충족. |
| SDK 레벨 | compileSdk **36**, targetSdk **36**, minSdk **33** | Android 16 기준. targetSdk 37의 LAN 권한 강제를 피하고, minSdk 33으로 위치 권한 분기 제거. |
| 내장 서버 | Ktor **3.6.0** (`ktor-server-cio`, `ktor-server-websockets`) | 코루틴 기반 경량 엔진, WebSocket 내장, JVM에서 같은 코드 테스트 가능. Netty는 Android 이슈 이력. |
| 정적 파일 | `assets/web`을 읽는 커스텀 Ktor 라우트 | 클래스패스 리소스보다 Android에서 확실. |
| 백그라운드 유지 | 포그라운드 서비스 `connectedDevice` + `FLAG_KEEP_SCREEN_ON` | 프로세스가 죽으면 LOHS도 내려감. 시간 제한 없는 FGS 타입. |
| Android UI | 단일 Activity + WebView, `androidx.webkit` **1.17.1** `addWebMessageListener` | 게임 UI 한 벌 재사용. Compose 불필요. origin 제한 브리지. |
| 평문 허용 | Network Security Config로 `127.0.0.1`, `localhost`만 cleartext | `usesCleartextTraffic`은 폐지 예정. |
| 웹 UI | Vite **8.3.1** + Svelte **5.57.1** + `@sveltejs/vite-plugin-svelte` **7.3.1** | 작은 번들, 내장 트랜지션/애니메이션. |
| 언어 | TypeScript **7.0.2** (도구 호환 문제 시 **6.0.3** 고정) | 최신 안정. svelte-check 호환 미확인. |
| 게임 엔진 | 순수 TS 모듈(프레임워크 무관) | Web Worker에서 AI 실행, BLE 전환 대비. |
| 단위 테스트 | Vitest **5.0.2** | Vite 8과 같은 설정 공유. |
| E2E | `@playwright/test` **1.63.0** (Chromium + WebKit 26.6) | iOS Safari 근사치 1차 필터. 최종은 실기기. |
| QR | 웹: `uqr` **0.1.3** (SVG) / Android(필요 시): ZXing core **3.5.4** | QR을 웹 UI에서 그리면 Android 쪽 의존성 제로. |
| 로컬 빌드 이미지 | `cimg/android:2026.08.1-node` | JDK 21, platforms 34~37, Node 포함. 한 이미지로 APK+웹 빌드. |
| 웹 테스트 이미지 | `mcr.microsoft.com/playwright:v1.63.0-noble` | 공식, npm 버전과 일치. |
| Node | **24.21.0 LTS** | Vite 8/Vitest 5/Playwright 요구치 충족. |
| CI | GitHub Actions `ubuntu-24.04` 고정, `checkout@v7`, `setup-java@v6`, `setup-gradle@v6`, `setup-node@v7`, `action-gh-release@v3` | 11월 ubuntu-latest 26.04 전환 회피. |
| 배포 | 고정 자가 서명 키로 release APK → GitHub Releases | 업데이트 덮어쓰기 설치 가능. 한국은 2026-09 현재 개발자 인증 대상 아님. |

## 리스크

| # | 리스크 | 심각도 | 대응 |
|---|---|---|---|
| R1 | **비행기 모드에서 LOHS가 OEM(특히 삼성 One UI 7/8)에 의해 막힐 수 있음.** 시스템 핫스팟은 삼성에서 비행기 모드 시 불가 보고. LOHS는 미확인. | **블로커 후보** | 첫 마일스톤으로 "LOHS 켜고 SSID/비번/IP 표시만 하는" 최소 APK를 CI로 배포해 실기기에서 비행기 모드 ON → Wi-Fi ON → LOHS 시작을 검증. 실패 시 대안은 사실상 없음(iPhone 개인용 핫스팟은 셀룰러 필요, Wi-Fi Direct는 iOS 미지원) → 이륙 전 연결을 맺어 두는 방식이나 BLE 네이티브 경로 재검토. |
| R2 | LOHS 자격 증명이 매번 무작위(AOSP 확인, OEM 미확인). | 중 | 매 세션 Wi-Fi QR 표시. iPhone에 네트워크가 누적되는 것은 감수. 시스템 핫스팟 폴백 모드로 고정 자격 증명 선택지 제공. |
| R3 | 핫스팟 IP가 무작위이고 인터페이스 이름이 기기마다 다름. | 중 | `NetworkInterface` 순회 + 재시도. 서버 `0.0.0.0` 바인딩. 화면에 IP 텍스트도 함께 표시. |
| R4 | 캡티브 시트는 프로브 무응답이면 뜨지 않을 것으로 예상(Apple 문서 + 커뮤니티). 만약 뜬 경우 "취소"를 누르면 연결이 끊김(Apple 문서 확인). | 중 | 안내에 "시트가 뜨면 '인터넷 없이 사용'"을 명시. 실기기 스모크 테스트. |
| R5 | Safari 비보안 컨텍스트(WebKit IDL로 확인): Wake Lock, Service Worker, Web Share, **`crypto.subtle`/`crypto.randomUUID()`** 불가. 화면 잠금/백그라운드 시 WebSocket 끊김. iPhone은 진동·요소 전체 화면도 불가. | 중 | 자동 잠금 "안 함" 안내, visible 시 즉시 재접속 + 서버 권위 상태 재동기화, ping/pong. `getRandomValues`만 사용, SHA-256은 순수 JS 또는 서버에서. |
| R5b | Wi-Fi QR에 `T:SAE`/`T:WPA3`를 쓰면 iOS가 인식 못함. | 중 | 항상 `T:WPA`. |
| R5c | 외부 리소스(CDN, 웹폰트)는 DNS 없음으로 멈춤. | 중 | 모든 자산 번들링, 외부 URL 금지(빌드 검사). |
| R6 | LOHS는 시작 시 앱이 포그라운드여야 하고 프로세스가 죽으면 종료. 사용자가 설정에서 끌 수도 있음. | 중 | FGS 유지, `onStopped`/`onFailed` 처리 후 재시작 UI. |
| R7 | 5GHz 선택 시 비행기 모드에서 국가 코드 부재로 `ERROR_NO_CHANNEL` 가능(추론). | 낮 | 기본 2.4GHz, 실패 시 폴백. |
| R8 | Ktor는 Android 서버를 공식 지원 플랫폼으로 명시하지 않음. R8 관련 이슈 이력. | 낮 | CIO 사용, minify 끄기로 시작, 서버 기동 계측 테스트. |
| R9 | TypeScript 7(네이티브)과 Svelte 도구 호환 미확인. | 낮 | 문제 시 TS 6.0.3 고정. |
| R10 | Playwright WebKit ≠ iOS Safari. | 낮 | 최종 확인은 실기기, iOS 특이 동작은 수동 체크리스트. |
| R11 | 에뮬레이터로 핫스팟 검증 불가. Docker의 KVM은 이 머신에서 동작 확인됐으나 가치가 제한적. | 낮 | 에뮬레이터는 선택 사항. |
| R12 | Android 11+ 서명 필수, 키 분실 시 업데이트 불가. 2027년 개발자 인증 전 세계 확대. | 낮(현재) | 키스토어 백업(Secrets 외 별도 보관). 2027년 이후 무료 제한 배포 계정 또는 ADB 설치 고려. |
| R13 | 비공개 저장소면 폰에서 Releases 다운로드 시 GitHub 로그인이 필요. | 낮 | 공개 저장소 또는 폰 브라우저 로그인. |

## 열린 항목 (Open)

- 2장 추론 항목: 프로브 무응답 시 CNA 미표시, QR로 연 IP URL의 HTTPS 우선 시도 동작, NoSleep 트릭 동작. 실기기(2.7)로 확정.
- 삼성 One UI 8(Android 16)에서 LOHS의 비행기 모드 동작, 자격 증명 무작위화, 인터페이스 이름: 실기기 확인.
- iPhone에서 `T:WPA` QR로 WPA3-SAE-transition LOHS 접속 가능 여부: 실기기 확인.
