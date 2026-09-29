# 고스톱 구현·화투 자산 조사 결론

2026-09-28 조사. 게임 규칙의 기대값은 [rules-commercial §12](rules-commercial.md#12-권장-기본-규칙-세트)에서만 도출한다. 다른 구현의 테스트 출력은 정답이 아니다.

## 구현 참고 범위

| 자료 | 결론·사용 범위 |
|---|---|
| [itsent-lab/hwatu](https://github.com/itsent-lab/hwatu), MIT | 테스트 벡터 구조와 공개/비공개 상태 분리 설계를 참고한다. 규칙 값은 독립 검증한다. |
| [bipark/gostop-ts](https://github.com/bipark/gostop-ts), PolyForm Noncommercial | 설계만 읽는다. 코드 복사 금지. |
| [civilian7/gostop](https://github.com/civilian7/gostop), PolyForm Noncommercial | 시뮬레이션·AI 문서만 읽는다. 코드·이미지 복사 금지. |
| [ctbot000/go-stop-game](https://github.com/ctbot000/go-stop-game), MIT | 이벤트 구조 참고 가능. 따닥 등 규칙 오류는 채택하지 않는다. |
| [boardgame.io](https://github.com/boardgameio/boardgame.io), MIT | playerView/호스트 권위 개념 참고. P2P 패키지는 의존성으로 채택하지 않는다. |
| 라이선스 불명·테스트 부재 또는 규칙 오류가 큰 저장소 | 사용하지 않는다. 무라이선스 코드·자산 복사 금지. |

조사 대상 사이에 분배·피박·고·특수 이벤트 해석이 달랐다. 엔진은 자체 순수 상태 전이와 JSON 규칙 벡터로 구현하며, 외부 코드를 이식하지 않는다.

## 카드 자산과 고지

[Wikimedia Commons SVG Hwatu](https://commons.wikimedia.org/wiki/Category:SVG_Hwatu)의 48장(저작자 Spenĉjo, Marcus Richert, Louie Mantia Jr.)을 CC BY-SA 4.0으로 채택했다. 수정 SVG와 파생 초상도 같은 라이선스와 원본 링크·변경 고지를 유지한다. 카드는 로컬에 번들하며 CDN을 쓰지 않는다. 보너스 카드와 뒷면은 별도 제작한다. 실제 고지는 [카드 ATTRIBUTION](../../packages/web/public/cards/ATTRIBUTION.md)과 [LICENSE](../../packages/web/public/cards/LICENSE)에 있다.
