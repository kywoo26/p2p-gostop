# /// script
# requires-python = ">=3.14"  # 사용자 지시: 3.14 이상(성능)
# dependencies = []
# ///
"""PA-03: input hashes, excluded packs, Ogg repeatability and committed-output equality."""
from pathlib import Path
import hashlib, importlib.util, json, tempfile
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pro_audio', Path(__file__).with_name('pro-audio.py'))
audio = importlib.util.module_from_spec(spec); spec.loader.exec_module(audio)
manifest = json.loads((ROOT/'assets-src/manifest.json').read_text())
for item in manifest:
    assert item['pack'] not in ['ui-pack-adventure','animal-pack'], item['id']
    source = ROOT/'assets-src'/item['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == item['sha256'], source
    if 'cardId' in item:
        assert hashlib.sha256((ROOT/f"public/cards/{item['cardId']}.svg").read_bytes()).hexdigest() == item['cardSha256']
    if item['kind'] != 'audio': continue
    with tempfile.TemporaryDirectory() as tmp:
        targets = [Path(tmp)/'first.ogg',Path(tmp)/'second.ogg']
        for target in targets: audio.encode(source,target)
        hashes = [hashlib.sha256(p.read_bytes()).hexdigest() for p in [*targets,ROOT/'public/pro'/f"{item['id']}.ogg"]]
        assert len(set(hashes)) == 1, (item['id'],hashes)
        assert int.from_bytes(targets[0].read_bytes()[14:18],'little') == 0, 'Ogg stream serial'
        print(item['id'],hashes[0])
print('PA-03: input hashes, excluded packs, 5 Ogg repeat/committed hashes and serial=0 passed')
