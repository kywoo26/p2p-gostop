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

The frame kit is an evaluation selection, not an approved final skin; animal avatars are temporary professional pack assets. Key visual and final portraits still need supplied/commissioned art. #104 HUD structure/10-card minimum-state work is not included on this main-based branch.

After the two review measurement scripts, publish review copies with:

```sh
docker compose run --rm dev python3 packages/web/scripts/publish-pro-captures.py
```
