# /// script
# requires-python = ">=3.12,<3.13"  # 이전 python:3.12 실행 환경과 같게 고정
# dependencies = ["fonttools==4.61.1", "brotli==1.2.0"]
# ///
"""OFL 로컬 입력 → 검증된 WOFF2/CSS/고지. `uv run`(PEP 723 고정 의존성), 네트워크 접근 없음."""
import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
from fontTools import subset
from fontTools.ttLib import TTFont


def digest(data):
    return sha256(data).hexdigest()


def features(font):
    return {r.FeatureTag for tag in ('GSUB', 'GPOS') if tag in font
            and font[tag].table.FeatureList
            for r in font[tag].table.FeatureList.FeatureRecord}


def digit_widths(font, tabular=False):
    """현재 후보의 tnum SingleSubst/Extension을 확인. 미지원 lookup은 추측하지 않고 실패."""
    glyphs = [font.getBestCmap()[ord(c)] for c in '0123456789']
    if tabular:
        table = font['GSUB'].table
        records = [r for r in table.FeatureList.FeatureRecord if r.FeatureTag == 'tnum']
        indices = dict.fromkeys(i for r in records for i in r.Feature.LookupListIndex)
        for index in indices:
            lookup = table.LookupList.Lookup[index]
            for sub in lookup.SubTable:
                kind = lookup.LookupType
                if kind == 7:
                    kind, sub = sub.ExtensionLookupType, sub.ExtSubTable
                if kind != 1:
                    raise ValueError('지원하지 않는 tnum lookup: 공식 shaping 검증 필요')
                glyphs = [sub.mapping.get(g, g) for g in glyphs]
    return [font['hmtx'][g][0] for g in glyphs]


def validate_font(source, output, text):
    missing = sorted(set(map(ord, text)) - output.getBestCmap().keys())
    if missing:
        raise ValueError(f'누락 글리프: {missing}')
    if 'tnum' in features(source) and 'tnum' not in features(output):
        raise ValueError('tnum 소실')
    source_widths = digit_widths(source, 'tnum' in features(source))
    output_widths = digit_widths(output, 'tnum' in features(output))
    if len(set(output_widths)) != 1 or source_widths != output_widths:
        raise ValueError('등폭 숫자 advance 불일치')
    axes = lambda f: [(a.axisTag, a.minValue, a.defaultValue, a.maxValue)
                      for a in f['fvar'].axes] if 'fvar' in f else []
    if axes(source) != axes(output):
        raise ValueError('가변 축 소실')
    return output_widths


def build(entry, inputs, output_dir, text, max_bytes):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9-]+', entry['family']):
        raise ValueError('수정본 family는 별도 ASCII 이름이어야 함')
    data = (inputs / entry['source']).read_bytes()
    license_data = (inputs / entry['licenseFile']).read_bytes()
    if digest(data) != entry['sha256'] or digest(license_data) != entry['licenseSha256']:
        raise ValueError('원본/라이선스 SHA-256 불일치')
    if 'SIL OPEN FONT LICENSE Version 1.1' not in license_data.decode():
        raise ValueError('OFL 1.1 고지 필요')
    text = ''.join(sorted(set(text) | set('0123456789')))
    source = TTFont(BytesIO(data), recalcTimestamp=False)
    if set(map(ord, text)) - source.getBestCmap().keys():
        raise ValueError('원본에 누락 글리프 존재')
    source_names = {n.toUnicode() for n in source['name'].names if n.nameID in (1, 4, 6, 16)}
    if entry['family'] in source_names:
        raise ValueError('Reserved Font Name 보호: 수정본 이름 분리 필요')
    font = TTFont(BytesIO(data), recalcTimestamp=False)
    options = subset.Options()
    options.flavor = 'woff2'
    options.hinting = False
    options.layout_features = ['*']
    options.name_IDs = ['*']
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    for record in font['name'].names:
        if record.nameID in (1, 3, 4, 6, 16, 25):
            record.string = entry['family'].encode(record.getEncoding())
    font.flavor = 'woff2'
    buffer = BytesIO()
    font.save(buffer)
    result = buffer.getvalue()
    # 직렬화한 실제 결과를 다시 열어 gate를 적용. 실패 시 출력하지 않는다.
    final = TTFont(BytesIO(result), recalcTimestamp=False)
    widths = validate_font(source, final, text)
    if len(result) > max_bytes:
        raise ValueError(f'폰트 용량 초과: {len(result)} > {max_bytes}')
    family = entry['family']
    codes = ','.join(f'U+{n:X}' for n in sorted(final.getBestCmap()))
    weights = next((f'{a.minValue:g} {a.maxValue:g}' for a in final['fvar'].axes
                    if a.axisTag == 'wght'), '400') if 'fvar' in final else '400'
    css = (f"@font-face{{font-family:{family};src:url('{family}.woff2') format('woff2');"
           f'font-weight:{weights};font-display:swap;unicode-range:{codes}}}')
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / f'{family}.woff2').write_bytes(result)
    (output_dir / f'{family}-OFL.txt').write_bytes(license_data)
    (output_dir / f'{family}.css').write_text(css + '\n')
    metrics = dict(source=entry['source'], family=family, inputBytes=len(data),
                   subsetBytes=len(result), inputSha256=digest(data), subsetSha256=digest(result),
                   licenseSha256=digest(license_data), corpusSha256=digest(text.encode()),
                   tnum='tnum' in features(final), defaultDigitWidths=digit_widths(source),
                   tabularDigitWidths=widths, missing='', maxBytes=max_bytes)
    (output_dir / f'{family}.json').write_text(json.dumps(metrics, indent=2) + '\n')
    return metrics, css


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--inputs', type=Path, required=True)
    parser.add_argument('--corpus', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--family', required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    if manifest['license'] != 'OFL-1.1':
        raise ValueError('OFL 폰트 전용')
    entry = next(e for e in manifest['fonts'] if e['family'] == args.family)
    # 코퍼스 파일 끝 개행은 표시 글리프가 아님. 내부 공백은 그대로 보존.
    metrics, _ = build(entry, args.inputs, args.output, args.corpus.read_text().rstrip('\n'), manifest['maxBytes'])
    print(json.dumps(metrics, indent=2))


if __name__ == '__main__':
    main()
