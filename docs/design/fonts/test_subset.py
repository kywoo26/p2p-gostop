"""정상 네 폰트와 실패 gate. 원본 입력은 /inputs, 임시 출력은 컨테이너 /tmp."""
import json
from pathlib import Path
import tempfile
import unittest
from fontTools.ttLib import TTFont
from subset_font import build, validate_font

MANIFEST = json.loads(Path(__file__).with_name('sources.json').read_text())
TEXT = '맞고 먹을 패 선택 정산 뻑 쪽 0123456789+×냥'


class SubsetGates(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.out = Path(self.temp.name)
        self.entry = MANIFEST['fonts'][0]

    def run_build(self, entry=None, text=TEXT, budget=163840):
        return build(entry or self.entry, Path('/inputs'), self.out, text, budget)

    def test_four_candidates_roundtrip_and_determinism(self):
        for entry in MANIFEST['fonts']:
            with self.subTest(family=entry['family']):
                first, css = self.run_build(entry)
                second, _ = self.run_build(entry)
                self.assertEqual(first['subsetSha256'], second['subsetSha256'])
                self.assertEqual(len(set(first['tabularDigitWidths'])), 1)
                self.assertIn('U+B9DE', css)
                self.assertNotIn('https:', css)
                self.assertEqual((self.out / (entry['family'] + '-OFL.txt')).read_bytes(),
                                 (Path('/inputs') / entry['licenseFile']).read_bytes())

    def test_bad_hash_rejected(self):
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            self.run_build({**self.entry, 'sha256': '0' * 64})
        self.assertEqual(list(self.out.iterdir()), [])

    def test_missing_character_rejected(self):
        with self.assertRaisesRegex(ValueError, '누락'):
            self.run_build(text=TEXT + '\U0010ffff')

    def test_budget_rejected_before_write(self):
        with self.assertRaisesRegex(ValueError, '용량 초과'):
            self.run_build(budget=1)
        self.assertEqual(list(self.out.iterdir()), [])

    def test_tnum_loss_rejected(self):
        self.run_build()
        source = TTFont(Path('/inputs') / self.entry['source'])
        result = TTFont(self.out / (self.entry['family'] + '.woff2'))
        for record in result['GSUB'].table.FeatureList.FeatureRecord:
            if record.FeatureTag == 'tnum':
                record.FeatureTag = 'xxxx'
        with self.assertRaisesRegex(ValueError, 'tnum 소실'):
            validate_font(source, result, TEXT)


if __name__ == '__main__':
    unittest.main()
