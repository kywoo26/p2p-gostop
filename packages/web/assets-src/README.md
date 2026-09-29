# PA-03 professional originals

Selected unmodified originals, not entire downloaded packs. `manifest.json` pins every input SHA-256, source, author, preview, download, license and intended group. All included art/audio is CC0-1.0; existing Commons cards are separate and retain their license.

Run offline in the repository development image:

```sh
docker compose run --rm dev python3 packages/web/scripts/build-pro-assets.py
```

Outputs: `public/pro/`, `src/pro-assets/catalog.json`, generated `credits.ts`, local NOTICE.md and sizes.json. Image source dimensions cap 1x/2x/3x outputs; no artificial upscaling. WebP is runtime default; AVIF is a comparison/delivery option. Map originals are kept for future baking but only the Fabric normal influences the present bake. Source roughness is not used in a runtime PBR shader.

License records: Kenney packs include their original License.txt. ambientCG's [CC0 declaration](https://docs.ambientcg.com/license/) and para's [CC0 asset declaration](https://opengameart.org/content/animated-particle-effects-1) apply to their selected files. CC0 text: https://creativecommons.org/publicdomain/zero/1.0/legalcode . CC0 does not require attribution; we retain author/source/change history voluntarily and do not imply endorsement.

Paid/non-redistributable originals must not be added to this shared source directory. User-supplied assets need recorded rights and provenance before ingestion. Do not replace card art. See `docs/research/pro-assets.md` for requested key art and portrait specifications.
