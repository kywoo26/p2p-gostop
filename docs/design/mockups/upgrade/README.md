# 게임 그래픽 프로토타입 비교

CSS 412×915, Chromium, 이미지 DPR1. 실제 Home/Board/Settlement 컴포넌트를 렌더했다. 판/사건/정산은 갤러리 시각 fixture이며 정상 게임의 특정 이력을 뜻하지 않는다. 사건25%, 이동30%에서 정지한 프레임이다. 실기기 캡처가 아니다.

PNG는 `packages/web/scripts/prepare-review-png.mjs`로 **크기/배치를 유지한 적응형256색**으로 최적화했다. 각≤300,000B. 원본 색 PNG는 `packages/web/test-results/`에 남기며 이 문서용 이미지를 앱에 번들하지 않는다. 실제 색 대비 판정은 원본 앱의 axe/실기기 검사로 한다.

| 기존 프로토타입 | 캡처 |
|---|---|
| 홈 | [base-home.png](base-home.png) |
| 인게임 | [base-board.png](base-board.png) |
| 뻑 | [base-ppeok.png](base-ppeok.png) |
| 쪽 | [base-jjok.png](base-jjok.png) |

| 강화 변형 `variant=rich` | 캡처 |
|---|---|
| 판 테두리·좌석 슬롯 | [rich-feedback-play.png](rich-feedback-play.png) |
| 뻑: 붉은 파편 | [rich-upgrade-ppeok.png](rich-upgrade-ppeok.png) |
| 쪽: 청록 스파크 | [rich-upgrade-jjok.png](rich-upgrade-jjok.png) |
| 따닥: 금색 십자광 | [rich-upgrade-ttadak.png](rich-upgrade-ttadak.png) |
| 폭탄: 방사선·폭발 링 | [rich-upgrade-bomb.png](rich-upgrade-bomb.png) |
| 고 선언 | [rich-upgrade-go.png](rich-upgrade-go.png) |
| 뒤집기·이동 광택/잔광 | [rich-upgrade-motion.png](rich-upgrade-motion.png) |
| 정산: 최종 금액 고정·빛/입자 | [rich-settlement.png](rich-settlement.png) |

[조사·예산·성능](../../../research/visual-upgrade.md) · [실기기 절차](../../../device-test/visual-upgrade.md)

이미지 안의 확정 카드 도상은 [Commons 카드 출처·CC BY-SA 고지](../../../../packages/web/public/cards/ATTRIBUTION.md), 새 질감/도형은 [CC0·자체 제작 고지](../../../../packages/web/public/visual/NOTICE.md)를 따른다.
