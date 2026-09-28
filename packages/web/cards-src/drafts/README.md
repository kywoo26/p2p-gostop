# 자체 제작 카드 시안 (디자인 트랙 D1 1단계, CC0 1.0)

`A/`(플랫 기하)와 `B/`(먹·붓 미니멀)의 SVG는 `packages/web/scripts/card-drafts.mjs`가 만든 **생성물**이다. 직접 고치지 말고 생성기를 고친 뒤 다시 만든다.

```
./dev.sh npm exec -w packages/web -- node scripts/card-drafts.mjs   # SVG
./dev.sh e2e -c scripts/card-preview.config.mjs                      # docs/design/preview-*.png
```

- 파일 이름은 엔진 카드 ID(`src/cards/map.json`)다. 표본: 0·1·2(1월 광·홍단·피), 32·33·34(9월 국진·청단·피), 44·45·46·47(12월 비광·열끗·비띠·쌍피), 50(보너스 3피), `back`(뒷면).
- 규칙·팔레트·예산: `docs/design/cards-style.md`. 조사: `docs/design/cards-research.md`.
- 앱은 아직 이 파일을 쓰지 않는다(`public/cards/`는 Commons 세트 그대로). 시안이 확정되면 2단계에서 교체한다.
- 모든 도형은 p2p-gostop 기여자가 좌표로 새로 그렸으며 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)으로 공개한다. 다른 화투·하나후다 세트의 그림을 따라 그리지 않았다.
