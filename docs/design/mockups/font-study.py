"""문서용 OFL 서브셋 측정. Docker에서만 실행하며 앱 빌드에는 포함하지 않는다."""
from pathlib import Path
import json
import re

root = Path('/work')
inputs = Path('/inputs')
output = root / 'docs/design/mockups/fonts'
chars = set(chr(n) for n in range(32, 127)) | set('×→↗·…냥뻑쪽따닥쓸광열끗띠피')
# 번역 카탈로그가 없는 현 단계의 보수적 상한: 앱 소스의 한국어 주석도 포함.
for path in (root / 'packages/web/src').rglob('*'):
    if path.suffix in ('.svelte', '.ts'):
        chars.update(re.findall(r'[가-힣ㄱ-ㅣ]', path.read_text()))
chars.update(re.findall(r'[가-힣ㄱ-ㅣ]', (output.parent / 'prototype.html').read_text()))
text = ''.join(sorted(chars))
(output / 'corpus.txt').write_text(text + '\n')
rendered_files = list((output.parent / '.rendered').glob('*.txt'))
rendered_path = output / 'rendered-corpus.txt'
if len(rendered_files) == 18:
    rendered = set(''.join(path.read_text() for path in rendered_files)) & chars
    rendered_path.write_text(''.join(sorted(rendered)) + '\n')
rendered_text = rendered_path.read_text().strip() if rendered_path.exists() else ''
# 공통 OFL 파이프라인의 해시·글리프·tnum·용량 gate를 모든 후보에 동일 적용.
import sys
import tempfile
sys.path.insert(0, str(root / 'docs/design/fonts'))
from subset_font import build
manifest = json.loads((root / 'docs/design/fonts/sources.json').read_text())
rows, css = [], []
for entry in manifest['fonts']:
    metrics, face = build(entry, inputs, output, text, manifest['maxBytes'])
    with tempfile.TemporaryDirectory() as temp:
        preview, _ = build(entry, inputs, Path(temp), rendered_text, manifest['maxBytes'])
    metrics['renderedTextSubsetBytes'] = preview['subsetBytes']
    rows.append(metrics)
    css.append(face)
    # 통합 측정 JSON/CSS가 정본. 공통 CLI 단독 실행의 개별 파일은 여기에 중복하지 않는다.
    (output / (entry['family'] + '.json')).unlink()
    (output / (entry['family'] + '.css')).unlink()
(output / 'fonts.css').write_text('\n'.join(css) + '\n')
(output.parent / 'font-metrics.json').write_text(json.dumps(dict(
    corpusCharacters=len(chars), renderedTextCharacters=len(set(rendered_text)),
    method='ASCII + Korean in web source including comments + prototype + symbols; all weights/features retained; no hinting. Output checked for cmap, tnum/digit advances, axes, hashes and 160 KiB gate.',
    fonts=rows), ensure_ascii=False, indent=2) + '\n')
print(json.dumps(rows, ensure_ascii=False, indent=2))
