#!/usr/bin/env python3
"""Суд ряда длительностей стендов ночного обхода (B-N-2105; Заря, 17.10.2026; замысел 1a31c04f, ворота Вениамина 07:52Z).

  sud-ryada-stendov.py --ryad <ryad.tsv> --otmetka <файл> --prohod <id> [--stendov N] [--dlit-prohoda S --predel-prohoda P] [--sejchas EPOCH]

Ряд пишет обходчик (progress finished, строка на стенд): ночь, проход, путь, учётка, секунды, код, предел, копия_идёт, load1, iowait%.
Стенд судится по ПРОХОДУ --prohod; база — по одному значению на прошлую ночь (последний проход ночи), до 7 ночей, без кода 124.
  СТУПЕНЬКА    сегодня ≥ 1.5 × медианы базы И сегодня − база ≥ 20 с                       (нужно ≥ 3 ночи базы)
  ДО ПРЕДЕЛА   запас < 30 % предела ЭТОЙ ночи ИЛИ прогноз «ночей до предела» < 7 по наклону Тейла–Сена на ≥ 4 точках
  ОБХОД        длительность прохода > 75 % общего предела прохода
  код 124      отдельно не тревожим (убийство по пределу тревожит обходчик) — одна строка «упёрлись» в общем сообщении
  НАГРУЗКА     load1 или iowait ≥ 2 × медианы их по базе — пометка «машина занята, рост может быть не стенда»; сигнал НЕ гасится
Повтор: сообщение уходит при смене СОСТАВА (вид:стенд) или раз в 3 ночи; пустой состав — молчим, отметку сбрасываем.
Вывод: текст сообщения в stdout (пусто — молчать); строки «РЯД: …» (кривая строка, срез) — в stderr, в канал не идут.
Код 0; 2 — слепота (ряд не прочитан) с причиной в stdout.
Ряд старше 60 ночей срезается перезаписью той же рукой (хозяин файла не меняется).
НЕ ЛОВИТ: стенды, не прогнанные вовсе (охват — обходчик); рост в шуме (< 20 с или < 1.5×); причину роста (колонки нагрузки лишь помечают
и не отличают нагрузку от самого стенда); истинную длительность убитых пределом (цензура «≥ предела»); ночь, когда суд не позван.
Пороги — оценка по 12 ночам (4–17.10.2026, kalibrovka.txt B-N-2105), не выведенная величина."""
import argparse, datetime, json, os, statistics as st, sys, tempfile

STUPEN_RAZ, STUPEN_SEK, ZAPAS, NOCHEJ, TOCHEK, BAZA, MIN_BAZA, OBHOD_DOLYA, NAGRUZKA = 1.5, 20, 0.30, 7, 4, 7, 3, 0.75, 2.0
HRANIT_NOCHEJ, POVTOR_SEK = 60, 3 * 86400 - 3600
POLYA = ('noch', 'prohod', 'put', 'kto', 'sek', 'kod', 'predel', 'kopiya', 'load1', 'iowait')


def chislo(x):
    try: return float(x)
    except (TypeError, ValueError): return None


def chitat(put):
    stroki = []
    with open(put, encoding='utf-8', errors='replace') as f:
        for n, l in enumerate(f, 1):
            p = l.rstrip('\n').split('\t')
            if len(p) != len(POLYA): print(f'РЯД: строка {n} не по форме ({len(p)} полей) — пропущена', file=sys.stderr); continue
            r = dict(zip(POLYA, p))
            r['sek'], r['kod'] = int(r['sek']), int(r['kod'])
            r['predel'] = chislo(r['predel']); r['load1'] = chislo(r['load1']); r['iowait'] = chislo(r['iowait'])
            stroki.append(r)
    return stroki


def teil_sen(v):
    n = [(v[j] - v[i]) / (j - i) for i in range(len(v)) for j in range(i + 1, len(v))]
    return st.median(n) if n else 0.0


def srezat(put, stroki):
    nochi = sorted({r['noch'] for r in stroki})
    if len(nochi) <= HRANIT_NOCHEJ: return
    granica = nochi[-HRANIT_NOCHEJ]
    with open(put, encoding='utf-8', errors='replace') as f: lines = f.readlines()
    ostav = [l for l in lines if l.split('\t', 1)[0] >= granica]
    with open(put, 'r+', encoding='utf-8') as f:   # содержимое, а не подмена файла: хозяин и права прежние
        f.seek(0); f.writelines(ostav); f.truncate()


