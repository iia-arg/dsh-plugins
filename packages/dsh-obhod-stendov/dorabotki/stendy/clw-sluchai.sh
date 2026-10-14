#!/bin/bash
# B-N-1232 · стенд codex-limit-watch. Без сети, без боевых путей: источник — JSON-файл (CLW_ISTOCHNIK), дома/подписки/
# переключатель/тревога/состояние — во временном каталоге. Переключатель-подстава при коде 0 переставляет ссылки (как боевой).
# Вызов: stend-clw.sh <файл сторожа> <случай...>   (случаи — в case ниже; каждый печатает прогоны, тревоги, вызовы)
# B-N-1395: подмены сторожа — ТОЛЬКО при CLW_STEND=1 (экспортируется в podgotovka). Случай K — пробы ключа: без ключа модуль
# ЗАГРУЖАЕТСЯ без запуска (runpy, run_name≠__main__) и печатает взятые значения — боевые пути видны, ничего не исполняется.
# Случай ключа — X (буква K занята «выключатель мусор»).
set -uo pipefail
W=$1; shift
podgotovka(){
  T=$(mktemp -d /var/tmp/zclw-XXXXXX) || { echo "СЛЕПОТА: временный каталог не создан — стенд не идёт с пустым T"; exit 2; }
  for n in 3 4; do mkdir -p $T/p$n; echo '{}' > $T/p$n/auth.json; done
  for a in alfa beta gamma marc; do mkdir -p $T/doma/$a; ln -s $T/p3/auth.json $T/doma/$a/auth.json; done
  printf '#!/bin/sh\necho "$*" >> %s/trevogi.txt\nexit ${ALERT_KOD:-0}\n' $T > $T/alert
  printf '#!/bin/sh\necho "вызов $*" >> %s/perekl.txt\n[ "${PK_KOD:-0}" = 0 ] || { echo "ОТКАЗ подставы"; exit $PK_KOD; }\nfor a in alfa beta gamma marc; do ln -sfn %s/p$1/auth.json %s/doma/$a/auth.json; done\necho "переключено на $1"\n' $T $T $T > $T/perekl
  chmod 755 $T/alert $T/perekl
  export CLW_STEND=1 CLW_KATALOG="$T/p{n}" CLW_DOMA="$T/doma/alfa $T/doma/beta $T/doma/gamma $T/doma/marc" CLW_ISTOCHNIK=$T/ist.json \
         CLW_ALERT=$T/alert CLW_PEREKL=$T/perekl CLW_SOSTOYANIE=$T/sost.json CLW_NASTROJKA=$T/nastrojka.json CLW_DOM=$T/dom
  unset ALERT_KOD PK_KOD; T0=1790800000
}
ist(){ # ist <доля3> <доля4> [mozhno3] [mozhno4] — подставные ответы app-server; «X» — ошибка чтения
  python3 -B - "$@" > $T/ist.json <<'PY'
import json,sys
a=sys.argv[1:]+['1','1'][len(sys.argv[1:])-2:]
def otv(u,m,sbros,plan,kred,sbr):
    if u=='X': return 'ОШИБКА подставы: нет ответа'
    return {'ordinaryUsageAllowed': m=='1','rateLimits':{'primary':{'usedPercent':float(u),'windowDurationMins':10080,'resetsAt':sbros},
            'secondary':None,'credits':{'hasCredits':kred!='0','balance':kred},'spendControlReached':False,'planType':plan},
            'rateLimitResetCredits':{'availableCount':sbr}}
print(json.dumps({'3':otv(a[0],a[2],1791290724,'pro','62500',1),'4':otv(a[1],a[3],1791377256,'prolite','0',0)}))
PY
}
progon(){ echo "   · прогон t+$1 с:"; CLW_TEPER=$((T0+$1)) python3 -B $W 2>/dev/null | cut -c1-230 | sed 's/^/     /'; echo "     код ${PIPESTATUS[0]}"; }
itog(){ echo "   итог: тревог $([ -f $T/trevogi.txt ] && wc -l < $T/trevogi.txt || echo 0) · вызовов переключателя $([ -f $T/perekl.txt ] && wc -l < $T/perekl.txt || echo 0) · ссылки → $(readlink $T/doma/alfa/auth.json | sed "s|$T/||")"; rm -rf $T; }
vkl(){ echo '{"avto": true}' > $T/nastrojka.json; }
for C in "$@"; do case $C in
N) echo "=== N: исправное 25/0, авто ВЫКЛ — ничего"; podgotovka; ist 25 0; progon 0; progon 600; itog;;
P) echo "=== P: 3 на 85 % — одно предупреждение на окно"; podgotovka; ist 85 0; progon 0; progon 600; itog;;
F) echo "=== F: 3 на 92 %, 4 на 0, авто ВЫКЛ — тревога «пора», переключатель НЕ зовётся"; podgotovka; ist 92 0; progon 0; progon 600; itog;;
A) echo "=== A: 3 на 92 %, 4 на 0, авто ВКЛ — переключение на 4, дальше тишина"; podgotovka; vkl; ist 92 0; progon 0; progon 600; itog;;
Z) echo "=== Z: 3 сервер «нельзя» (доля 60), 4 на 10, авто ВКЛ — переключение"; podgotovka; vkl; ist 60 10 0 1; progon 0; itog;;
H) echo "=== H: 3 на 100 %, 4 на 75 % (полоса бывшего гистерезиса), авто ВКЛ — ПЕРЕКЛЮЧАЕТ"; podgotovka; vkl; ist 100 75; progon 0; itog;;
B) echo "=== B: 3 на 89 %, 4 на 88,5 % (шум у порога) — остаёмся, без тревоги «обе»"; podgotovka; vkl; ist 89 88.5; progon 0; itog;;
O) echo "=== O: ОБЕ выбраны (95/94 — цель не ниже на 2 п.п.), авто ВКЛ — не переключает, тревога один раз"; podgotovka; vkl; ist 95 94; progon 0; progon 600; progon 1200; itog;;
R) echo "=== R: 3 на 100 %, 4 на 95 % — переключает (относительно, как podpiski; 5 % недели не теряются)"; podgotovka; vkl; ist 100 95; progon 0; itog;;
E) echo "=== E: 3 на 90 %, 4 на 89 % — остаёмся, «обе» НЕ сказано (4 не выбрана)"; podgotovka; vkl; ist 90 89; progon 0; itog;;
W) echo "=== W: у 3 появилось второе окно на 95 % (primary 30) — решает наибольшее: переключает"; podgotovka; vkl; ist 30 0
   python3 -B -c "import json,sys;p=sys.argv[1];d=json.load(open(p));d['3']['rateLimits']['secondary']={'usedPercent':95.0,'windowDurationMins':300,'resetsAt':1790810000};json.dump(d,open(p,'w'))" $T/ist.json; progon 0; itog;;
