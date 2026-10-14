"""PDF from the direct API quote. No database, network, price or date calculation."""
import html
import io
import json
import math
import argparse
from pathlib import Path
from urllib.parse import urlsplit
import sys
from datetime import date, datetime, timezone
from decimal import Decimal

from pypdf import PdfReader, PdfWriter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, LongTable, TableStyle


class UnicodeFont(TTFont):
    """ReportLab 4.1 emits scalar hex for non-BMP; PDF requires UTF-16BE."""
    def addObjects(self, doc):
        state = self.state.get(doc)
        subsets = [(self.getSubsetInternalName(i, doc)[1:], tuple(chars))
                   for i, chars in enumerate(state.subsets)] if state else []
        super().addObjects(doc)
        for internal, chars in subsets:
            if not any(value > 0xFFFF for value in chars):
                continue
            font = doc.idToObject['BasicFonts'].dict[internal]
            stream = doc.idToObject[font.ToUnicode.name]
            for index, value in enumerate(chars):
                if value > 0xFFFF:
                    old = f'<{index:02X}> <{value:04X}>'
                    new = f'<{index:02X}> <{chr(value).encode("utf-16-be").hex().upper()}>'
                    if stream.content.count(old) != 1:
                        raise ValueError('unexpected ReportLab Unicode map')
                    stream.content = stream.content.replace(old, new)



def text(value):
    if isinstance(value, str):
        if any(0xD800 <= ord(c) <= 0xDFFF or ord(c) < 32 and c != '\n' for c in value):
            raise ValueError('text')
        return value
    if value is True:
        return 'да'
    if value is False:
        return 'нет'
    if value is None:
        return 'не указано сервером'
    return str(value)


def money(value):
    if type(value) not in (int, float) or not math.isfinite(value):
        raise ValueError('money')
    amount = Decimal(str(value))
    if amount == 0:
        amount = Decimal(0)
    return format(amount, ',.2f').replace(',', ' ').replace('.', ',') + ' ₽'


LETTERHEADS = {
    'general_portrait': ('general_portrait.pdf', 136, 80),
    'general_landscape': ('general_landscape.pdf', 110, 96),
    'legal': ('legal.pdf', 152, 96),
}


class TemplateError(ValueError):
    """Operator-supplied template problems may be explained without guest data."""


def load_letterhead(choice, directory):
    if not isinstance(choice, str) or choice not in LETTERHEADS:
        raise TemplateError('неизвестный бланк: доступны общий вертикальный, общий горизонтальный и юридический')
    if directory is None or not Path(directory).is_absolute():
        raise TemplateError('каталог фирменных бланков не настроен')
    filename, top, bottom = LETTERHEADS[choice]
    try:
        with (Path(directory) / filename).open('rb') as source:
            data = source.read(10_000_001)
        if len(data) > 10_000_000:
            raise ValueError('template too large')
        reader = PdfReader(io.BytesIO(data), strict=True)
        if reader.is_encrypted or len(reader.pages) != 1:
            raise ValueError('template must have one unencrypted page')
        page = reader.pages[0]
        width, height = float(page.mediabox.width), float(page.mediabox.height)
        if (page.rotation != 0 or list(page.mediabox)[:2] != [0, 0]
                or list(page.cropbox) != list(page.mediabox)
                or width < 400 or height < 400
                or (width > height) != (choice == 'general_landscape')):
            raise ValueError('unsupported template geometry')
    except Exception as error:
        raise TemplateError('бланк ' + choice + ' недоступен или повреждён') from error
    return reader, (width, height), top, bottom


