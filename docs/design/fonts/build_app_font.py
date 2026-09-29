# /// script
# requires-python = ">=3.14"  # 사용자 지시: 3.14 이상(성능)
# dependencies = ["fonttools==4.61.1", "brotli==1.2.0"]
# ///
"""확정 A의 앱 폰트 생성. `uv run`, 입력 디렉터리(FONT_INPUTS, 기본 /tmp/visual-research)에 고정 원본/OFL 필요."""
import json
import os
from pathlib import Path
import re
from subset_font import build

root = Path(__file__).resolve().parents[3]
inputs = Path(os.environ.get('FONT_INPUTS', '/tmp/visual-research'))
manifest = json.loads(Path(__file__).with_name('sources.json').read_text())
entry = {**manifest['fonts'][0], 'family': 'GostopSans'}
# 번역 카탈로그가 없는 현재 구조: 실제 UI를 포함하는 보수적 superset.
# 테스트 제외, 나머지 web 소스/갤러리 fixture의 한국어 주석도 포함한다.
chars = set(chr(n) for n in range(32, 127)) | set('×→←↗·…—냥뻑쪽따닥')
for path in (root / 'packages/web/src').rglob('*'):
    if path.suffix in ('.svelte', '.ts') and '.test.' not in path.name and path.name != 'test-setup.ts':
        chars.update(re.findall(r'[가-힣ㄱ-ㅣ]', path.read_text()))
chars.update(re.findall(r'[가-힣ㄱ-ㅣ]', (root / 'packages/engine/src/reduce.ts').read_text()))
output = root / 'packages/web/src/styles/fonts'
text = ''.join(sorted(chars))
metrics, _ = build(entry, inputs, output, text, manifest['maxBytes'])
# 원문 전체는 라이선스 화면에서 raw import. JSON/코퍼스는 docs에만 보관.
(output / 'GostopSans.json').unlink()
Path(__file__).with_name('app-corpus.txt').write_text(text + '\n')
Path(__file__).with_name('app-metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
print(json.dumps(metrics, indent=2))
