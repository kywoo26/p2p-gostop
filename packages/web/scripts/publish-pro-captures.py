"""PA-04: PNG review copies only. Never quantize app assets or regression baselines."""
from pathlib import Path
from PIL import Image
import shutil

root = Path(__file__).resolve().parents[3]
source = root / 'packages/web/test-results/pro-assets'
target = root / 'docs/design/mockups/pro'
target.mkdir(parents=True, exist_ok=True)
for path in sorted(source.glob('*.png')):
    image = Image.open(path).convert('RGB')
    assert image.size == (412, 915), path
    output = target / path.name
    image.quantize(colors=256, method=Image.Quantize.MEDIANCUT).save(output, optimize=True)
    assert output.stat().st_size <= 300_000, output
    print(output.name, output.stat().st_size)
for name in ['measurements.json', 'throttle.json']:
    path = source / name
    if path.exists():
        shutil.copyfile(path, target / name)
