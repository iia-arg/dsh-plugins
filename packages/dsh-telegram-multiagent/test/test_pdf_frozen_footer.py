"""Approved frozen footer links must never intersect renderer content or numbering."""
import copy
import importlib.util
import io
import json
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
FIXTURES = ROOT / 'test/fixtures/frozen-letterheads'
spec = importlib.util.spec_from_file_location('footer_pdf', ROOT / 'src/pdf-calculation.py')
renderer = importlib.util.module_from_spec(spec); spec.loader.exec_module(renderer)
INPUT = json.loads((ROOT / 'test/fixtures/legal-title-wrap.json').read_text())
LIMITS = {'general_portrait': 784.550764, 'general_landscape': 521.900937, 'legal': 768.500764}
MIN_TOP = {'general_portrait': 120, 'general_landscape': 96, 'legal': 140}


class FrozenFooterTests(unittest.TestCase):
    def check_pdf(self, data):
        brand = data['letterhead']
        output = renderer.make_pdf(data, templates_dir=FIXTURES)
        document = fitz.open(stream=output, filetype='pdf')
        template = fitz.open(FIXTURES / (brand + '.pdf'))
        footer_top = min(x['from'].y0 for x in template[0].get_links() if x['from'].y0 > template[0].rect.height/2)
        self.assertAlmostEqual(footer_top - 8, LIMITS[brand], places=3)
        total_spans = 0
        for i, page in enumerate(document):
            band = fitz.Rect(0, footer_top, page.rect.width, page.rect.height)
            self.assertEqual(page.get_pixmap(clip=band).samples, template[0].get_pixmap(clip=band).samples)
            texts = []
            for block in page.get_text('dict')['blocks']:
                for line in block.get('lines', []):
                    for span in line['spans']:
                        if span['font'] != 'DejaVuSans':
                            continue
                        total_spans += 1; texts.append(span['text'])
                        self.assertGreaterEqual(span['bbox'][1], MIN_TOP[brand], (i+1, span))
                        self.assertLessEqual(span['bbox'][3], LIMITS[brand] + 0.001, (i+1, span))
            self.assertTrue(any(x == 'Лист ' + str(i+1) for x in texts))
            self.assertTrue(any(x.startswith('Условия №') for x in texts))
        self.assertGreater(total_spans, 10, 'body probe found no renderer text')
        reader = PdfReader(io.BytesIO(output)); text=' '.join(('\n'.join(p.extract_text() for p in reader.pages)).split())
        quote = data.get('result', {}).get('quote', data.get('quote'))
        if data.get('result', {}).get('kind', data.get('kind')) != 'resident':
            for line in quote['lines']:
                label = ' '.join(line['label'].split())
                self.assertEqual(text.count(label), 1, label)
        expected_totals = {2103000: '2 103 000,00 ₽', 1820000: '1 820 000,00 ₽', 94500: '94 500,00 ₽'}
        self.assertIn(expected_totals[quote['total']], text)
        url = data.get('result', {}).get('url')
        if url:
            uris=[str(a.get_object().get('/A',{}).get('/URI','')) for p in reader.pages for a in p.get('/Annots',[])]
            self.assertIn(url, uris)
        return output

    def test_exact_api_accepted_title_repro_has_no_footer_intrusion(self):
        self.assertEqual(len(INPUT['result']['quote']['title']), 128)
        self.assertNotIn('\n', INPUT['result']['quote']['title'])
        self.check_pdf(copy.deepcopy(INPUT))

    def test_all_three_frozen_forms_with_short_and_wrapped_titles_plain_and_saved(self):
        for brand in LIMITS:
            for title in ('Контрольный расчёт', INPUT['result']['quote']['title']):
                for saved in (False, True):
                    with self.subTest(brand=brand, title=title[:15], saved=saved):
                        data = copy.deepcopy(INPUT); data['letterhead'] = brand; data['result']['quote']['title'] = title
                        if not saved:
                            data = {'kind': data['result']['kind'], 'quote': data['result']['quote'],
                                    'guestName': data['guestName'], 'letterhead': brand}
                        self.check_pdf(data)

    def test_prior_resident_and_biggroup_inputs_on_all_frozen_forms(self):
        quotes = json.loads((ROOT / 'test/fixtures/sh5-quotes.json').read_text())
        for kind in ('resident', 'biggroup'):
            for brand in LIMITS:
                with self.subTest(kind=kind, brand=brand):
                    data = {'kind': kind, 'quote': quotes[kind], 'guestName': 'Гость Ёжик 😀', 'letterhead': brand}
                    self.check_pdf(data)


if __name__ == '__main__':
    unittest.main(verbosity=2)
