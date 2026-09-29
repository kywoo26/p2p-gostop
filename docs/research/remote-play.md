# 원격 대전: 클라우드 중계 조사·개정 제안

조사일: 2026-09-29. **리뷰·사용자 승인 전, 구현·배포 없음.** 연결: [spec §13](../../spec.md#13-원격-대전-개정안-승인-전) · [plan §1.9](../../plan.md#19-원격-중계-모드-개정안-승인-전) · [사람 검증 절차](../device-test/remote-play.md).

## 1. 판단

**1순위 (e) 자택 PC + Tailscale Funnel, 단 공개 WebSocket 통과 실측을 출시 조건으로 권고한다.** 사용자는 이미 Tailscale을 쓰고 상시 가동 가능한 Linux/WSL2 PC가 있다. 무료 클라우드 계정·Worker/DO 재작성·배포 파이프라인을 새로 관리하는 시간도 비용으로 본다. **2순위 (a) Cloudflare DO + Pages**는 PC 없이 상시 서비스가 필요할 때, **임시 (d) Tailscale 노드 공유**는 상대 설치를 받아들일 때만 쓴다.

Galaxy와 상대 Safari는 모두 공개 중계에 아웃바운드 WSS로 접속한다. 파트너는 링크만 열고, 엔진·원장·셔플 권위는 Galaxy WebView에 유지한다. 일반적으로 CGNAT/인바운드 차단 뒤 폰의 서버에 공개 웹에서 직접 도달할 수 없다. **한국 통신사별 CGNAT 적용은 공식 출처를 확보하지 못한 일반 네트워크 배경**이며 전 통신사에 대한 확인 사실로 쓰지 않는다.

| 확인한 현행 근거 | 확장에 필요한 판단 |
|---|---|
| intend §1·3, spec §1·NP-08·NF-01/06은 인터넷/서버 없는 기내 게임 | 오프라인을 대체하지 않는 선택 모드. 승인 후 intend·AGENTS 외부 요청 금지 규정도 한정 개정 필요 |
| plan §1.1/1.7, `packages/relay-dev/src/index.ts`, Android `server/SmokeServer.kt` | `/ws?role=host\|guest`, 역할당 1개·4001·relay 알림 재사용. **루프백 호스트 검사는 LAN에서 유지**, 클라우드에서는 별도 역할 인증 |
| `SmokeServer.lanAllowed`, `HotspotService`, `GameActivity` | 원격 선택으로 LAN gate를 열지 않는다. HostBridge는 기존 루프백 메인 프레임만 허용 |
| `docs/protocol.md` §1~10·§11, NP-06 | 현행 v2와 승인 전 타이머 v3를 구별. hello/snapshot·requestId·commit-reveal 재사용, 새 방 인증은 게임 wire 밖 전송 제어 계층 |
| `check-bundle.ts`, `NoExternalUrlTest.kt` | 현재 검사는 주로 HTTP URL 리터럴 검사. WSS·동적 URL까지 검사하는 모드별 허용 목록과 실제 요청 차단 테스트가 필요 |

## 2. 후보 비교

무료 한도는 아래 공식 문서의 조사 시점 값이며 영구 약속이 아니다. ‘미명시’는 무제한 보장이 아니다. 지연·NAT 평가는 구조에 따른 추론이고 국내 실측·성공률 수치는 아직 없다.

| 후보 | 파트너 무설치 | 무료 연결·시간·대역폭/비용 | 지연·NAT | 운영 부담·오프라인 코드 공유 | 판단 |
|---|---|---|---|---|---|
| (a) Workers + DO + Pages | 가능: HTTPS Safari | Workers 10만 요청/일, CPU 10ms/호출. DO 10만 요청/일·13,000 GB-s/일, SQLite만 무료. Hibernation 최대 32,768 소켓/DO는 플랫폼 상한이며 앱은 2개. 연속 접속 시간 보장 없음. Pages 정적 요청·대역폭 무료 무제한, 빌드 500회/월 [C1~C5] | HTTPS/WSS 허용 망이면 CGNAT 종류와 무관. 방 DO 경유 지연, 국내 위치 보장 없음 | 새 계정·배포/비밀 관리 필요, PC 불필요. 웹/세션 공유, **중계는 Worker/DO로 재작성** | **2순위** |
| (b1) Fly.io 소형 WS VM | 가능 | 신규 무료 티어 대신 **2 VM시간 또는 7일 중 먼저 끝나는 체험**. 소진 시 중지, 결제 수단 추가 후 유료. 연결 수는 VM 메모리/설정, 대역폭은 지역별 요금; 지속 비용 0 불충족 [F1~F2] | WSS 중계로 NAT 회피; 가까운 VM 지역 선택 가능하나 실측 필요 | Node `ws` 중계 이식 쉬움. TLS·VM 패치·재시작·다중 인스턴스 방 라우팅 부담 | 제외 |
| (b2) Deno Deploy 소형 WS | 가능 | 공식 GA 발표: 무료 100만 요청/월·100GB egress·15 CPU시간. 현행 pricing 페이지 본문 조회 실패로 **현재 적용값 재확인 필요**. WS 동시 수·최대 수명 보장값 미확인, CPU시간을 접속시간으로 해석하지 않음 [D1~D3] | WSS로 NAT 회피, isolate/지역 간 같은 방 배치 해결 필요 | TS 공유 높음. 프로세스 메모리의 역할 map만으로 다중 인스턴스 연결을 보장 못함 | 차선, 요금·방 라우팅 확인 후 재평가 |
| (c) WebRTC DataChannel + signaling Worker + STUN/TURN | 가능 | signaling은 Workers/DO 한도 사용. STUN은 연결 보장 아님. Cloudflare TURN 예: SFU와 합산 egress **1,000GB/월 무료**, 이후 $0.05/GB. 무료 한도만의 자동 강제 중단은 미확인; 동시 연결·세션 수명 보장은 별도 검증 [T1~T2] | 직접 연결 때 경로 짧음, restrictive NAT/UDP 차단은 TURN 필요. 성공률 % 단정 불가 | ICE·재협상·TURN 자격 증명·사용량 차단 추가. JSON 세션 공유 가능하나 WS 전송 교체 필요 | 초기 범위 제외: 이 게임의 적은 트래픽 대비 복잡 |
| (d) Tailscale VPN 메시·노드 공유 | **불가**: 상대 앱·계정/초대 필요 | Personal $0, 최대 6명·사용자 기기 무제한(태그 리소스 기본 50). 노드 공유는 전 플랜, 공유 노드는 수신만 가능한 격리. 대역폭·연속 게임 시간 보장 수치 미명시 [V1~V3] | 직접 연결 실패 시 DERP 중계, 망 정책에 따른 제약·추가 지연 | 새 클라우드 계정/배포 불필요. PC 중계를 공유하면 PC 필요, 앱의 역할 인증도 필요 | **임시 우회**, 무설치 수용 기준은 미달 |
| (e) 자택 PC Docker 중계 + Funnel | 가능: 공개 HTTPS URL, 상대 Tailscale 불필요 | 전 플랜 무료 Personal 가능. **변경 불가능한 대역폭 제한, 수치·월 공정 사용량·연결 수·최대 접속시간 미공개/미확인**. 무제한/SLA 보장 아님. 공개 443/8443/10000만 [E1~E3] | TCP 프록시+PC TLS 종단이므로 WSS 동작 예상, **공식 문서에 WS 명시 없음·실측 필수**. 경유망+집 회선 지연, NAT 성공률 수치 없음 | 기존 계정 재사용·클라우드 계정/배포 파이프라인 불필요. **PC/WSL2/Docker 상시 가동·패치 필요**. relay-dev의 WS 구조·정적 웹을 가장 많이 재사용 | **1순위, 실측 조건부** |

| 사용자 상황의 결정 기준 | (e) PC+Funnel | (a) Cloudflare | (b) 소형 WS 서버 |
|---|---|---|---|
| 초기 작업·유지 시간 | 기존 Tailscale+PC 활용, 방 인증/정적 서빙 강화·Funnel 설정 | 계정·DO 어댑터·배포/롤백·quota 운영 추가 | Fly는 지속 무료 아님; Deno는 요금 재확인·방 배치 문제 |
| 집 PC가 꺼질 때 | 웹 로딩·진행 모두 불가, 절전/Windows 업데이트 관리 | PC와 독립, Free 한도·사업자 장애 영향 | 관리형 서버는 PC 독립, 비용/운영 제약 |
| 전환 조건 | WSS upgrade·query 보존·재연결·장시간 안정성 통과 시 채택 | Funnel 불통/제한 또는 PC 상시 운영 부담이 커질 때 채택 | 현재 추천 제외 |

### 공식 출처

| ID | 1차 출처·읽을 항목 |
|---|---|
| C1 | [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/) · [한도](https://developers.cloudflare.com/workers/platform/limits/): Free 요청/CPU, WS upgrade 과금, 대역폭 별도 과금 없음 |
| C2 | [DO 요금](https://developers.cloudflare.com/durable-objects/platform/pricing/): 무료 SQLite, 초과 작업 실패·00:00 UTC 리셋, 수신 WS 20:1 요청 환산, 연결 upgrade 별도·송신 무료. 유료는 Workers 최소 $5/월에 DO 요청 $0.15/백만·duration $12.50/백만 GB-s(포함량 초과분) |
| C3 | [DO 한도](https://developers.cloudflare.com/durable-objects/platform/limits/) · [State의 WS 상한](https://developers.cloudflare.com/durable-objects/api/state/) · [Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/): 연결 유지 중 휴면, 메모리 재생성·소켓 attachment 복원 |
| C4 | [Pages 요금](https://pages.cloudflare.com/) · [Pages 한도](https://developers.cloudflare.com/pages/platform/limits/): 정적 요청/대역폭, 월 500빌드·동시 1·20분, 파일 20,000개·개별 25MiB. Functions는 Workers quota 사용 |
| C5 | [DO 위치](https://developers.cloudflare.com/durable-objects/reference/data-location/): 위치 힌트는 국내 배치/SLA 약속이 아님 |
| F1/F2 | [Fly 무료 체험](https://docs.fly.io/about/free-trial/) · [가격](https://fly.io/docs/about/pricing/): 신규 체험과 옛 무료 allowance 구분 |
| D1/D2/D3 | [Deno GA 공식 발표](https://deno.com/blog/deno-deploy-is-ga) · [현재 가격](https://deno.com/deploy/pricing) · [한도 문서](https://docs.deno.com/deploy/pricing_and_limits/): 한도 문서에 Classic 설명이 혼재하므로 GA와 수치 혼합 금지 |
| T1/T2 | [WebRTC TURN 필요성](https://webrtc.org/getting-started/turn-server) · [Cloudflare Realtime 요금](https://developers.cloudflare.com/realtime/sfu/platform/pricing/): SFU/TURN 무료량 공유 |
| V1/V2 | [Tailscale 가격](https://tailscale.com/pricing) · [연결 유형](https://tailscale.com/docs/reference/connection-types): direct/DERP, 설치·VPN 사용 전제 |
| V3 | [노드 공유](https://tailscale.com/kb/1084/sharing): 전 플랜, 상대 계정·클라이언트 필요, 공유 노드 격리 |
| E1/E2/E3 | [Funnel 공식](https://tailscale.com/kb/1223/funnel) · [Funnel CLI](https://tailscale.com/kb/1311/tailscale-funnel) · [이용 조건](https://tailscale.com/terms): 무료 플랜 사용 가능, 공개 포트·비공개 수치 대역폭 제한. 정량 공정 사용량이나 영구 가용성은 확보하지 못함 |
| E4 | [WS query 유실 보고](https://github.com/tailscale/tailscale/issues/18651): 공식 저장소의 사용자 보고이며 확정된 제품 제한 아님. `/ws?role=...` 보존을 실측할 근거 |
| E5 | [WSL2 안내](https://tailscale.com/docs/install/windows/wsl2) · [Funnel 예제](https://tailscale.com/docs/reference/examples/funnel): 실행 위치/백그라운드 설정 확인 |

사용자가 2026-09-29 확인해 전달한 E1/E2/V3·C2/C3/C4·Fly 공식 문서 내용도 대조 근거로 반영했다. Fly는 무료 티어가 아닌 체험이므로 제외한다. 사용자 전달 ‘최소 약 $5/월’은 구성별 견적이 아니며 보장 최저가로 쓰지 않는다. Cloudflare Free는 카드 없이 시작 가능([공식 안내](https://www.cloudflare.com/products/durable-objects/)).

### PC+Funnel 배치 제안

| 항목 | 제안·운영 경계 |
|---|---|
| 흐름 | Galaxy WSS → Funnel TCP 프록시 → 자택 PC TLS 종단 → Docker WS 중계 ← 같은 공개 URL의 iPhone/Mac. 정적 웹도 같은 PC에서 HTTPS로 제공 |
| 설정 | MagicDNS·HTTPS 인증서·정책의 `funnel` 노드 속성 필요. CLI 가능한 PC에서 `tailscale funnel --bg --https=443 <target>`. 예: `http://127.0.0.1:17778`. 이 PR에서 실행하지 않음 |
| Docker·WSL2 | 서버 컨테이너는 필요한 HTTP/WS 포트만 PC 루프백으로 publish. Funnel과 서버가 같은 네트워크에서 닿는지 확인. Windows Tailscale과 WSL Tailscale을 혼동하지 않고 하나의 실행 위치를 선택. Docker 소켓·전체 저장소·관리 포트 공개 금지 |
| 인증 주의 | Funnel 뒤 모든 요청이 루프백/프록시에서 온 것처럼 보일 수 있음. 기존 relay-dev의 ‘루프백이면 host 허용’을 **공개 모드에서 인증으로 대체**, `role`/Origin/전달 IP만으로 host 권한을 부여하지 않음 |
| 공개 경계 | Funnel은 private Serve/노드 공유와 달리 누구나 도달 가능. tailnet ACL을 파트너 인증으로 간주하지 않음. 전용 포트의 `/`, 번들 자산·방 API·`/ws`만 노출, `/smoke`·진단·파일 목록 제외 |
| 초기 운영 | 운영자만 가진 생성 자격 증명을 Galaxy에 1회 등록, 파트너에게는 초대만. PC 기동·Funnel 상태·인증서·절전 해제·재부팅 복구 확인. 전기/회선/관리 시간은 0이 아니며 **추가 유료 서비스 비용 0**과 구별 |
| 실측 gate | 양쪽 WSS upgrade·role/query 보존·인증/교체·25초 heartbeat·2시간 플레이·PC/폰 단절 복구를 확인. 미통과 시 a로 전환, ‘WS 지원 확인’으로 기록 금지 |

## 3. 무료 운영·무상태의 정확한 의미 (Cloudflare 전환 시 예산 포함)

| 항목 | 권고 계약 |
|---|---|
| 비용 0 | 1순위는 기존 Personal+PC, Funnel 기본 제공 도메인. 2순위는 Workers **Free 고정**·Pages 기본 도메인. Paid·자동 증액·유료 TURN·도메인 구매 없음. 전기/통신 요금·운영 시간은 별도. CI도 무료 분량 내, 유료 초과 실행 금지 |
| DO 비용 | 방당 1 DO, 양쪽은 인바운드 Hibernation WS. 상시 타이머/서버 발신 WS는 피한다. 휴면 적격이 아니면 128MB 기준 duration이 누적되므로 ‘접속은 무조건 무료’라고 안내하지 않음 |
| 보수적 예산 추정 | 1방 2시간을 전부 활성으로 잡으면 7,200초×0.128GB≈922 GB-s. 10방이면 약9,216 GB-s/일로 13,000 미만이나 제어 DO·재접속·공격·동일 계정 다른 앱은 별도. 요청은 `upgrade+HTTP+alarm+수신 프레임/20` 근사, 25초 ping/pong도 앱 프레임. 수용 인원을 약속하는 수치가 아님 |
| 저장 예산 | DO 무료 SQLite 500만 rows read/일·10만 write/일·총5GB. 게임 내용 저장 0. 아래 메타데이터와 TTL alarm도 write를 쓰므로 측정에 포함 [C2] |
| 무상태·무로그 | **게임 상태 무상태**: 엔진·손패·시드·원장·프레임·진단 로그는 저장/기록하지 않음. 방 라우팅·토큰 해시·역할 소유·만료·짧은 남용 카운터는 TTL 메타데이터로만 예외 허용. PC는 메모리만·프로세스 재시작 시 방 소실, DO는 TTL 저장 예외. 완전 무상태와 방 재접속·단회 초대·남용 방지를 동시에 보장한다고 쓰지 않음 |
| 장애 복구 | 휴면은 소켓 attachment와 메타데이터로 복원. DO 재시작/배포는 단절 가능; host/guest 재인증→hello→snapshot. 메타데이터 소실 시 기존 방을 자동 재생성하지 않고 새 초대. 게임 복원은 폰의 저장 계약 범위에서만 |
| 가용성 | Free quota 소진이면 원격 연결/프레임이 실패할 수 있음. 비용 청구 대신 입력 잠금·원격 일시 불가·수동 재시도. 근처 상대만 LAN으로 **새 세션** 가능; 원격 상대에게 오프라인이 대체 연결이라고 안내하지 않음 |

## 4. 위험·미결 및 승인 조건

| 위험/미결 | 영향·대응 / 해소 시점 |
|---|---|
| 무료 티어 축소·종료, 플랫폼 종속 | 서비스 지속 보장 없음. Free 재확인 후 배포, 중단 시 LAN/솔로 유지. relay-cloud 어댑터·계약 테스트로 이전 가능하게 함 |
| 중계·웹 배포자 신뢰 | 게임 양단 E2EE는 없음. (a)는 클라우드 TLS 종단에서 평문을 볼 수 있음. (e)는 **Funnel 사업자 TCP 중계가 복호화하지 않고 PC에서 TLS 종단**[E1]; PC 운영자/악성 웹 번들은 내용을 보거나 바꿀 수 있음. commit-reveal은 신원 인증·부정 종료 방지·호스트 비밀 지식 제거가 아님 |
| Funnel 공개·가동·한도 | PC 정지/절전/재부팅·WSL/Docker 중단·집 회선 장애는 웹/방 전체 장애. Funnel beta·미공개 대역폭·공정 사용 제약, WS/query 실측 실패 가능. PC 분리 포트·토큰 인증·소규모 개인 사용, 필요 시 a로 이전 |
| 개인정보·무로그 한계 | 사업자 IP/접속 메타데이터 처리는 통제 밖. 앱 로그·Workers Logs/Tail·HTTP 본문/URL 기록 끔, 플랫폼 보존 정책은 배포 전 확인. ‘사업자도 아무것도 수집하지 않는다’ 금지 |
| 상대 신원·링크 유출 | 링크는 소지자 권한. 신뢰하는 메신저로 전달, 로비 이름은 인증 아님. 코드 참여는 호스트 수락, 좌석 점유 후 초대 재사용 차단. 사람이 상대와 별도 대화로 확인 |
| 방 생성·참여 남용 | 방 생성은 운영자 생성 키로 제한하되 탈취·공유 위험이 있음. IP 제한은 CGNAT 공동 사용자 오탐·분산 공격 한계. 전체 방/생성량 상한으로 원격 가용성을 희생해 비용 0 유지. 불특정 공개 서비스 확장은 별도 권한 정책 필요 |
| 국내 지연·배터리·백그라운드 | 서울 인접 edge가 동일 DO의 위치를 보장하지 않음. 한국 LTE/5G↔가정망·iPhone/Mac p50/p95 실측. 호스트 화면 유지, 백그라운드 정지 시 대기 |
| 정적 웹/APK 버전 차이 | Pages 최신 웹과 구 APK가 어긋남. 동일 release 번들·버전별 URL·hello 불일치 안내. 이전 번들 지원 기간은 RP-03에서 확정 |
| 타이머 #123와 병합 순서 | 원격 개정이 v3 승인을 대신하지 않음. 원격 지연을 10초 정책에 적용하는 승인/테스트 별도. 연결 불확실 중 자동치기·자동 승패 금지 |
| Mac 가로·보안 API | 현행 UX-02의 가로 잠금과 충돌: 데스크톱 예외 승인 필요. HTTPS만으로 Safari API 지원 보장 못함. 초기 구현은 금지 API 유지 |
| 원격 Android 서비스 수명 | LOHS 없이 기존 connectedDevice FGS를 유지할 수 있다고 가정하지 않음. 포그라운드 원격 플레이를 기본, 서비스 유형/권한은 공식 Android 문서 검토 후 RP-04에서 확정 |

승인 대상: spec §13의 모드 한정 예외·토큰/TTL·비용 0 중단 정책 및 plan RP-01~07. 이 조사 PR은 인프라 계정 생성, 비밀 발급, 공개 배포를 수행하지 않는다.
