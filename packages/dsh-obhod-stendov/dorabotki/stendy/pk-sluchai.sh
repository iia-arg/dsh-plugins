#!/bin/bash
# codex-podpiska-4 · стенд pereklyuchatel-codex. Под sudo; подписки и дома — во временном каталоге (фиктивные токены);
# юниты настоящие, но только для `systemctl show` (учётка/группы при проверке чтения). Боевые ссылки НЕ трогаются.
# Вызов: stend-pk.sh <файл переключателя> <случай...>
#   G исправное: 3→4, повтор «уже на 4», 4→3     V ввод: пусто, --dry-run, 5          R цель с НЕПУСТЫМ refresh
#   A цель — чужого аккаунта (производный 4 ≠ полный 4)   F дом gamma — ФАЙЛ, а не ссылка
#   U цель не читается учёткой юнита (сверка после смены → откат всех)
#   K ключ PK_STEND (B-N-1395): с ключом — «ПОДМЕНЕНО» первой строкой; без ключа — «ИГНОРИРУЮ» и БОЕВЫЕ дома (только
#     чтение: довода нет ⇒ отказ до записей); ключ 2 — ОТКАЗ код 2 без записей. Боевые ссылки сверяются до/после.
#     B-N-1621: ключ есть, а PK_SVESTI не подменён → ОТКАЗ код 2 (стенд не трогает боевые права токенов).
#   Д B-N-1621: подписки «после перехода» (0600 root, доступ только ACL): цель без ACL → выдан → переключено →
#     прежняя отозвана; и обратно. Помощник — НАСТОЯЩИЙ (STEND_SVESTI, по умолчанию бой) в режиме SDP_STEND
#     на подставных env/подписках; юниты — настоящие systemctl show (учётки coders/marc).
#   U (B-N-1621) — порча ПОМОЩНИКА: «выдал» (код 0), а ACL не поставил → сверка ядром после смены → откат всех.
set -uo pipefail
PK=$1; shift
SV="${STEND_SVESTI:-/usr/local/sbin/svesti-dostup-podpisok}"
[ -r "$SV" ] || { echo "СЛЕПОТА: нет помощника $SV (STEND_SVESTI)"; exit 2; }
fikt(){ python3 -B - "$@" <<'PY'
import json,base64,time,sys
b=lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
jwt=lambda c: b({'alg':'none','typ':'JWT'})+'.'+b(c)+'.fiktiv'
p,a,rt=sys.argv[1],sys.argv[2],sys.argv[3]; exp=int(time.time())+200*3600
cl={'https://api.openai.com/auth':{'chatgpt_account_id':a}}
json.dump({'tokens':{'id_token':jwt({**cl,'exp':exp}),'access_token':jwt({**cl,'exp':exp}),'refresh_token':rt,'account_id':a}},open(p,'w'))
PY
}
podgotovka(){
  T=$(mktemp -d /var/tmp/zpk-XXXXXX) || { echo "СЛЕПОТА: временный каталог не создан — стенд не идёт с пустым T"; exit 2; }; chmod 755 $T
  for n in 3 4; do mkdir -p $T/p$n/polnyj; fikt $T/p$n/polnyj/auth.json akk-$n rt-$n; fikt $T/p$n/auth.json akk-$n ''; chmod 644 $T/p$n/auth.json; done
  for a in alfa beta gamma marc; do mkdir -p $T/doma/$a; ln -s $T/p3/auth.json $T/doma/$a/auth.json; done; chmod -R o+rX $T/doma
  printf '#!/bin/sh\necho "$*" >> %s/trevogi.txt\n' $T > $T/alert; chmod 755 $T/alert
  # B-N-1621: подставные instance-*.env для помощника (юниты настоящие → учётки coders/marc) и его обёртка
  mkdir -p $T/etc; for a in alfa beta gamma marc; do printf 'GATEWAY_POSTAVSHIK=openai\nCODEX_HOME=%s\n' $T/doma/$a > $T/etc/instance-$a.env; done
  printf '#!/bin/sh\nSDP_STEND=1 SDP_ENV_DIR=%s/etc SDP_KATALOG_TOKENOV=%s/etc SDP_KATALOG_CODEX=%s/p{n} SDP_ZAMOK=%s/sdp.lock exec python3 -B %s "$@"\n' $T $T $T $T "$SV" > $T/svesti; chmod 755 $T/svesti
  export PK_SVESTI=$T/svesti
  export PK_STEND=1 PK_KATALOG="$T/p{n}" PK_ALERT=$T/alert PK_ZAMOK=$T/lock \
    PK_DOMA="$T/doma/alfa:coder-gateway@alfa.service $T/doma/beta:coder-gateway@beta.service $T/doma/gamma:coder-gateway@gamma.service $T/doma/marc:coder-gateway-marc.service"
}
kuda(){ echo "   ссылки: $(for a in alfa beta gamma marc; do l=$T/doma/$a/auth.json; [ -L $l ] && printf '%s→%s ' $a "$(readlink $l | sed "s|$T/||")" || printf '%s→ФАЙЛ ' $a; done)· тревог: $([ -f $T/trevogi.txt ] && wc -l < $T/trevogi.txt || echo 0)"; }
pk(){ python3 -B $PK "$@" 2>&1 | sed "s|$T|<T>|g" | cut -c1-330 | sed 's/^/   /'; echo "   код ${PIPESTATUS[0]}"; }
for C in "$@"; do case $C in
G) echo "=== G: исправное"; podgotovka; pk 4; kuda; echo "   — повтор 4:"; pk 4; kuda; echo "   — обратно 3:"; pk 3; kuda; rm -rf $T;;
V) echo "=== V: ввод вне перечня"; podgotovka; for v in "" --dry-run 5; do echo "   довод «$v»:"; pk $v; done; kuda; rm -rf $T;;
R) echo "=== R: порча — у цели НЕПУСТОЙ refresh"; podgotovka; fikt $T/p4/auth.json akk-4 rt-utek; chmod 644 $T/p4/auth.json
   echo "   внесено: refresh производного 4 = $(python3 -B -c 'import json,sys;print(bool(json.load(open(sys.argv[1]))["tokens"]["refresh_token"]))' $T/p4/auth.json)"; pk 4; kuda; rm -rf $T;;
