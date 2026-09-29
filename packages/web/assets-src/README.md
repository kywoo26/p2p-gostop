# PA-03 professional originals

Selected originals and explicitly marked derived portrait inputs, not entire downloaded packs. `manifest.json` pins every input SHA-256, source, author, preview, download, license, changes and intended group. Textures, museum art and audio are CC0-1.0. Hwatu-derived portraits retain CC BY-SA 4.0; original Commons cards are unchanged.

Run offline in the repository development image:

```sh
python3 packages/web/scripts/build-pro-assets.py
```

Outputs: `public/pro/`, `src/pro-assets/catalog.json`, generated `credits.ts`, local NOTICE.md and sizes.json. Image source dimensions cap 1x/2x/3x outputs; no artificial upscaling. WebP is runtime default; AVIF is a comparison/delivery option. Map originals are kept for future baking but only the Fabric normal influences the present bake. Source roughness is not used in a runtime PBR shader.

License records: Kenney packs include their original License.txt. ambientCG's [CC0 declaration](https://docs.ambientcg.com/license/) and para's [CC0 asset declaration](https://opengameart.org/content/animated-particle-effects-1) apply to their selected files. CC0 text: https://creativecommons.org/publicdomain/zero/1.0/legalcode . CC0 does not require attribution; we retain author/source/change history voluntarily and do not imply endorsement.

Paid/non-redistributable originals must not be added to this shared source directory. Any future inputs need recorded rights and provenance before ingestion. Do not replace card art. See `docs/design/art-direction.md` for the fixed palette, material and composition rules. No user-provided illustration is required.

## A 일관성 갱신 (PA-03 / NF-07)

UI Adventure/Animal Pack은 사용자 결정으로 제거했다. Met JP660 원본 JPG와 API 권리 기록은 met/, 기존 카드 SVG 도상에서 추출한 별도 PNG/좌표는 portraits/에 둔다. 원본 카드는 변경하지 않는다. 재현: `node packages/web/scripts/render-pro-portraits.mjs` → `python3 packages/web/scripts/build-pro-assets.py` → `python3 packages/web/scripts/check-pro-assets.py`. 초상은 CC BY-SA 4.0, 박물관 원화/재질/효과/소리는 CC0. manifest와 public/pro/NOTICE.md의 파일별 출처·변경 고지를 따른다.