def make_pdf(data, templates_dir=None):
    if (type(data) is not dict or not {'guestName'} <= set(data)
            or set(data) - {'kind', 'quote', 'result', 'guestName', 'letterhead'}
            or ('quote' in data) == ('result' in data)):
        raise ValueError('input: pass quote or saved result')
    kind, name = data.get('kind'), data['guestName']
    url = None
    updated_at = None
    if 'result' in data:
        result = data['result']
        if type(result) is not dict:
            raise ValueError('saved result')
        if result.get('kind') not in ('group', 'biggroup', 'resident'):
            raise ValueError('saved kind is required')
        if 'kind' in data and kind != result['kind']:
            raise ValueError('saved kind')
        kind = result['kind']
        quote, url = result.get('quote'), result.get('url')
        updated_at = result.get('updatedAt')
        if not isinstance(updated_at, str) or not updated_at:
            raise ValueError('saved date is required')
        if not isinstance(url, str) or not url or len(url) > 2048 or any(c.isspace() or ord(c) < 32 for c in url):
            raise ValueError('saved url')
        parsed = urlsplit(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('saved url')
        parsed.port  # Reject malformed ports without fetching the link.
    else:
        quote = data['quote']
    if kind not in ('group', 'biggroup', 'resident') or type(quote) is not dict:
        raise ValueError('kind')
    if not isinstance(name, str) or not name.strip() or len(name) > 128:
        raise ValueError('name')
    amount = quote.get('total')
    if type(amount) not in (int, float) or not math.isfinite(amount) or amount < 0:
        raise ValueError('total')
    if type(quote.get('version')) is not int or quote['version'] < 1:
        raise ValueError('version')
    start, end = ('arrival', 'departure') if kind == 'resident' else ('week', 'end')
    if any(not isinstance(quote.get(k), str) or not quote[k] for k in (start, end)):
        raise ValueError('dates')
    dates = [date.fromisoformat(quote[k]) for k in (start, end)]
    if any(d.isoformat() != quote[k] for d, k in zip(dates, (start, end))) or dates[0] >= dates[1]:
        raise ValueError('dates')
    counts = ['adults'] if kind == 'resident' else ['adults', 'teens', 'mainMasters', 'extraTeam']
    if any(type(quote.get(k)) is not int or quote[k] < (1 if k == 'adults' else 0) for k in counts):
        raise ValueError('composition')
    if type(quote.get('lines')) is not list or not quote['lines'] or any(type(x) is not dict for x in quote['lines']):
        raise ValueError('lines')
    if type(quote.get('warnings')) is not list or any(type(x) is not str for x in quote['warnings']):
        raise ValueError('warnings')
    if kind == 'resident' and (type(quote.get('rooms')) is not list or not quote['rooms']
            or type(quote.get('children')) is not list or not isinstance(quote.get('resourceName'), str)):
        raise ValueError('housing')
    if quote.get('compositionComplete') is False:
        raise ValueError('composition incomplete')
    if 'kind' in quote and quote['kind'] != kind:
        raise ValueError('kind mismatch')
    template, pagesize, top, bottom = load_letterhead(data.get('letterhead', 'general_portrait'), templates_dir)
    pdfmetrics.registerFont(UnicodeFont('Ostrov', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
    supported = pdfmetrics.getFont('Ostrov').face.charWidths
    styles = getSampleStyleSheet()
    for style in styles.byName.values():
        style.fontName = 'Ostrov'
    styles['Normal'].fontSize = 9
    styles['Normal'].leading = 13
    styles.add(ParagraphStyle('Money', parent=styles['Normal'], alignment=2))
    story = []

    def line(value, style='Normal', keep_next=False, href=None):
        value = text(value)
        if any(ord(char) not in supported for char in value if char != '\n'):
            raise ValueError('font does not support text')
        markup = html.escape(value).replace('\n', '<br/>')
        if href:
            markup = '<a href="' + html.escape(href, quote=True) + '" color="#137C7B"><u>' + markup + '</u></a>'
        paragraph = Paragraph(markup, styles[style])
        paragraph.keepWithNext = keep_next or getattr(styles[style], 'keepWithNext', False)
        space = Spacer(1, 1)
        space.keepWithNext = paragraph.keepWithNext
        story.extend((paragraph, space))

    source_name = quote.get('name' if kind == 'resident' else 'organizer')
    if source_name is not None and not isinstance(source_name, str):
        raise ValueError('name')
    display_name = source_name if source_name and source_name.strip() else name
    line('Остров — предварительное предложение', 'Heading2')
    line('Гость: ' + text(display_name))
    if isinstance(quote.get('title'), str) and quote['title'].strip():
        line(quote['title'], 'Heading3')
    line('Период: ' + dates[0].strftime('%d.%m.%Y') + ' — ' + dates[1].strftime('%d.%m.%Y'))
    if updated_at is not None:
        if not isinstance(updated_at, str):
            raise ValueError('saved date')
        saved_date = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
        if saved_date.tzinfo is None:
            raise ValueError('saved timezone')
        line('Дата сохранения: ' + saved_date.astimezone(timezone.utc).strftime('%d.%m.%Y, %H:%M UTC'))
    if url:
        line('Сохранённый расчёт', 'Heading3')
        line(url, href=url)

    def counts_line(record, group=False):
        parts = []
        for key, label in [('adults', 'Взрослые'), ('teens', 'Подростки'),
                           ('mainMasters', 'Основные мастера'), ('extraTeam', 'Дополнительная команда')]:
            if record.get(key):
                if type(record[key]) is not int or record[key] < 0:
                    raise ValueError('composition')
                parts.append(label + ': ' + str(record[key]))
        if isinstance(record.get('children'), list) and record['children']:
            parts.append('Возраст детей: ' + ', '.join(text(age) for age in record['children']))
        total_key = 'attendees' if group else 'guests'
        if total_key in record:
            if type(record[total_key]) is not int or record[total_key] < 0:
                raise ValueError('composition')
            parts.append('Всего людей: ' + str(record[total_key]))
        return ' · '.join(parts)

    composition = counts_line(quote, group=kind != 'resident')
    if composition:
        line(composition)
    if kind == 'resident':
        if quote.get('nights'):
            line('Ночей: ' + text(quote['nights']))
        line('Размещение', 'Heading3')
        for room in quote['rooms']:
            if type(room) is not dict:
                raise ValueError('housing')
            room_name = room.get('resourceName') or quote['resourceName']
            detail = counts_line(room)
            if 'occupancy' in room:
                detail = 'Гостей в объекте: ' + text(room['occupancy']) + (' · ' + detail if detail else '')
            line('• ' + text(room_name) + (' · ' + detail if detail else ''))

    rows = []
    if kind != 'resident':
        for item in quote['lines']:
            if not isinstance(item.get('label'), str) or not item['label'].strip():
                raise ValueError('line label')
            rows.append((item['label'], money(item.get('amount'))))
    else:
        rows.extend([('Проживание за весь период', money(quote.get('housingTotal'))),
                     ('Питание за весь период', money(quote.get('foodTotal')))])
        for key, label in [('residentDiscountAmount', 'Скидка резидента'),
                           ('durationDiscountAmount', 'Скидка за длительность')]:
            value = quote.get(key, 0)
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                raise ValueError('discount')
            if value:
                rows.append((label, money(-value)))
        visits = quote.get('bathVisits', 0)
        if type(visits) is not int or visits < 0:
            raise ValueError('bath visits')
        if visits:
            bath = quote.get('bathTotal')
            label = 'Общая баня за весь период' if bath != 0 else 'Общая баня — без доплаты'
            rows.append((label, money(bath)))

    def cell(value, money_column=False):
        value = text(value)
        if any(ord(char) not in supported for char in value if char != '\n'):
            raise ValueError('font does not support text')
        return Paragraph(html.escape(value).replace('\n', '<br/>'), styles['Money' if money_column else 'Normal'])

    table = LongTable([[cell('Состав расчёта'), cell('Сумма', True)]] +
                      [[cell(label), cell(amount, True)] for label, amount in rows],
                      colWidths=[pagesize[0] - 88 - 120, 120], repeatRows=1,
                      splitByRow=1, splitInRow=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E8F4F1')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#D2DDDA')),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.HexColor('#94B6AE')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.extend((Spacer(1, 8), table, Spacer(1, 6)))
    line('Итого: ' + money(amount), 'Heading2')
    line('Предварительный расчёт. Сохранение не означает заявку или подтверждение брони.')

    if kind == 'resident':
        child_discount = quote.get('childDiscountAmount', 0)
        if child_discount:
            line('Детская скидка ' + money(child_discount) + ' уже учтена в проживании и питании.')
        if quote.get('bathVisits'):
            line('Выбрано посещений на гостя: ' + text(quote['bathVisits']))
        if quote.get('freeBathVisits'):
            line('Доступная бесплатная квота на гостя: ' + text(quote['freeBathVisits']))
        included = quote.get('settings', {}).get('includedActivities')
        if included:
            line('Включено в пребывание', 'Heading3')
            line(included)
    elif kind == 'biggroup' and quote.get('bathDays'):
        value = quote['bathDays']
        line('Дней бани по формату: ' + text(value))
    warnings = [warning for warning in quote['warnings'] if warning.strip()]
    if warnings:
        line('Условия и важные примечания', 'Heading3')
        for warning in warnings:
            line('• ' + warning)

    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=pagesize, title='Остров — расчёт', author='Остров',
                            leftMargin=44, rightMargin=44, topMargin=top, bottomMargin=bottom)

    def page_number(canvas, document):
        canvas.saveState()
        canvas.setFont('Ostrov', 7)
        canvas.drawString(44, bottom - 14, 'Условия №' + str(quote['version']))
        canvas.setFont('Ostrov', 8)
        canvas.drawRightString(pagesize[0] - 44, bottom - 14, 'Лист ' + str(document.page))
        canvas.restoreState()

    doc.build(story, onFirstPage=page_number, onLaterPages=page_number)
    overlay = PdfReader(io.BytesIO(output.getvalue()))
    writer = PdfWriter()
    for content in overlay.pages:
        # Otherwise pypdf reuses the mutable /Contents object across pages.
        writer.reset_translation(template)
        page = writer.add_page(template.pages[0])
        page.merge_page(content)
    writer.add_metadata({'/Title': 'Остров — расчёт', '/Author': 'Остров'})
    branded = io.BytesIO()
    writer.write(branded)
    return branded.getvalue()


if __name__ == '__main__':
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument('--templates-dir')
        options = parser.parse_args()
        raw = sys.stdin.buffer.read(262145)
        if len(raw) > 262144:
            raise ValueError('size')
        data = json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('number')))
        sys.stdout.buffer.write(make_pdf(data, templates_dir=options.templates_dir))
    except TemplateError as error:
        sys.stderr.write('ОТКАЗ PDF: ' + str(error) + '\n')
        sys.exit(1)
    except Exception:
        sys.stderr.write('ОТКАЗ PDF: данные или генератор недоступны\n')
        sys.exit(1)
