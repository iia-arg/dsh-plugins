"""Marc-approved guest projection: no price arithmetic and no diagnostic dump."""
import copy
import importlib.util
import io
from pathlib import Path
import unittest
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('guest_pdf', ROOT / 'src/pdf-calculation.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
TEMPLATES = ROOT / 'test/fixtures/letterheads'
GROUP = {'week': '2026-11-01', 'end': '2026-11-03', 'adults': 2, 'teens': 0,
         'mainMasters': 0, 'extraTeam': 0, 'attendees': 2, 'total': 1250.5, 'version': 7,
         'lines': [{'label': 'Проживание Ёжик 😀', 'amount': 1400},
                   {'label': 'Льгота', 'amount': -149.5}], 'warnings': [],
         'settings': {'doNotDump': 'NEVER_DUMP_INTERNAL'}}
RESIDENT = {'kind': 'resident', 'name': 'Серверный Гость 😀', 'version': 7,
            'arrival': '2027-06-01', 'departure': '2027-06-15', 'nights': 14,
            'adults': 2, 'children': [7], 'guests': 3, 'payingGuests': 2.5,
            'resourceName': 'Старое имя комнаты',
            'rooms': [{'resourceName': 'Дом Ёлка', 'occupancy': 3, 'adults': 2, 'children': [7]}],
            'housingTotal': 35000, 'foodTotal': 3500, 'childDiscountAmount': 7700,
            'residentDiscountAmount': 3850, 'durationDiscountAmount': 8662.5,
            'bathVisits': 3, 'freeBathVisits': 2, 'bathTotal': 900, 'total': 26887.5,
            'lines': [{'date': '2027-06-01', 'housing': 2500, 'food': 250}], 'warnings': [],
            'settings': {'includedActivities': 'Лодки и сапы включены.', 'doNotDump': 'NEVER_DUMP_INTERNAL'}}


class GuestProposalTests(unittest.TestCase):
    def render_text(self, kind, quote, saved=False, root_kind=True):
        data = {'guestName': 'Модельное имя'}
        if root_kind:
            data['kind'] = kind
        if saved:
            data['result'] = {'kind': kind, 'quote': quote,
                              'url': 'https://ostrov.center/calculator#plan=' + 'a'*32,
                              'updatedAt': '2026-10-06T18:00:00Z'}
        else:
            data['quote'] = quote
        try:
            document = PdfReader(io.BytesIO(renderer.make_pdf(data, templates_dir=TEMPLATES)))
        except Exception as error:
            self.fail('Valid guest projection must render: ' + str(error))
        text = ' '.join(('\n'.join(page.extract_text() for page in document.pages)).split())
        return text, document

    def test_guest_table_money_and_empty_sections_without_machine_words(self):
        text, _ = self.render_text('group', copy.deepcopy(GROUP))
        for value in ('Состав расчёта', 'Сумма', '1 250,50 ₽', '-149,50 ₽', 'Проживание Ёжик 😀'):
            self.assertIn(value, text)
        for value in ('API', 'Версия тарифов', 'Предупреждения', '[]', 'NEVER_DUMP_INTERNAL', '1:'):
            self.assertNotIn(value, text)
        self.assertIn('Условия №7', text)

    def test_authoritative_total_is_not_sum_of_rows(self):
        quote = copy.deepcopy(GROUP); quote['total'] = 0
        text, _ = self.render_text('group', quote)
        self.assertIn('Итого: 0,00 ₽', text)

    def test_resident_two_general_discounts_and_child_discount_already_included(self):
        text, _ = self.render_text('resident', copy.deepcopy(RESIDENT))
        for value in ('35 000,00 ₽', '3 500,00 ₽', '-3 850,00 ₽', '-8 662,50 ₽', '900,00 ₽', '26 887,50 ₽'):
            self.assertIn(value, text)
        self.assertIn('7 700,00 ₽ уже учтена', text)
        self.assertNotIn('-7 700,00', text)
        self.assertIn('Лодки и сапы включены.', text)
        self.assertIn('Дом Ёлка', text)
        self.assertIn('Серверный Гость 😀', text)
        for value in ('Модельное имя', 'payingGuests', 'NEVER_DUMP_INTERNAL', '2 500,00 ₽'):
            self.assertNotIn(value, text)

    def test_selected_free_bath_is_not_suppressed_and_quota_is_not_an_order(self):
        quote = copy.deepcopy(RESIDENT); quote.update(bathVisits=1, freeBathVisits=2, bathTotal=0)
        text, _ = self.render_text('resident', quote)
        self.assertIn('без доплаты', text)
        self.assertIn('Выбрано посещений на гостя: 1', text)
        self.assertIn('Доступная бесплатная квота на гостя: 2', text)

    def test_saved_kind_and_saved_date_come_from_result(self):
        text, _ = self.render_text('group', copy.deepcopy(GROUP), saved=True, root_kind=False)
        self.assertIn('06.10.2026', text)
        self.assertIn('18:00 UTC', text)

    def test_incomplete_composition_and_missing_line_amount_refuse(self):
        for quote in (dict(copy.deepcopy(GROUP), compositionComplete=False),
                      dict(copy.deepcopy(GROUP), lines=[{'label': 'Нет суммы'}])):
            with self.assertRaises(ValueError):
                renderer.make_pdf({'kind': 'group', 'quote': quote, 'guestName': 'Тест'}, templates_dir=TEMPLATES)

    def test_single_tall_table_row_splits_without_loss(self):
        quote = copy.deepcopy(GROUP)
        quote['lines'] = [{'label': 'НАЧАЛО ' + 'Очень длинное описание услуги. '*700 + ' КОНЕЦ-СТРОКИ', 'amount': 1250.5}]
        text, document = self.render_text('group', quote)
        self.assertGreater(len(document.pages), 1)
        self.assertEqual(text.count('НАЧАЛО'), 1)
        self.assertEqual(text.count('КОНЕЦ-СТРОКИ'), 1)

    def test_biggroup_bath_days_describe_format_not_a_guest_order(self):
        quote = copy.deepcopy(GROUP); quote['bathDays'] = 3
        text, _ = self.render_text('biggroup', quote)
        self.assertIn('Дней бани по формату: 3', text)
        self.assertNotIn('Выбранные дни бани', text)

    def test_nonempty_warnings_survive_guest_projection(self):
        quote = copy.deepcopy(GROUP); quote['warnings'] = ['Размещение нужно согласовать.']
        text, _ = self.render_text('group', quote)
        self.assertEqual(text.count('Размещение нужно согласовать.'), 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
