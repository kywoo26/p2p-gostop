# PA-03 professional originals

Selected originals and explicitly marked derived portrait inputs, not entire downloaded packs. `manifest.json` pins every input SHA-256, source, author, preview, download, license, changes and intended group. Textures, museum art and audio are CC0-1.0. Hwatu-derived portraits retain CC BY-SA 4.0; original Commons cards are unchanged.

Run offline in the repository development image:

```sh
uv run packages/web/scripts/build-pro-assets.py
```

Outputs: `public/pro/`, `src/pro-assets/catalog.json`, generated `credits.ts`, local NOTICE.md and sizes.json. Image source dimensions cap 1x/2x/3x outputs; no artificial upscaling. WebP is runtime default; AVIF is a comparison/delivery option. Map originals are kept for future baking but only the Fabric normal influences the present bake. Source roughness is not used in a runtime PBR shader.

License records: Kenney packs include their original License.txt. ambientCG's [CC0 declaration](https://docs.ambientcg.com/license/) and para's [CC0 asset declaration](https://opengameart.org/content/animated-particle-effects-1) apply to their selected files. CC0 text: https://creativecommons.org/publicdomain/zero/1.0/legalcode . CC0 does not require attribution; we retain author/source/change history voluntarily and do not imply endorsement.

Paid/non-redistributable originals must not be added to this shared source directory. Any future inputs need recorded rights and provenance before ingestion. Do not replace card art. See `docs/design/art-direction.md` for the fixed palette, material and composition rules. No user-provided illustration is required.

## A 일관성 갱신 (PA-03 / NF-07)

UI Adventure/Animal Pack은 사용자 결정으로 제거했다. Met JP660 원본 JPG와 API 권리 기록은 met/, 기존 카드 SVG 도상에서 추출한 별도 PNG/좌표는 portraits/에 둔다. 원본 카드는 변경하지 않는다. 재현: `node packages/web/scripts/render-pro-portraits.mjs` → `uv run packages/web/scripts/build-pro-assets.py` → `uv run packages/web/scripts/check-pro-assets.py`. 초상은 CC BY-SA 4.0, 박물관 원화/재질/효과/소리는 CC0. manifest와 public/pro/NOTICE.md의 파일별 출처·변경 고지를 따른다.

## 본선 스킨 선별 (PA-05)

`uv run packages/web/scripts/build-skin-assets.py`는 승인된 pro 변환물에서 재질4·홈 화조도1·12달 초상1x WebP만 `public/skin`으로 선별한다. 원본/카드 SHA와 pro catalog 크기를 먼저 확인한다. `--check`는 선별 결과의 바이트 동일성·추가/누락 파일·128KiB 하위 예산을 검증하며 정규 build에서 자동 실행된다. 원본·가공 좌표 변경 시 pro 파이프라인부터 재생성한다. 전체 dist 1.5MiB 예산과 평가 팩 분리는 유지한다. 출처/변경/라이선스는 기존 License 화면·`/pro/NOTICE.md`, 본선 파일 해시는 `/skin/manifest.json`에 기록한다.

사용자가 제공한 폭탄·종 그림을 같은 먹선/금·주홍 팔레트로 편집한 투명 PNG 두 종은 `skin-icons/`에 보존한다. SHA가 고정된 원본을 `scripts/build_skin_icons.py`가 결정적으로96px WebP로 변환하고 `build-skin-assets.py`의 `--check`가 배포 바이트를 검증한다. 출처와 가공은 `public/skin/NOTICE.md`에 기록하며 사용 권리 확인은 제품 소유자가 릴리스 전에 완료한다. 빌드 중 외부 요청은 없다.