Q) echo "=== Q: выдержка и предел — переключатель отказывает (код 1), авто ВКЛ"; podgotovka; vkl; export PK_KOD=1; ist 92 0
   progon 0; progon 600; progon 3700; progon 7400; progon 11100; progon 14800; itog;;
S) echo "=== S: слепота — 4 не читается: 1,2 — молчит; 3 — тревога; снова читается — отметка снята"; podgotovka; ist 25 X
   progon 0; progon 600; progon 1200; progon 1800; ist 25 0; progon 2400; itog;;
U) echo "=== U: 3 на 92, 4 НЕ ЧИТАЕТСЯ, авто ВКЛ — не переключает («не измерено» ≠ «годна»)"; podgotovka; vkl; ist 92 X; progon 0; itog;;
D) echo "=== D: делёж — gamma на 4; 3 на 92 — авто не действует"; podgotovka; vkl; ln -sfn $T/p4/auth.json $T/doma/gamma/auth.json; ist 92 0; progon 0; itog;;
K) echo "=== K: выключатель мусор {\"avto\": \"true\"} — ВЫКЛ"; podgotovka; echo '{"avto": "true"}' > $T/nastrojka.json; ist 92 0; progon 0; itog;;
L) echo "=== L: тревога не доставлена — код 3, отметка не пишется, повтор; канал ожил — доставлено, дальше тишина"; podgotovka; ist 92 0
   export ALERT_KOD=1; progon 0; progon 600; unset ALERT_KOD; progon 1200; progon 1800; itog;;
Y) echo "=== Y: ЖИВОЕ ЧТЕНИЕ через подставной app-server (CLW_BIN), предел 3 с: norm · paket · obryv · net_polya · molchit"; podgotovka; unset CLW_ISTOCHNIK
   export CLW_BIN=$(dirname $(readlink -f $0))/fake-codex.py CLW_PREDEL_CHT=3
   for r in norm paket obryv net_polya molchit; do t0=$SECONDS; echo "   · $r: $(FAKE_REZHIM=$r CLW_TEPER=$T0 python3 -B $W 2>/dev/null | grep -a -o '^3.*· активная' | cut -c1-200) [$((SECONDS-t0)) с]"; done
   unset CLW_BIN CLW_PREDEL_CHT; itog;;
V) echo "=== V: ввод — довод --dry-run"; podgotovka; ist 25 0; python3 -B $W --dry-run 2>/dev/null | cut -c1-120 | sed 's/^/     /'; echo "     код ${PIPESTATUS[0]}"; itog;;
X) echo "=== X: ключ CLW_STEND"; podgotovka; ist 25 0
   zn(){ python3 -B -c "import runpy,sys; g=runpy.run_path(sys.argv[1], run_name='stend'); print(' · '.join(str(g[k]) for k in sys.argv[2:]))" "$@" 2>&1 | sed "s|$T|<T>|g" | cut -c1-260 | sed 's/^/     /'; }
   echo "   — с ключом (прогон):"; progon 0
   echo "   — без ключа (загрузка без запуска): PEREKL · SOST · DOMA"; CLW_STEND= zn $W PEREKL SOST DOMA
   echo "   — ключ 2 (прогон):"; CLW_STEND=2 python3 -B $W 2>&1 | sed "s|$T|<T>|g" | cut -c1-200 | sed 's/^/     /'; echo "     код ${PIPESTATUS[0]}"; itog;;
esac; done
