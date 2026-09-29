# /// script
# requires-python = ">=3.14"
# dependencies = ["pillow==12.3.0"]
# ///
"""Optimize two user-supplied icon references edited into one visual family.

This is a deterministic raster export from pinned AI-assisted artwork. The
full-resolution edited PNGs and source hashes stay under assets-src/skin-icons.
"""
from io import BytesIO
from pathlib import Path
import hashlib
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'assets-src/skin-icons'
OUTPUT = ROOT / 'public/skin'
EXPECTED = {
    'bomb': '924cc8782f2cc53af51f56a925ca2b1e4b72d7484cbf75194909a3b5b954d0e5',
    'bell': '113d4613593f70173a059aa727ce644066264a1c8f3864be4425b72d4e2ee713',
}

def export(name: str) -> bytes:
    source = INPUT / f'{name}-edited.png'
    assert hashlib.sha256(source.read_bytes()).hexdigest() == EXPECTED[name], source
    with Image.open(source) as img:
        rgba = img.convert('RGBA')
        box = rgba.getchannel('A').getbbox()
        assert box is not None
        crop = rgba.crop(box)
        # One centered square and matched 6px safe area for both actions.
        square = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
        scale = min(84 / crop.width, 84 / crop.height)
        resized = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.Resampling.LANCZOS)
        square.alpha_composite(resized, ((96 - resized.width) // 2, (96 - resized.height) // 2))
        buffer = BytesIO()
        square.save(buffer, format='WEBP', quality=78, method=6, exact=True)
        return buffer.getvalue()

def run() -> None:
    check = '--check' in sys.argv
    for name in EXPECTED:
        data = export(name)
        target = OUTPUT / f'{name}-illustrated.webp'
        if check:
            assert target.read_bytes() == data, target
        else:
            target.parent.mkdir(exist_ok=True)
            target.write_bytes(data)
        print(f'{target.name}: {len(data)} bytes; deterministic')

if __name__ == '__main__':
    run()