A) echo "=== A: порча — производный 4 несёт аккаунт 3"; podgotovka; fikt $T/p4/auth.json akk-3 ''; chmod 644 $T/p4/auth.json
   echo "   внесено: акк производного 4 = $(python3 -B -c 'import json,sys;print(json.load(open(sys.argv[1]))["tokens"]["account_id"])' $T/p4/auth.json)"; pk 4; kuda; rm -rf $T;;
F) echo "=== F: порча — дом gamma: ФАЙЛ вместо ссылки"; podgotovka; rm $T/doma/gamma/auth.json; cp $T/p3/auth.json $T/doma/gamma/auth.json
   echo "   внесено: gamma/auth.json $( [ -L $T/doma/gamma/auth.json ] && echo ссылка || echo файл)"; pk 4; kuda; rm -rf $T;;
U) echo "=== U: порча помощника — «выдал» (код 0), а ACL не поставил; цель 0600 root"; podgotovka; chmod 600 $T/p4/auth.json
   printf '#!/bin/sh\necho лжец\nexit 0\n' > $T/svesti-lzhec; chmod 755 $T/svesti-lzhec
   echo "   внесено: $(stat -c '%U %a' $T/p4/auth.json), помощник подменён лжецом"; PK_SVESTI=$T/svesti-lzhec pk 4; kuda; rm -rf $T;;
Д) echo "=== Д: доступ ACL — цель без ACL → выдан → переключено → прежняя отозвана (B-N-1621)"; podgotovka
   for n in 3 4; do chmod 700 $T/p$n; chmod 600 $T/p$n/auth.json; done; $T/svesti --svesti >/dev/null 2>&1
   kto(){ for n in 3 4; do printf 'p%s читают: %s; ' $n "$(for u in coders marc; do runuser -u $u -- test -r $T/p$n/auth.json && printf '%s ' $u; done)"; done; }
   echo "   до: $(kto)"; pk 4; kuda; echo "   после 4: $(kto)"; echo "   — обратно 3:"; pk 3; kuda; echo "   после 3: $(kto)"; rm -rf $T;;
K) echo "=== K: ключ PK_STEND"; podgotovka
   boj(){ for a in alfa beta gamma marc; do readlink /var/lib/coder-gateway-$a/codex-home/auth.json; done | sha256sum | cut -c1-8; }
   b0=$(boj); echo "   — с ключом, довода нет:"; pk; echo "   — без ключа (PK_* заданы), довода нет:"; PK_STEND= pk
   echo "   — ключ 2, довод 4:"; PK_STEND=2 pk 4; kuda
   echo "   — ключ 1, PK_SVESTI не задан, довод 4:"; PK_SVESTI= pk 4; kuda; echo "   боевые ссылки до/после: $b0 / $(boj)"; rm -rf $T;;
esac; done
