# 시각 프로토타입 실기기 검증 절차 (결과 없음)

NF-03/04/08·VU-01~04. 실기기는 사람이 검증한다. headless 수치를 아래 결과로 전재하지 않는다.

| 조건 | 절차 / 남길 값 |
|---|---|
| 대상 | Galaxy S25 Ultra WebView, iPhone Safari, OS/WebView 버전·화면 밝기·주사율·저전력 모드·초기 배터리 기록 |
| A/B | 같은 빌드의 query 없는 A / `?visual=upgrade`. 같은 시드·AI 설정·사건 회수. 고해상도 질감 요청 파일명 확인 |
| LAN cold load | Wi-Fi 접속 뒤 cold cache로20회. QR/접속 시간과 페이지 첫 입력 가능 시간을 분리. 거리1m/5m, 2.4/5GHz 실제 밴드 기록. transferSize/서버 전송량·첫 입력 p50/p95 기록 |
| 성능 | 카드 뒤집기·뻑/쪽·AI 생각을 함께30분. 첫1분/마지막1분 frame trace, p95 gap·긴 프레임·온도·스로틀링·배터리 감소. Android Perfetto/원격 DevTools 또는 제공 가능한 시스템 계측 |
| 유휴 | 60초 입력 없이 Canvas/rAF가 멈추는지, 백그라운드/복귀 뒤 중복 루프 없는지 |
| 조작 | 4화면·안전영역·10손패2줄·먹을 패 선택·고스톱·스킵·뒤로·재접속. 표식/숫자 가림0, 주요 입력48px |
| 모션 | OS reduced-motion에서 입자0·뒤집기 즉시완료·사건명 유지. 빠름/보통/매우 빠름·스킵에서 최종 카드 앞면과 위치 일치 |
| 그래픽 | 직물 타일 이음새·글자 대비·작은 광 표식·유리패널/카드 겹침·비네트가 판을 너무 어둡게 하는지 사용자 판정 |

합격 목표: 게스트 첫 입력 p95≤2초, 정상 애니메이션60Hz 목표(실제 trace의 긴 프레임을 함께 검토), 유휴 앱 렌더 루프0, 콘솔 오류0·외부 요청0. 배터리는 A 대비 수치와 사용자의 허용 기준으로 결정하며 미리 임의 합격치를 만들지 않는다.

## Galaxy S25 Ultra 측정 순서 (VU-05)

1. 동일 debug APK를 설치하고 WebView 버전·OS·전원/온도·밝기50%·60Hz 고정 여부를 기록한다. 충전 유무도 동일하게 한다. 기본 A, `?visual=upgrade`, `?visual=upgrade&variant=rich` 세 조건의 순서를 교차해 반복한다. 테스트 전 배터리/온도를 같은 범위로 맞추고 녹화 자체의 부하를 별도로 기록한다.
2. Android 개발자 옵션의 시스템 추적에서 그래픽/뷰/스케줄링/CPU 주파수 항목을 켠다. [Android 시스템 추적 절차](https://developer.android.com/topic/performance/tracing/on-device)를 따라 trace를 저장한다. 세부 렌더링 분석은 [WebView 원격 검사](https://developer.chrome.com/docs/devtools/remote-debugging/webviews)와 [Performance 패널](https://developer.chrome.com/docs/devtools/performance/reference)을 이용한다. 저장소 개발 도구는 Docker/Dev Container에서 실행한다.
3. Home→솔로 최초 판 표시·첫 뻑에서 15초 trace를 남긴다. **최초 생성/그림자 raster 비용**과 이후 사건을 분리한다. 같은 판에서 뻑/쪽/따닥/폭탄/고를 재생하거나 갤러리 사건 fixture를 순회한다. 후자는 게임 상태가 아닌 시각 부하 표본임을 기록한다.
4. 실제 솔로의 뒤집기·획득 이동을 60초 측정한다. 표시 프레임/긴 프레임, main-thread Paint/Raster/Composite, GPU·CPU 주파수, JS 콜백 시간을 따로 적는다. rAF 평균을 화면 FPS로 대체하지 않는다. 카드10장·획득패 누적 상태에서도 반복한다.
5. 30분 반복 후 마지막60초 trace와 배터리·온도를 저장한다. 휴식 없이 다른 변형과 비교하지 않는다. iPhone Safari도 최초 판 표시와 정상 사건 재생을 분리하고, LAN 첫 로딩20회는 연결 완료 후부터 입력 가능까지 재어 p95를 남긴다.
6. 보통/빠름/매우 빠름·스킵·OS 동작 줄이기, 앱 전환/복귀, 정산 진입을 확인한다. 광택·잔광이 카드에 남지 않고 금액은 처음부터 최종값이어야 한다. 상대/나 아바타가 점수·이름·버튼을 가리지 않아야 한다.

결과 제출: APK commit, 기기/OS/WebView, 조건별 trace 파일명, 최초 표시 최대 gap, 정상 재생 p50/p95/p99·25ms 초과 수, 실제 표시 FPS, 30분 온도/배터리 변화, cold load20회 원시값. **아직 실측 결과 없음.**