def sud(stroki, prohod, dlit=None, predel_p=None):
    seg = [r for r in stroki if r['prohod'] == prohod]
    if not seg: return [], [], 0
    noch = seg[0]['noch']
    # одно значение на прошлую ночь: последний проход ночи
    po_nocham = {}
    for r in stroki:
        if r['noch'] < noch: po_nocham.setdefault(r['noch'], {}).setdefault(r['prohod'], {})[r['put']] = r
    proshlye = sorted(po_nocham)[-BAZA:]
    baza = {d: po_nocham[d][max(po_nocham[d])] for d in proshlye}
    signaly, upyorlis = [], []
    for r in seg:
        s = r['put']
        if r['kod'] == 124: upyorlis.append(s); continue
        hist = [baza[d][s] for d in proshlye if s in baza[d] and baza[d][s]['kod'] != 124]
        p = r['predel']; n = r['sek']; vidy = []
        if len(hist) >= MIN_BAZA:
            med = st.median(h['sek'] for h in hist)
            if med and n >= STUPEN_RAZ * med and n - med >= STUPEN_SEK: vidy.append(('СТУПЕНЬКА', f'СТУПЕНЬКА {med:.0f}→{n} с ({n/med:.1f}×)'))
        else: med = None
        if p:
            prognoz = None
            tochki = [h['sek'] for h in hist] + [n]
            if len(tochki) >= TOCHEK:
                k = teil_sen(tochki)
                if k > 0: prognoz = (p - n) / k
            if (p - n) / p < ZAPAS or (prognoz is not None and prognoz < NOCHEJ):
                vidy.append(('ДО_ПРЕДЕЛА', f'ДО ПРЕДЕЛА {n}/{p:.0f} с (запас {100*(p-n)/p:.0f} %' + (f', ~{prognoz:.0f} ночей' if prognoz is not None else '') + ')'))
        if not vidy: continue
        nag = f'load1 {r["load1"] if r["load1"] is not None else "?"} · iowait {r["iowait"] if r["iowait"] is not None else "?"} %' + (' · копия идёт' if r['kopiya'] == '1' else '')
        zanyata = ''
        if hist:
            bl = [h['load1'] for h in hist if h['load1'] is not None]; bi = [h['iowait'] for h in hist if h['iowait'] is not None]
            ml = st.median(bl) if bl else None; mi = st.median(bi) if bi else None
            nag += f' (база: load1 {ml if ml is not None else "?"} · iowait {mi if mi is not None else "?"} %)'
            if (r['load1'] is not None and ml and r['load1'] >= NAGRUZKA * ml) or (r['iowait'] is not None and mi and r['iowait'] >= NAGRUZKA * mi):
                zanyata = ' · ⚠️ машина занята — рост может быть не стенда'
        for vid, tekst in vidy: signaly.append((vid, s, f'{tekst} · {s} · учётка {r["kto"]} · {nag}{zanyata}'))
    if dlit is not None and predel_p and dlit > OBHOD_DOLYA * predel_p:
        signaly.append(('ОБХОД', '-', f'ОБХОД ЦЕЛИКОМ {dlit:.0f}/{predel_p:.0f} с ({100*dlit/predel_p:.0f} % общего предела)'))
    return signaly, upyorlis, len(seg)


def main(a):
    ap = argparse.ArgumentParser(add_help=False)
    for k in ('--ryad', '--otmetka', '--prohod'): ap.add_argument(k, required=True)
    for k in ('--stendov', '--dlit-prohoda', '--predel-prohoda', '--sejchas'): ap.add_argument(k, type=float)
    try: o = ap.parse_args(a)
    except SystemExit: print('ОТКАЗ: доводы — см. шапку sud-ryada-stendov.py'); return 2
    sejchas = o.sejchas or datetime.datetime.now(datetime.timezone.utc).timestamp()
    try: stroki = chitat(o.ryad)
    except OSError as e: print(f'СЛЕПОТА РЯДА: {o.ryad} не прочитан ({e.strerror})'); return 2
    signaly, upyorlis, n = sud(stroki, o.prohod, o.dlit_prohoda, o.predel_prohoda)
    try: srezat(o.ryad, stroki)
    except OSError as e: print(f'РЯД: срез старше {HRANIT_NOCHEJ} ночей не сделан ({e.strerror})', file=sys.stderr)
    nepolon = o.stendov is not None and n < o.stendov
    sostav = sorted({f'{v}:{s}' for v, s, _ in signaly} | ({'НЕПОЛОН'} if nepolon else set()))
    try: prezhde, kogda = open(o.otmetka, encoding='utf-8').read().rsplit('|', 1)
    except (OSError, ValueError): prezhde, kogda = '', '0'
    sejchas_sostav = '\n'.join(sostav)
    if not sostav:
        if prezhde: open(o.otmetka, 'w').write('|0')
        return 0
    if sejchas_sostav == prezhde and sejchas - float(kogda or 0) < POVTOR_SEK: return 0
    st_ = [f'ряд стендов sadik (B-N-2105), проход {o.prohod}: сигналов {len(signaly)}' + (' · ПОВТОР (состав прежний)' if sejchas_sostav == prezhde else '')]
    st_ += ['  ' + t for _, _, t in signaly]
    if nepolon: st_.append(f'  РЯД НЕПОЛОН: строк прохода {n} из {o.stendov:.0f} стендов — часть строк не записана (см. «РЯД:» в журнале)')
    if upyorlis: st_.append(f'  упёрлись в предел (код 124, длительность ≥ предела, тревожит обходчик): {len(upyorlis)} — ' + ', '.join(upyorlis))
    st_.append('  читатель — Забава (chitatel-obhoda); действие — наряд хозяину стенда «ускорить или обосновать предел», НЕ подъём PREDEL по умолчанию')
    print('\n'.join(st_))
    open(o.otmetka, 'w').write(sejchas_sostav + '|' + str(int(sejchas)))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
