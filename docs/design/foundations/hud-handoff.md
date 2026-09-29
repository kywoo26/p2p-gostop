# HUD 인계 수령·통합 기준 (FR-40~50, M3/M6/D2)

2026-09-29: [#83 인계 댓글](https://github.com/kywoo26/p2p-gostop/pull/83#issuecomment-5883460316)과 실제 코드를 확인했다. 시각 구현은 디자인 리드가 단독 소유한다. HUD 담당의 추가 구현/별도 구현 PR은 중단됐다.

| 항목 | 고정 기준 |
|---|---|
| 문서 | `design/hud-assist` ece5898, #83 리뷰/병합 대기 |
| 코드 | [`feat/hud-redesign` f566f46b9609ceef1573d9f419b8f8d56e4fdf3b](https://github.com/kywoo26/p2p-gostop/tree/f566f46b9609ceef1573d9f419b8f8d56e4fdf3b) |
| 검토 범위 | `design/hud-assist...feat/hud-redesign` 17파일. main/문서 병합을 HUD 구현으로 오인하지 않음 |
| 원 구현 | `05f81b3` 구조/테스트/기존 기준샷, `426485a` 토큰, `f566f46` 실제 메뉴 위치/통합 검사 |
| 이번 #92 | 인계 수령·구조/props/테스트 검토·토큰 매핑 준비. **앱 코드 통합은 후속 구현 PR**; 본 문서 PR에서 병합·cherry-pick하지 않음 |

## 흡수할 구조와 검증

| 파일 (`packages/web/` 기준) | 그대로 보존할 계약 | 디자인 리드 통합 작업 |
|---|---|---|
| `src/ui/SeatBar.svelte` | who/name/score/goCount/balance/unit; optional multiplier/stopPreview/expanded. 공통5열 subgrid, 이름만 말줄임, 상대 배수 미제공 —. 누적 배수(박 제외)와 스톱 배수 구별 | 이름/ARIA/숫자 의미 유지. 폰트·표면·전경을 확정 역할에 연결 |
| `src/ui/SeatProgress.svelte` | CapturedStats·shakes/ppeok/bombs·handCount/thinking/anchor. 양쪽4열, 상대 `opp-hand` anchor | 칩 상태 incomplete/near/complete 및 비색상 신호 유지. 내/상대 공개 값 변화에 따라 되돌림 |
| `src/ui/Board.svelte` | 같은 BoardView/액션 props, 두 좌석 expanded 동기화, 메뉴 예약, decision-area 일반 흐름 | 선택 예약6행은 .1-A와 완성. 실제 후보 SVG는 PromptPanel에 연결, 엔진/전송 계약 변경 없음 |
| `src/routes/Game.svelte` | 메뉴 top=max(8px,safe-top), right=max(12px,safe-right), 실제 버튼/예약 rect 일치 | #88 메뉴/Back 로직 보존, 색·아이콘·초점 외관만 통합 |
| `src/styles/tokens.css` | `--hud-height-compact/wide/expanded` 56/60/84px, menu48+gap8, line-height/숫자 열 | 구조 값 유지. `--color-hud*`, radius/border는 아래 의미 역할에 매핑. `--dur-*`는 #86 |
| `src/ui/Board.hud.test.ts` | 13사례×2브라우저: 수치/긴 이름·잔액/문턱 칩3상태/역전/배수/선택 가림/확장 높이 | 삭제 없이 통합. 폭360/390/430 테스트의 높이는915px이므로 최소 높이 수용의 대체물이 아님 |
| `e2e/hud.spec.ts` | 갤러리3상태×2 + 실제 Game 메뉴×2, rect/hit/inert/설정 왕복·대비/axe | 확정 폰트/색 이후 동일 gate 재실행, 최소4화면 확대 |
| 기존 Board 액션 테스트·갤러리8기준샷 | ARIA 배수 검사·구조 변화 이유 있는 이전 기준샷 | 기존 행동 검사를 유지하고 변경 전후 이미지 대조. #89 카드 회귀에 영향0 |

**첫 기준 칩**은 광3/고도리3/단3/피 가치10이다. 단은 공개 홍/청/초단 중 최대 진행도다. 다음 광4/5·띠/열끗5·개별 단 상세를 이미 구현했다고 주장하지 않는다(#81 이후). 상대 손패 수는 **현황판 보조 줄**이며 이름 옆으로 되돌리지 않는다.

| HUD 토큰 | 통합 역할 | 불변/선택 |
|---|---|---|
| `color-hud`, `color-hud-chip` | surface / surface-raised | 선택한 팔레트에 매핑 |
| `color-hud-text`, `color-hud-muted`, `color-hud-mine` | text / text-muted / selected | 면과 실제 대비 검증 |
| `color-hud-outline`, `hud-border*` | control-border / 구조 구분 | 텍스트4.5:1, 필수 경계3:1 |
| `color-hud-near[-bg]`, `hud-near-border-style` | progress-near 전경/배경/점선 | “1장/1피 남음” 유지 |
| `color-hud-complete[-bg]` | progress-complete 전경/배경/실선 | “첫 기준 달성” 유지 |
| `hud-font-size/line-height/score-*` | label / score | 14/20, score20/24 원본 기준. 새 type 선택 시 높이 계약 재검증 |
| `hud-height-*`, `hud-menu-*` | layout / touch | 방향 선택과 무관하게 유지 |

## 남은 작업의 구분

| 항목 | 현재 증거 / 다음 단계 |
|---|---|
| 최소 높이·예약6행 | 아직 미완료. 선택없음 `decision-area:empty`가 숨겨짐. #46에서 항상 예약, #47에서 획득/현황 압축; 손패/바닥/후보 가림0을 최소4종에서 검사 |
| 확장 HUD 회수 | 현재 기존 prompt 세로 padding에서28/24px 회수. 최종132→104/144→120px 예약 행으로 연결, 390×734 바닥≥208px 확인 |
| 터치·초점·확대 | #46/#47/#51 남음. 스킵 pointerup 분리는 #52/#86 경계 확인. HUD 무가림 통과를 전체 접근성 완료로 표시하지 않음 |
| 후속 플레이 보조 | 힌트3등급/토글/저장·기록/AI조언은 아직 미구현. #80→#81→#87→#82, #90의 정책 보존 |
| 원 담당 검증 | 최신 #88 후 lint/check, node487, browser264, HUD E2E8, build1032.4KiB/외부0 **인계 보고**. 디자인 리드가 이 브랜치에서 재실행한 결과는 아님 |
| 전체 통합 검증 | #88 이후 전체 E2E/Android 미재실행. 후속 통합 PR에서 mandatory 전체 실행, 전후 접근성 표 기록. 실제 Galaxy/iPhone 미검증 |

실행 계획: 사용자 방향 선택 → 최신 main/#83 반영 상태 확인 → 위 구현 커밋의 구조·테스트를 통합 PR에 흡수 → .1-A 미완료 계약을 보존/완성 → 확정 외관 값 적용 → 기존+추가 회귀 검증. 인계 코드의 미완료 상태를 덮어쓰기식 복사로 감추지 않는다. #86의 재생 시간과 #89 카드 자산은 이 통합의 수정 대상이 아니다.
