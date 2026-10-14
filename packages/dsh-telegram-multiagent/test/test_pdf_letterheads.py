"""Real PDFs: selected brand, page geometry, safe bands and Unicode survive."""
import copy
import importlib.util
import io
from pathlib import Path
import unittest

import sys
try:
    import fitz  # PyMuPDF
except ImportError:
    # A-N-1948 №3: без PyMuPDF стенд не годен — СЛЕПОТА, код 2, а не ImportError с кодом 1 (то же значение кодов, что у vse-stendy).
    print('СЛЕПОТА: нет PyMuPDF (модуль fitz) — стенд не годен, это не расхождение', file=sys.stderr)
    sys.exit(2)
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / 'test/fixtures/letterheads'
spec = importlib.util.spec_from_file_location('brand_pdf', ROOT / 'src/pdf-calculation.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
SHORT = {'week': '2026-11-01', 'end': '2026-11-03', 'adults': 2, 'teens': 0,
         'mainMasters': 0, 'extraTeam': 0, 'total': 1250.5, 'version': 7,
         'lines': [{'label': 'Размещение Ёлка', 'amount': 1250.5}], 'warnings': []}


def payload(letterhead=None, long=False):
    quote = copy.deepcopy(SHORT)
    if long:
        quote['warnings'] = ['Проверка кириллицы Ёжик 😀; длинный расчёт, строка ' + str(i)
                             for i in range(1, 101)] + ['КОНЕЦ ПРЕДУПРЕЖДЕНИЙ']
    data = {'kind': 'group', 'quote': quote, 'guestName': 'Анна Ёжик 😀'}
    if letterhead is not None:
        data['letterhead'] = letterhead
    return data


class LetterheadTests(unittest.TestCase):
    def render(self, data):
        try:
            return renderer.make_pdf(data, templates_dir=TEMPLATES)
        except (TypeError, ValueError) as error:
            self.fail('Valid selected letterhead must produce PDF: ' + str(error))

    def assert_refused(self, data, directory):
        try:
            renderer.make_pdf(data, templates_dir=directory)
        except Exception as error:
            self.assertIsInstance(error, ValueError)
            self.assertRegex(str(error), 'бланк')
        else:
            self.fail('Invalid/missing letterhead must refuse, not produce PDF')

    def test_default_uses_portrait_brand(self):
        data = self.render(payload())
        document = fitz.open(stream=data, filetype='pdf')
        template = fitz.open(TEMPLATES / 'general_portrait.pdf')
        band = fitz.Rect(0, 0, template[0].rect.width, 120)
        self.assertEqual(document[0].get_pixmap(clip=band).samples,
                         template[0].get_pixmap(clip=band).samples)

    def test_three_choices_keep_brand_bands_and_body_on_every_page(self):
        for name, top in [('general_portrait', 120), ('general_landscape', 96), ('legal', 140)]:
            with self.subTest(letterhead=name):
                data = self.render(payload(name, long=True))
                document = fitz.open(stream=data, filetype='pdf')
                template = fitz.open(TEMPLATES / (name + '.pdf'))
                self.assertGreater(len(document), 1)
                self.assertEqual(document[0].rect, template[0].rect)
                for page in document:
                    band = fitz.Rect(0, 0, page.rect.width, top)
                    self.assertEqual(page.get_pixmap(clip=band).samples,
                                     template[0].get_pixmap(clip=band).samples)
                    if name != 'legal':
                        band = fitz.Rect(0, page.rect.height - 35, page.rect.width, page.rect.height)
                        self.assertEqual(page.get_pixmap(clip=band).samples,
                                         template[0].get_pixmap(clip=band).samples)
                    for block in page.get_text('dict')['blocks']:
                        for line in block.get('lines', []):
                            for span in line['spans']:
                                if span['font'] == 'DejaVuSans' and not span['text'].startswith(('Лист ', 'Условия №')):
                                    self.assertGreaterEqual(span['bbox'][1], top)
                                    self.assertLessEqual(span['bbox'][3], page.rect.height - 45)
                extracted = '\n'.join(p.extract_text() for p in PdfReader(io.BytesIO(data)).pages)
                self.assertIn('Анна Ёжик 😀', extracted)
                self.assertEqual(extracted.count('КОНЕЦ ПРЕДУПРЕЖДЕНИЙ'), 1)
                self.assertEqual(extracted.count('Анна Ёжик 😀'), 1)
                self.assertIn('1 250,50', extracted)

    def test_short_layouts_really_open_and_copy_cyrillic(self):
        for name in ('general_portrait', 'general_landscape', 'legal'):
            with self.subTest(letterhead=name):
                data = self.render(payload(name))
                reader = PdfReader(io.BytesIO(data))
                text = '\n'.join(p.extract_text() for p in reader.pages)
                self.assertIn('Анна Ёжик 😀', text)
                self.assertIn('Размещение Ёлка', text)
                self.assertIn('1 250,50', text)
                self.assertGreaterEqual(len(reader.pages), 1)

    def test_heading_and_item_number_stay_with_following_text(self):
        for name in ('general_portrait', 'general_landscape', 'legal'):
            for long in (False, True):
                with self.subTest(letterhead=name, long=long):
                    document = fitz.open(stream=self.render(payload(name, long)), filetype='pdf')
                    for page in list(document)[:-1]:
                        body = [span['text'] for block in page.get_text('dict')['blocks']
                                for line in block.get('lines', []) for span in line['spans']
                                if span['font'] == 'DejaVuSans' and not span['text'].startswith(('Лист ', 'Условия №'))]
                        self.assertFalse(body[-1].rstrip().endswith(':'), body[-1])

    def test_cancelled_and_unknown_choices_refuse_with_reason(self):
        for name in ('4', '5', 'general_portrait/../../legal', '', 1, None):
            data = payload()
            data['letterhead'] = name
            with self.subTest(name=name):
                self.assert_refused(data, TEMPLATES)

    def test_missing_templates_are_explicit_and_not_blank_pdf(self):
        for directory in (None, TEMPLATES / 'missing'):
            with self.subTest(directory=directory):
                self.assert_refused(payload(), directory)


if __name__ == '__main__':
    unittest.main(verbosity=2)
