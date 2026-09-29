# Professional asset review captures

**예산 개정 승인 전 / 평가용.** `design/pro-assets`, production-mode evaluation build (`PRO_ASSET_REVIEW=1`), Chromium, 412×915 CSS px / DPR1. Actual Home, Board and Settlement components; Commons card SVGs unchanged. PNGs are palette-optimized at original dimensions, each≤300KB; full-color originals remain in `packages/web/test-results/pro-assets/`.

| 화면 | PNG |
|---|---|
| 홈 | [home](home.png) |
| 판·HUD·아바타 | [board](board.png) |
| 뻑 | [ppeok](pro-ppeok.png) |
| 쪽 | [jjok](pro-jjok.png) |
| 따닥 | [ttadak](pro-ttadak.png) |
| 폭탄 | [bomb](pro-bomb.png) |
| 고 | [go](pro-go.png) |
| 정산 | [settlement](settlement.png) |

`measurements.json` records desktop Chromium/WebKit rAF cadence (3×5s event bursts per DPR), per-screen resources and zero external requests. This is **not** physical Galaxy/iPhone FPS. `throttle.json` records the separate WebKit shared-bandwidth response-delay experiment; no real radio/packet loss/CPU throttle. See [research](../../../research/pro-assets.md) for budget exclusions and proposed NF-03 wording, [device procedure](../../../device-test/pro-assets.md) for unperformed physical checks.

[Art direction](../../art-direction.md): ink/paper/brass, own CSS frames, Met public-domain crane/pine crops and twelve CC BY-SA Hwatu-derived portraits. Kenney RPG frames and animal faces are removed. Original cards remain unchanged. #104 HUD structure/10-card minimum-state work is not included on this main-based branch.

After the two review measurement scripts, publish review copies with:

```sh
docker compose run --rm dev python3 packages/web/scripts/publish-pro-captures.py
```

[월별 초상 12종](avatars.png)은 출력 자산을 합성한 별도 contact sheet이며 실제 앱 화면 8장과 구분한다. 숫자는 월이다. 학/사슴은 현재 Board 좌석에 적용했다.

#104는 구조·표식·HUD 정보 설계와 기본 A 외관을 먼저 통합한다. 이 전문 질감/프레임/일러스트 스킨은 #147 아트 디렉션 확정 후 별도 구현 PR에서 #104 구조에 적용한다.
