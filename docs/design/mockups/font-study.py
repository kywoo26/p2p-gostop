"""문서용 OFL 서브셋 측정. Docker에서만 실행하며 앱 빌드에는 포함하지 않는다."""
from pathlib import Path
import hashlib
import json
import re
from fontTools import subset
from fontTools.ttLib import TTFont

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
rows = []
css = []
for source, family, license_file in [('Pretendard.woff2','VDPretendard','OFL.txt'),('SUIT.woff2','VDSUIT','SUIT-OFL.txt'),('Wanted.woff2','VDWanted','Wanted-OFL.txt'),('Noto.ttf','VDNoto','Noto-OFL.txt')]:
    src = inputs / source
    font = TTFont(src, recalcTimestamp=False)
    features = sorted({r.FeatureTag for t in ['GSUB','GPOS'] if t in font and font[t].table.FeatureList for r in font[t].table.FeatureList.FeatureRecord})
    cmap = font.getBestCmap()
    widths = [font['hmtx'][cmap[ord(c)]][0] for c in '0123456789']
    missing = ''.join(c for c in text if ord(c) not in cmap)
    options = subset.Options()
    options.flavor = 'woff2'
    options.hinting = False
    options.layout_features = ['*']
    options.name_IDs = ['*']
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    # OFL Reserved Font Name 준수: 문서용 수정본의 표시명·PS 이름을 별도 이름으로 교체.
    for record in font['name'].names:
        if record.nameID in [1,3,4,6,16,25]:
            record.string = family.encode(record.getEncoding())
    font.flavor = 'woff2'
    dest = output / (family + '.woff2')
    font.save(dest)
    license_text = '\n'.join(line.rstrip() for line in (inputs / license_file).read_text().splitlines())
    (output / (family + '-OFL.txt')).write_text(license_text + '\n')
    unicodes = ','.join(f'U+{n:X}' for n in sorted(font.getBestCmap()))
    css.append(f"@font-face{{font-family:{family};src:url('{family}.woff2') format('woff2');font-weight:100 900;font-display:swap;unicode-range:{unicodes}}}")
    rendered_bytes = None
    if rendered_text:
        from io import BytesIO
        preview = TTFont(src, recalcTimestamp=False)
        preview_subsetter = subset.Subsetter(options=options)
        preview_subsetter.populate(text=rendered_text)
        preview_subsetter.subset(preview)
        preview.flavor = 'woff2'
        buffer = BytesIO()
        preview.save(buffer)
        rendered_bytes = len(buffer.getvalue())
    rows.append(dict(source=source,family=family,inputBytes=src.stat().st_size,subsetBytes=dest.stat().st_size,renderedTextSubsetBytes=rendered_bytes,inputSha256=hashlib.sha256(src.read_bytes()).hexdigest(),subsetSha256=hashlib.sha256(dest.read_bytes()).hexdigest(),tnum='tnum' in features,defaultDigitWidths=widths,missing=missing))
(output / 'fonts.css').write_text('\n'.join(css)+'\n')
(output.parent / 'font-metrics.json').write_text(json.dumps(dict(corpusCharacters=len(chars),renderedTextCharacters=len(rendered_text),method='ASCII + Korean in web src .ts/.svelte including comments + prototype + symbols; all weights and OpenType features retained, hinting removed. renderedText is actual 18-screen DOM text excluding icon symbols.',fonts=rows),ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(corpusCharacters=len(chars),fonts=rows),ensure_ascii=False,indent=2))
