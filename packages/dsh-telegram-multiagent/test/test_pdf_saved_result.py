"""Saved DTO links must survive actual PDF annotations, legacy quote stays usable."""
import copy
import importlib.util
import io
from pathlib import Path
import unittest

from pypdf import PdfReader
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('saved_pdf', ROOT / 'src/pdf-calculation.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
QUOTE = {'week': '2026-11-01', 'end': '2026-11-03', 'adults': 2, 'teens': 0,
         'mainMasters': 0, 'extraTeam': 0, 'total': 1250.5, 'version': 7,
         'lines': [{'label': 'Проживание Ёжик 😀', 'amount': 1250.5}], 'warnings': []}
URL = 'https://ostrov.center/calculator?view=1&part=2#plan=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
TEMPLATES = ROOT / 'test/fixtures/letterheads'


def payload(saved=True):
    data = {'kind': 'group', 'guestName': 'Анна Ёжик 😀'}
    if saved:
        data['result'] = {'kind': 'group', 'quote': copy.deepcopy(QUOTE), 'url': URL,
                          'documentVersion': 2, 'updatedAt': '2026-10-06T18:00:00Z'}
    else:
        data['quote'] = copy.deepcopy(QUOTE)
    return data


def links(reader):
    return [str(a.get_object().get('/A', {}).get('/URI', '')) for page in reader.pages
            for a in page.get('/Annots', [])]


class SavedResultTests(unittest.TestCase):
    def render(self, data):
        try:
            return renderer.make_pdf(data, templates_dir=TEMPLATES)
        except Exception as error:
            self.fail('Valid saved DTO must render: ' + str(error))

    def test_saved_url_visible_and_annotation_target_is_exact_for_each_brand(self):
        for letterhead in ('general_portrait', 'general_landscape', 'legal'):
            with self.subTest(letterhead=letterhead):
                data = payload(); data['letterhead'] = letterhead
                reader = PdfReader(io.BytesIO(self.render(data)))
                text = '\n'.join(page.extract_text() for page in reader.pages)
                self.assertIn(URL, text)
                self.assertIn(URL, links(reader))
                self.assertIn('Анна Ёжик 😀', text)

    def test_legacy_quote_does_not_acquire_saved_url(self):
        reader = PdfReader(io.BytesIO(self.render(payload(False))))
        self.assertNotIn(URL, links(reader))
        self.assertNotIn('Сохранённый расчёт', '\n'.join(p.extract_text() for p in reader.pages))

    def test_total_is_guest_money_format_without_recalculation(self):
        for amount, expected in [(1250.5, '1 250,50 ₽'), (1234567.89, '1 234 567,89 ₽'), (0, '0,00 ₽')]:
            with self.subTest(amount=amount):
                data = payload(False); data['quote']['total'] = amount
                reader = PdfReader(io.BytesIO(self.render(data)))
                text = '\n'.join(p.extract_text() for p in reader.pages)
                self.assertIn('Итого: ' + expected, text)

    def test_ambiguous_quote_and_result_are_refused(self):
        data = payload(); data['quote'] = copy.deepcopy(QUOTE)
        with self.assertRaises(ValueError):
            renderer.make_pdf(data, templates_dir=TEMPLATES)

    def test_invalid_or_missing_saved_url_does_not_fall_back_to_plain_pdf(self):
        for url in (None, '', 'javascript:alert(1)', 'file:///etc/hosts', 'https://ostrov.me/x\n', 'https://user:password@ostrov.me/x'):
            with self.subTest(url=url):
                data = payload(); data['result']['url'] = url
                try:
                    renderer.make_pdf(data, templates_dir=TEMPLATES)
                except Exception as error:
                    self.assertIsInstance(error, ValueError)
                else:
                    self.fail('Invalid saved link produced a PDF')

    def test_saved_metadata_is_not_completed_from_model_arguments(self):
        for field in ('kind', 'updatedAt'):
            data = payload(); del data['result'][field]
            with self.subTest(missing=field):
                with self.assertRaises(ValueError):
                    renderer.make_pdf(data, templates_dir=TEMPLATES)

    def test_explicit_null_duplicate_kind_is_not_omitted_kind(self):
        data = payload(); data['kind'] = None
        with self.assertRaises(ValueError):
            renderer.make_pdf(data, templates_dir=TEMPLATES)

    def test_saved_kind_mismatch_refused(self):
        data = payload(); data['result']['kind'] = 'resident'
        with self.assertRaises(ValueError):
            renderer.make_pdf(data, templates_dir=TEMPLATES)


if __name__ == '__main__':
    unittest.main(verbosity=2)
