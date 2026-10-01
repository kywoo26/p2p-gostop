# /// script
# requires-python = ">=3.14"
# dependencies = ["pillow==12.3.0"]
# ///
"""PA-05 / NF-03/07: select approved, graded #147 variants for the release skin.

No network or new runtime dependency. Re-run build-pro-assets.py first when a
texture original/crop changes; two user-reference action illustrations are
exported deterministically from pinned edited masters in build_skin_icons.py.
"""
from pathlib import Path
from build_skin_icons import EXPECTED, export
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
PRO = ROOT / 'public/pro'
OUT = ROOT / 'public/skin'
# Final HUD has no portrait/leather consumers; keep the source variants in the review pack.
IDS = ['felt', 'wood', 'gold', 'key-art']
manifest = {item['id']: item for item in json.loads((ROOT / 'assets-src/manifest.json').read_text())}
catalog = json.loads((ROOT / 'src/pro-assets/catalog.json').read_text())
check = '--check' in sys.argv
outputs = {}
records = []
for id in IDS:
    item = manifest[id]
    source = ROOT / 'assets-src' / item['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == item['sha256'], source
    if 'cardId' in item:
        assert hashlib.sha256((ROOT / f"public/cards/{item['cardId']}.svg").read_bytes()).hexdigest() == item['cardSha256']
    name = f'{id}-1x.webp'
    data = (PRO / name).read_bytes()
    variant = next(v for v in catalog[id]['variants'] if v['format'] == 'webp' and v['scale'] == 1)
    assert len(data) == variant['bytes'], name
    outputs[name] = data
    records.append(dict(id=id, file=name, bytes=len(data), width=variant['width'], height=variant['height'], sha256=hashlib.sha256(data).hexdigest(), source=item['source'], license=item['license'], changes=item['changes']))
for name in EXPECTED:
    data = export(name)
    filename = f'{name}-illustrated.webp'
    outputs[filename] = data
    records.append(dict(id=f'{name}-illustrated', file=filename, bytes=len(data), width=96, height=96, sha256=hashlib.sha256(data).hexdigest(), source='User-provided visual reference, 2026-09-30', license='User-provided reference; rights to be confirmed by product owner', changes='AI-assisted harmonization; transparent 96px WebP palette and size normalization.'))
outputs['NOTICE.md'] = ('# Hand action illustrations\n\nUser-provided bell and bomb image references (2026-09-30) were harmonized with AI image editing for this project. Edited PNG masters and source hashes: `assets-src/skin-icons/`. Release crops: 96px transparent WebP, matched outline and palette. The source rights should be confirmed by the product owner before release.\n').encode()
records.append(dict(id='skin-notice', file='NOTICE.md', bytes=len(outputs['NOTICE.md']), sha256=hashlib.sha256(outputs['NOTICE.md']).hexdigest(), source='Project asset provenance', license='See NOTICE.md', changes='Reference rights notice.'))
outputs['manifest.json'] = (json.dumps(records, ensure_ascii=False, indent=2) + '\n').encode()
# Full provenance already ships at /pro/NOTICE.md and is displayed by License.
assert sum(map(len, outputs.values())) <= 128 * 1024, 'Skin allocation exceeded; NF-03 whole-artifact limit is separate'
if check:
    assert set(p.name for p in OUT.iterdir()) == set(outputs), 'Unexpected/stale release assets'
    for name, data in outputs.items():
        assert (OUT / name).read_bytes() == data, name
else:
    OUT.mkdir(exist_ok=True)
    for old in OUT.iterdir():
        if old.is_file(): old.unlink()
    for name, data in outputs.items():
        (OUT / name).write_bytes(data)
print(f"PA-05: {len(IDS)} approved WebP variants + provenance, {sum(map(len, outputs.values())):,} bytes; {'verified' if check else 'generated'}")
