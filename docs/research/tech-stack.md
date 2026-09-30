# 기술 스택 검증 결론

2026-09-28 조사. Android LOHS 호스트, iPhone Safari 게스트, 인터넷 없는 LAN을 기준으로 했다. 구성 정본은 [plan §1](../../intent/plan.md), 버전 정본은 [AGENTS §2](../../AGENTS.md)다.

## 채택 근거

| 영역 | 확인 결과·채택 |
|---|---|
| 핫스팟 | 일반 앱은 LOHS SSID/암호를 고정할 수 없다. 매 시작 자격 증명을 받아 Wi-Fi QR을 다시 표시한다. 게이트웨이 IP도 고정하지 않고 인터페이스에서 찾는다. |
| Android 서버 | Ktor CIO + WebSocket, 전경 서비스 수명에 결합. 루프백/공유 LAN 경계와 세션 토큰은 [protocol](../protocol.md)에 따른다. |
| Android 화면 | Kotlin Activity + WebView. Compose 없이 웹 번들을 로컬 assets로 포함한다. |
| iPhone Safari | 사설 IP의 HTTP는 비보안 컨텍스트다. Wake Lock·Service Worker·Web Share·SubtleCrypto를 쓰지 않는다. 연결 복귀 시 호스트 권위 상태를 다시 받는다. |
| 웹·빌드 | Vite/Svelte/TS, 단일 개발 이미지와 GitHub Actions. 모든 자산 번들, 외부 요청 0. |

AOSP에서 LOHS + 비행기 모드가 가능하고 S25 Ultra [M0 실기기 결과](../device-test/results.md)에서도 확인됐다. 이는 다른 OEM 보장은 아니다. Wi-Fi QR은 호환성을 위해 `T:WPA`를 쓴다. Safari 캡티브 시트·주소창·백그라운드 복귀와 실제 5초 복구는 [사람 검증 절차](../device-test/procedure.md)에 따른다. Playwright WebKit은 실제 iPhone Safari를 대체하지 않는다.

## 남은 리스크

- LOHS 종료·권한 거절·IP 변경과 기기별 핫스팟 채널 차이: 상태를 화면에 알리고 재시도/폴백한다.
- iPhone 잠금·탭 복귀로 WebSocket이 끊길 수 있다: visible 시 재접속·스냅샷 재동기화한다.
- 실제 배포 키·서명 지문·오픈소스 고지는 릴리스 게이트에서 확인한다.

상세 결정의 현재 상태는 [plan](../../intent/plan.md), [protocol](../protocol.md), [실기기 절차](../device-test/procedure.md)를 따른다.
