# 클래식 화투 리마스터 — 1단계 표본

이 디렉터리의 SVG 원본은 한국 화투의 공통 도상과 구도를 바탕으로 새 좌표로 직접 그렸다. Wikimedia Commons SVG의 경로나 윤곽을 복사하거나 트레이싱하지 않았다. 이 그림의 저작권과 저작인접권을 법이 허용하는 범위에서 포기하고 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)으로 공개한다.

- 표본 카드: `0`, `1`, `2`, `8`, `28`, `29`, `32`, `43`, `44`, `47`
- 추가 자산: `50`(뺏기 3피), `back`
- 형식: `viewBox="0 0 100 160"`, 외부 URL·글꼴·필터·그라디언트·`<text>` 없음
- `optimized/`: `./dev.sh npm exec -w packages/web -- node scripts/build-classic.mjs`의 결정적 svgo 결과
- 미리보기: `./dev.sh e2e -c scripts/card-preview.config.mjs --grep preview-classic`

1단계 표본이다. 현재 앱 카드와 카드 맵은 교체하지 않았다.
