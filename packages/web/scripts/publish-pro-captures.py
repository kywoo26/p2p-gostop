# /// script
# requires-python = ">=3.12,<3.13"  # Pillow 10.2.0의 PyPI 휠이 cp312까지만 있다. uv가 3.12를 받는다.
# dependencies = ["pillow==10.2.0"]
# ///
"""PA-04: PNG review copies only. Never quantize app assets or regression baselines."""
from pathlib import Path
try:
    from PIL import Image
except ModuleNotFoundError:
    raise SystemExit(f'Pillow가 없다. uv로 실행한다(PEP 723 의존성 자동 설치): uv run {__file__}')
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
