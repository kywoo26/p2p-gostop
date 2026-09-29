# /// script
# requires-python = ">=3.14"  # 사용자 지시: 3.14 이상(성능)
# dependencies = ["pillow==12.3.0"]
# ///
"""PA-03: uv-pinned Pillow + Ubuntu 24.04 apt FFmpeg/libavif (tools/setup-host.sh); offline conversion, provenance and byte inventory."""
from pathlib import Path
try:
    from PIL import Image, ImageOps, ImageChops, ImageDraw
except ModuleNotFoundError:
    raise SystemExit(f'Pillow가 없다. uv로 실행한다(PEP 723 의존성 자동 설치): uv run {__file__}')
import hashlib, json, subprocess, tempfile, importlib.util
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets-src'
OUT = ROOT / 'public/pro'
OUT.mkdir(parents=True, exist_ok=True)
# Generated directory only: prevent excluded packs/stale variants surviving a rebuild.
for old in OUT.iterdir():
    if old.is_file(): old.unlink()
audio_spec = importlib.util.spec_from_file_location('pro_audio', Path(__file__).with_name('pro-audio.py'))
audio = importlib.util.module_from_spec(audio_spec); audio_spec.loader.exec_module(audio)
manifest = json.loads((SRC / 'manifest.json').read_text())
catalog = {}
notices = []
for item in manifest:
    source = SRC / item['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == item['sha256'], source
    if 'cardId' in item:
        assert hashlib.sha256((ROOT / f"public/cards/{item['cardId']}.svg").read_bytes()).hexdigest() == item['cardSha256']
    notices.append({k:item[k] for k in ['id','author','license','source','sha256','file','licenseUrl','changes']})
    if item['kind'] == 'map': continue
    id = item['id']
    record = {'group':item['group'], 'variants':[]}
    if item['kind'] == 'audio':
        for ext in ['ogg','m4a']:
            target = OUT / f'{id}.{ext}'
            audio.encode(source,target)
            record['variants'].append({'url':f'/pro/{target.name}','bytes':target.stat().st_size,'format':ext,'scale':1,'width':0,'height':0})
    else:
        original = Image.open(source).convert('RGBA')
        if id == 'felt':
            # Professional fabric albedo + supplied normal/roughness, baked once; no runtime shader.
            normal = SRC / item['file'].replace('_Color','_NormalGL')
            gray = ImageOps.grayscale(original)
            if normal.exists():
                light = Image.open(normal).convert('RGB').getchannel('G')
                gray = ImageChops.multiply(gray,light.point(lambda v: int(160+v*95/255)))
            original = ImageOps.colorize(gray,'#071914','#417c64').convert('RGBA')
        grades = {'wood':('#100d0c','#79604a'), 'leather':('#0d1916','#34463b'), 'gold':('#51442c','#baa16a')}
        if id in grades:
            original = ImageOps.colorize(ImageOps.grayscale(original),*grades[id]).convert('RGBA')
        if item['kind'] in ['art','portrait']:
            if item['kind']=='art':
                w,h=original.size; original=original.crop(tuple(round(v*(w if i%2==0 else h)) for i,v in enumerate(item['crop'])))
            original=ImageOps.colorize(ImageOps.autocontrast(ImageOps.grayscale(original)), '#182e28','#e9d9b5').convert('RGBA')
            if item['kind']=='portrait':
                mask=Image.new('L',original.size);ImageDraw.Draw(mask).ellipse((1,1,original.width-2,original.height-2),fill=255);original.putalpha(mask)
        if item['kind']=='atlas':
            accent={'ppeok':'#b87564','jjok':'#82bcac','ttadak':'#d2b679','bomb':'#d49365','smoke':'#8e9d91'}[id]
            alpha=original.getchannel('A'); gray=ImageOps.grayscale(original)
            original=ImageOps.colorize(gray,black='#162820',mid=accent,white='#fff0cf',midpoint=145).convert('RGBA');original.putalpha(alpha)
        if item['kind']=='atlas':
            # Original 8x8 animation: preserve all 64 frames and transparent edge, repack each tier.
            record['frames']=64; record['columns']=8
        for scale in [1,2,3]:
            side = min(item['base']*scale*(8 if item['kind']=='atlas' else 1),max(original.size))
            im=original.copy();im.thumbnail((side,side),Image.Resampling.LANCZOS)
            for ext in ['webp','avif']:
                target=OUT/f'{id}-{scale}x.{ext}'
                if ext=='webp':im.save(target,quality=88,method=6)
                else:
                    with tempfile.NamedTemporaryFile(suffix='.png') as tmp:
                        im.save(tmp.name);subprocess.run(['avifenc','--jobs','2','--speed','8','--min','20','--max','30',tmp.name,str(target)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                record['variants'].append({'url':f'/pro/{target.name}','bytes':target.stat().st_size,'format':ext,'scale':scale,'width':im.width,'height':im.height})
        catalog[id]=record
    catalog[id]=record
# Atlas packing of professionally drawn individual particles (no new painted shapes).
particles=[x for x in manifest if x['kind']=='particle']
atlas=Image.new('RGBA',(128*len(particles),128))
rects={}
for n,item in enumerate(particles):
    im=Image.open(SRC/item['file']).convert('RGBA');im.thumbnail((128,128),Image.Resampling.LANCZOS)
    atlas.paste(im,(n*128,0));rects[item['id']]={'x':n*128,'y':0,'width':im.width,'height':im.height}
atlas.save(OUT/'particles.webp',quality=90)
(OUT/'particles.json').write_text(json.dumps(rects,indent=2)+'\n')
(ROOT/'src/pro-assets/catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
# Credits are displayed text, never requested remotely. Exact source allowlist for NF-01 scanner.
credits=list({(x['author'],x['source']):(dict(author=x['author'],source=x['source'],license=x['license'],licenseUrl=x['licenseUrl'],changes=x['changes'])) for x in notices}.values())
(ROOT/'src/pro-assets/credits.ts').write_text('// Generated by build-pro-assets.py; PA-03 / NF-07.\nexport const PRO_CREDITS = '+json.dumps(credits,indent=2)+' as const;\nexport const PRO_ATTRIBUTION_URLS = PRO_CREDITS.flatMap((item) => [item.source, item.licenseUrl]);\n')
# Markdown is local downloadable provenance, not a runtime network manifest.
(OUT/'NOTICE.md').write_text('# Professional assets / CC0 and CC BY-SA 4.0\n\nResize, color grading, normal-light baking, atlas packing, WebP/AVIF and audio transcoding.\n\n'+'\n'.join(f"- {x['id']}: {x['author']} / {x['source']} / {x['license']} / SHA256 {x['sha256']} / original {x['file']} / license {x['licenseUrl']} / changes: {x['changes']}" for x in notices)+'\n')
report={'originalBytes':sum((SRC/f).stat().st_size for f in {x['file'] for x in manifest}),'outputBytesExcludingReport':sum(p.stat().st_size for p in OUT.iterdir() if p.name != 'sizes.json'),'files':{p.name:p.stat().st_size for p in sorted(OUT.iterdir()) if p.name != 'sizes.json'}}
(OUT/'sizes.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='files'}))

subprocess.run(['node',str(ROOT.parent.parent/'node_modules/prettier/bin/prettier.cjs'),'--write',str(ROOT/'src/pro-assets/catalog.json'),str(ROOT/'src/pro-assets/credits.ts')],check=True)
