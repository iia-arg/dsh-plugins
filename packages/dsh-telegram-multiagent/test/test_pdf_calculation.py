"""Malformed API data must not become an apparently complete guest proposal."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest
import io
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ostrov_pdf', ROOT / 'src/pdf-calculation.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
original_make_pdf = renderer.make_pdf
def render_with_fixture(data):
    return original_make_pdf(data, templates_dir=ROOT / 'test/fixtures/letterheads')
renderer.make_pdf = render_with_fixture
QUOTES = json.loads((ROOT / 'test/fixtures/sh5-quotes.json').read_text())


class InputTests(unittest.TestCase):
    def test_unsupported_glyph_refuses_instead_of_silent_loss(self):
        quote = copy.deepcopy(QUOTES['resident']); quote['name'] = 'Гость 𝄞'
        with self.assertRaises(ValueError):
            renderer.make_pdf({'kind': 'resident', 'quote': quote, 'guestName': 'Гость'})

    def test_non_bmp_quote_and_guest_name_preserved_in_readable_pdf(self):
        quote = copy.deepcopy(QUOTES['resident'])
        quote['name'] = 'Гость 😀 Ёжик'
        pdf = renderer.make_pdf({'kind': 'resident', 'quote': quote, 'guestName': 'Анна 😀'})
        text = ' '.join(('\n'.join(page.extract_text() for page in PdfReader(io.BytesIO(pdf)).pages)).split())
        self.assertIn('Гость 😀 Ёжик', text)
        self.assertNotIn('Анна 😀', text)  # Marc projection uses quote.name when present.

    def test_malformed_dates_are_refused(self):
        for kind, start in [('group', 'week'), ('biggroup', 'week'), ('resident', 'arrival')]:
            with self.subTest(kind=kind):
                quote = copy.deepcopy(QUOTES[kind])
                quote[start] = 'garbage'
                with self.assertRaises(ValueError):
                    renderer.make_pdf({'kind': kind, 'quote': quote, 'guestName': 'Тест'})

    def test_missing_material_composition_is_refused(self):
        for kind in QUOTES:
            with self.subTest(kind=kind):
                quote = copy.deepcopy(QUOTES[kind])
                del quote['adults']
                with self.assertRaises(ValueError):
                    renderer.make_pdf({'kind': kind, 'quote': quote, 'guestName': 'Тест'})


if __name__ == '__main__':
    unittest.main(verbosity=2)
