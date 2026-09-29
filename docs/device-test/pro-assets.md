# PA-01 / NF-03 전문 자산 실기기 승인 절차

**상태: 사람의 실기기 기록 대기.** Docker Chromium/WebKit 수치를 Galaxy/iPhone 결과로 기입하지 않는다. 현행 NF-03의 전체1.5MiB·첫 로딩≤2초를 유지한다. 평가 전용 초과 빌드 결과는 본선 승인 근거가 아니며 개정안은 리뷰·사용자 승인 대기다. 품질·전송·배터리를 함께 비교한다.

| 기기 / 조건 | 반드시 기록 |
|---|---|
| Galaxy S25 Ultra | Android/WebView 버전, APK/커밋, 412×915 CSS/DPR3.5 확인, 화면 주사율60/120, 배터리/온도/밝기 |
| iPhone | 모델/iOS/Safari, 핫스팟 연결 방식·거리·대역, CSS viewport, 저전력 모드 |

1. 동일 APK에서 기본 외관과 `?visual=pro`를 비교한다. Android는 APK 로컬 assets, iPhone은 호스트의 HTTP 주소를 쓴다. 외부 인터넷 없이 카드·재질·소리·고지를 확인한다.
2. iPhone 첫 HTML 진행 표시→메뉴를 읽고 탭할 수 있는 순간→재질 완료 시점을 화면 녹화와 Safari 타임라인으로 각각 측정한다. cold(사이트 데이터 삭제)30회, warm30회. 정렬한30개 값의29번째(nearest-rank p95)를 기록하며 평균만 제출하지 않는다. 첫 화면·Board·정산의 요청 bytes/전환 지연을 따로 적는다. 완료 진행 표시가 거짓100%가 되거나 다운로드 실패로 입력이 잠기는지 확인한다.
3. 10장 손패·2줄·고/스톱·뻑/쪽/따닥/폭탄·정산 전환을 Galaxy에서 각30초, 전체10분 플레이한다. Chrome remote debugging Performance에서 FPS/긴 프레임/렌더링·메모리를 기록한다. Android Studio Profiler 또는 `adb shell dumpsys meminfo <실제 applicationId>`로 호스트와 renderer의 PSS/RSS를 구분한다. JS heap만으로 전체 WebView 메모리라고 하지 않는다.
4. 숨김→복귀10회, 사건50회 이후 atlas/AudioBuffer/canvas 수와 메모리가 지속 증가하는지 확인한다. 입력 지연·p95 프레임 간격·최대 끊김·열/배터리 변화를 기본 외관과 비교한다. GPU/기기60fps 목표 미달이면 효과 동시 수·decode 시점·해상도부터 조정한다.
5. 소리 기본 켜기/설정 끄기/다시 켜기, 최초 탭 Safari unlock, 무음 스위치·오디오 라우팅을 확인한다. Android 진동은 기존 경로 그대로이며 새 진동 호출을 넣지 않았다. reduced-motion에서는 정지 효과·즉시 확정 금액·초점 순서를 확인한다.
6. 360×780/390×734/430×822/412×915는 자동 검사와 별도로 글꼴 확대·Safari aA·가로모드 복귀를 확인한다. #104 통합 전 현재 프로토타입을 HUD 계약 완료로 승인하지 않는다.

| 커밋·기기·조건 | cold p95 HTML/입력/재질 ms | warm p95 ms | 첫 화면 bytes | Board/정산 bytes | FPS/p95 프레임/최대 | host/renderer PSS | 입력·진행 표시 체감 | 검증자·날짜 |
|---|---|---|---|---|---|---|---|---|
| 미실시 | — | — | — | — | — | — | 승인 대기 | — |

## NF 성능 항목 후보의 검증(리뷰 전, 아직 규범 아님)

- FPS: 60Hz 고정, 10분 표준 플레이/각 사건 30회. 평균 FPS뿐 아니라 p95 frame interval ≤20ms, >50ms 프레임 ≤1% 후보. GPU trace와 rAF를 분리하고 기본/평가 차이를 적는다.
- 메모리: catalog의 `width×height×4` 합계와 실제 renderer PSS 증가량을 별도로 기록. 디코드 자산 작업 집합 ≤48MiB, 기본 대비 renderer PSS 증가 ≤64MiB 후보. 숨김/복귀·50사건 후 증가가 회수되는지 검사. 전체 PSS 상한은 실기기 baseline을 확보한 후 고정하며 임의 합격 처리하지 않는다.
- 배터리: 기내 오프라인 조건, 동일 핫스팟·60Hz·밝기·소리/진동·시드, 충전 해제, 기준/평가 30분씩 3회 교차 시행. 중앙값 소비 증가 ≤1%p/30분 후보. 낮은 배터리 계측 해상도 때문에 온도·Android batterystats 에너지와 함께 기록한다. 대기·숨김에서는 추가 RAF 0.

| 비교 빌드/밝기/온도/주사율 | FPS / p95 / >50ms 비율 | 자산 decode 계산 / renderer PSS 증가 | 30분 소비 기본/평가(3회) | 판정 |
|---|---|---|---|---|
| 실기기 미검증 | — | — | — | 후보 승인 대기 |
