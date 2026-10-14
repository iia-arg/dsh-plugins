#!/opt/omega/venv/bin/python3
"""Шлюз OMEGA для гостевых агентов sadik (B-N-1476, 03.10.2026, Аврора; решение Забавы по варианту (б), слово владельца 12:44 МСК).

ЗАЧЕМ. В OMEGA (core 1.5.19 + Pro 1.5.13) разделения прав нет: ключ /mcp/ один на всех, `entity_id` — фильтр,
который присылает сам вызывающий (27 из 88 инструментов его принимают; browse/timeline/traverse/similar и правка
по id корень не держат — проба такта 1, Q5–Q8, Q11). Гость не получает боевой ключ вовсе: он говорит со шлюзом
СВОИМ ключом, а шлюз ходит в 8377 боевым ключом (EnvironmentFile /etc/omega/mcp-klyuch.env, 600 root — гость его
не видит) и пропускает только белый список, ставя корень гостя сам.

БЕЛЫЙ СПИСОК (по коду dsh-pamyat-omega и мета-инструментам службы; всё прочее — ОТКАЗ с текстом):
  omega_store            — корень принудительно; items/derived_from/project/project_id — отказ; id записи → список своих.
  omega_call → omega_query  — mode semantic|phrase|unified (по умолчанию semantic), корень принудительно; иные режимы — отказ.
                              filter_tags (B-N-1644: метка «для гостей») — только список строк; в таком поиске шлюз оставляет
                              ТОЛЬКО свои записи (список своих) и срезает хвост «Active Constraints» (r2: прямой ключ службы
                              есть у других агентов, entity_id ставит вызывающий — иначе подброс гостям мимо шлюза).
  omega_call → omega_memory — action=similar и только по СВОЕЙ записи (список своих); из выдачи вычищаются
                              похожие записи не из списка своих (в выдаче id усечён до 8 знаков — сверка по ним).
                            — action=supersede (B-N-1644: снять запись/пометку) — только СВОЯ запись и, если назван,
                              только СВОЙ target_id; корень вызывающего (entity_id) шлюз ставит сам.
                            — action=link (B-N-1644 r3) — только своя со своей. Иные действия — отказ.
  omega_store (B-N-1644 r3, слово владельца 05.10 13:20 МСК) — тип вне вечных OMEGA заменяется на fakt (исходный — в
                              metadata.tip_iskhodnyj), иначе запись сгорает через 90 суток; словесная пометка
                              metadata.dostupnost «можно гостям» переводится в тег dlya-gostej (одна форма для выдачи гостям).
                            — B-N-1847 (08.10): ТОЛЬКО такая запись (поле, значение целиком) получает в списке своих признак
                              «gostyam», и выдача по метке отдаёт только записи с признаком. Метка dlya-gostej в tags без поля
                              (в т.ч. поставленная OMEGA из слов текста, auto_capture) гостю не идёт.
  omega_welcome          — СВОЙ: omega_query semantic по корню гостя (родной welcome отдаёт чужое, Q10).
  omega_protocol / omega_tools — пропуск (текст и схемы, без записей); session_id/project отбрасываются.
Незнакомый аргумент в разрешённом вызове — отказ, а не пропуск (новое поле поставщика не проходит молча).

ПРИ СБОЕ — ОТКАЗ. Нет ключа/чужой ключ → 401 до MCP. Служба 8377 не ответила, ответ не разобран, файл ключей не
прочитан → отказ с причиной, ничего не пропускается «как есть».

КЛЮЧИ. /etc/omega/gost-klyuchi.txt (640 root:omega-shlyuz): строки «<sha256 ключа гостя hex> <корень>», сам ключ
гостя — только в drop-in ЕГО юнита (/etc/omega/gost/<агент>.env, 600 root). Шлюз хранит лишь суммы.

ЧЕГО НЕ ЛОВИТ (названные границы):
  • корректность фильтра корня ВНУТРИ OMEGA в режимах semantic/phrase/unified — это поставщик (1.5.12 «hard constraint»)
    и наша правка поставки B-N-1072 для phrase; ловит стенд stend-shlyuza-omega.py при прогоне, не шлюз;
  • записи гостя лежат в общей базе — системные их видят (решение владельца о пометке — отдельно);
  • dsh-pamyat-obsluzhivanie пишет в корень гостя напрямую в omega.db, мимо шлюза (своя служба, гостем не управляется);
  • записи гостя, сделанные НЕ через шлюз (обслуживание), similar не подтвердит — их нет в списке своих;
  • совпадение 8-значного префикса id своей и чужой записи (2^-32 на пару) — чужая соседняя запись прошла бы в similar.
"""
from __future__ import annotations

import contextlib
import fcntl
import hashlib
import hmac
import logging
import os
import re
import sys
from pathlib import Path

import mcp.types as types
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.server.lowlevel import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings

log = logging.getLogger("omega-shlyuz")
UPSTREAM = os.environ.get("SHLYUZ_UPSTREAM", "http://127.0.0.1:8377/mcp")
UPSTREAM_KEY = os.environ.get("OMEGA_MCP_API_KEY", "").strip()
KLYUCHI = Path(os.environ.get("SHLYUZ_KLYUCHI", "/etc/omega/gost-klyuchi.txt"))
STATE = Path(os.environ.get("SHLYUZ_STATE", "/var/lib/omega-shlyuz"))
HOST = "127.0.0.1"
PORT = int(os.environ.get("SHLYUZ_PORT", "8379"))

META = ("omega_store", "omega_call", "omega_welcome", "omega_protocol", "omega_tools")
STORE_ARGS = {"content", "text", "event_type", "metadata", "priority", "session_id", "agent_type",
              "source_uri", "sensitivity", "status", "entity_id"}
QUERY_ARGS = {"query", "mode", "limit", "event_type", "status", "case_sensitive", "temporal_range", "entity_id", "filter_tags"}
QUERY_MODES = {"semantic", "phrase", "unified"}
SIMILAR_ARGS = {"action", "memory_id", "limit"}
SUPERSEDE_ARGS = {"action", "memory_id", "target_id", "reason"}
LINK_ARGS = {"action", "memory_id", "target_id", "edge_type", "weight"}
LINK_VIDY = {"related", "supersedes", "evolves", "contradicts"}
METKA_GOSTEJ = "dlya-gostej"
SLOVA_GOSTEJ = {"можно гостям", "доступно гостям", "для гостей", METKA_GOSTEJ}
PRIZNAK_GOSTYAM = "gostyam"   # B-N-1847: третье слово строки списка своих — запись помечена гостям полем dostupnost


def vechnye_tipy() -> frozenset[str]:
    """B-N-1644 r3 (слово владельца 05.10 13:20 МСК: записи бессрочные): типы, которым OMEGA не ставит срок, — из самой поставки
    (omega.types.EVENT_TYPE_TTL, вместе с нашей локальной правкой). Незнакомый тип OMEGA хранит 90 суток и удаляет молча."""
    try:
        from omega.types import EVENT_TYPE_TTL
        return frozenset(k for k, v in EVENT_TYPE_TTL.items() if v is None)
    except Exception as e:  # noqa: BLE001
        log.error("вечные типы OMEGA не прочитаны (%s) — запись будет отказывать", type(e).__name__)
        return frozenset()


VECHNYE = vechnye_tipy()
TIP_PO_UMOLCHANIYU = "fakt"
ID_RE = re.compile(r"mem-[0-9a-f]{12}")
KOREN_RE = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")

# Решения по ВСЕМ инструментам поставки (88 на 1.5.19 + Pro 1.5.13). Стенд сверяет этот перечень с живым списком
# поставки: имя, которого здесь нет, — красное (новый инструмент поставщика не должен пройти незамеченным).
IZVESTNYE = frozenset({  # 88 имён, снято 03.10.2026 с установленных schema-модулей (core 1.5.19 + Pro 1.5.13)
    "context_packet", "omega_ask", "omega_audit_export", "omega_audit_inclusion_proof", "omega_audit_verify",
    "omega_audit_verify_inclusion", "omega_checkpoint", "omega_classify_intent", "omega_consult_claude",
    "omega_consult_gpt", "omega_dream", "omega_dream_apply", "omega_dream_diff", "omega_dream_discard",
    "omega_dream_revert", "omega_entity_add_relationship", "omega_entity_create", "omega_entity_delete",
    "omega_entity_get", "omega_entity_list", "omega_entity_relationships", "omega_entity_tree", "omega_entity_update",
    "omega_federation_export", "omega_federation_import", "omega_federation_trust_add", "omega_federation_trust_list",
    "omega_federation_trust_remove", "omega_federation_verify", "omega_get_current_model", "omega_get_model_config",
    "omega_ingest_document", "omega_ingest_file", "omega_list_documents", "omega_maintain", "omega_memory",
    "omega_oracle_abstain", "omega_oracle_aggregate", "omega_oracle_analyze", "omega_oracle_calibrate",
    "omega_oracle_cold_start_prior", "omega_oracle_forecastbench", "omega_oracle_murphy_decompose",
    "omega_oracle_record", "omega_oracle_resolve", "omega_oracle_scenario", "omega_oracle_score_quantile",
    "omega_oracle_status", "omega_oracle_track_record", "omega_profile", "omega_profile_delete", "omega_profile_get",
    "omega_profile_list", "omega_profile_search", "omega_profile_set", "omega_project_create", "omega_project_delete",
    "omega_project_get", "omega_project_list", "omega_project_update", "omega_protocol", "omega_query",
    "omega_reflect", "omega_remind", "omega_remove_document", "omega_resume_task", "omega_review",
    "omega_route_prompt", "omega_router_benchmark", "omega_router_context", "omega_router_status",
    "omega_scan_documents", "omega_search_documents", "omega_set_priority_mode", "omega_stats", "omega_store",
    "omega_store_archive", "omega_store_attach", "omega_store_create", "omega_store_list", "omega_store_sync",
    "omega_switch_model", "omega_sync_kb", "omega_typed_query", "omega_typed_schemas", "omega_typed_store",
    "omega_warm_router", "omega_welcome",
})


class Otkaz(Exception):
    pass


def otkaz(text: str) -> list[types.TextContent]:
    return [types.TextContent(type="text", text="ОТКАЗ шлюза OMEGA для гостей: " + text)]


def chitat_klyuchi() -> dict[str, str]:
    d = {}
    for n, line in enumerate(KLYUCHI.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) != 2 or not re.fullmatch(r"[0-9a-f]{64}", parts[0]) or not KOREN_RE.match(parts[1]):
            raise Otkaz(f"строка {n} файла ключей негодна")
        d[parts[0]] = parts[1]
    return d


def koren_po_zagolovku(auth: str | None) -> str | None:
    """Корень гостя по заголовку Authorization или None. Файл ключей читается на КАЖДЫЙ запрос (смена ключа без перезапуска)."""
    if not auth or not auth.startswith("Bearer "):
        return None
    h = hashlib.sha256(auth[7:].strip().encode()).hexdigest()
    try:
        kl = chitat_klyuchi()
    except Exception as e:  # не прочитан — никого не пускаем
        log.error("файл ключей не прочитан: %s", e)
        return None
    for summa, koren in kl.items():
        if hmac.compare_digest(summa, h):
            return koren
    return None


def svoi_put(koren: str) -> Path:
    return STATE / f"{koren}.ids"


def svoi_s_summoj(koren: str, tolko_gostyam: bool = False) -> dict[str, str | None]:
    """Строки списка своих: «id» (прежние) или «id sha256-превью» (B-N-1644 r2). Сумма — None, если её не записывали.
    B-N-1847: tolko_gostyam — только строки с признаком «id сумма gostyam» (поле dostupnost при записи, см. pole_gostyam)."""
    p = svoi_put(koren)
    if not p.exists():
        return {}
    out: dict[str, str | None] = {}
    for l in p.read_text().splitlines():
        ch = l.split()
        if ch and ID_RE.fullmatch(ch[0]) and (not tolko_gostyam or PRIZNAK_GOSTYAM in ch[2:]):
            out[ch[0]] = ch[1] if len(ch) > 1 and re.fullmatch(r"[0-9a-f]{64}", ch[1]) else out.get(ch[0])
    return out


def pole_gostyam(meta: dict) -> bool:
    """B-N-1847: пометка «для гостей» — ТОЛЬКО явное поле metadata.dostupnost (dostupno/dostup), значение ЦЕЛИКОМ из SLOVA_GOSTEJ.
    Метки (tags) не смотрятся: OMEGA сама кладёт в них слова текста (bridge.py auto_capture), и запись, лишь упоминающая
    «dlya-gostej», получала метку и уходила гостю (mem-2efaa8c76cb9). «внутреннее; для гостей — только по слову …» — не гостям."""
    return bool({str(meta.get(k, "")).strip().lower() for k in ("dostupnost", "dostupno", "dostup")} & SLOVA_GOSTEJ)


def svoi(koren: str) -> set[str]:
    return set(svoi_s_summoj(koren))


def summa_prevyu(content: str) -> str:
    """Сумма превью так, как OMEGA его печатает в omega_query (handlers.py: content[:200] + "..." при длине > 200), без краевых пробелов."""
    p = content[:200] + "..." if len(content) > 200 else content
    return hashlib.sha256(p.strip().encode("utf-8")).hexdigest()


def dobavit_svoj(koren: str, mid: str, summa: str | None = None, gostyam: bool = False) -> None:
    STATE.mkdir(parents=True, exist_ok=True)
    with open(svoi_put(koren), "a", encoding="utf-8") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        # B-N-1847: признак без суммы не пишется — выдача по метке такую запись всё равно не отдаст (сумма обязательна).
        f.write(mid + (" " + summa if summa else "") + (" " + PRIZNAK_GOSTYAM if summa and gostyam else "") + "\n")


async def vverh(tool: str, args: dict) -> tuple[str, bool]:
    if not UPSTREAM_KEY:
        raise Otkaz("боевой ключ службы не задан (OMEGA_MCP_API_KEY) — шлюз не ходит без него")
    try:
        async with streamablehttp_client(UPSTREAM, headers={"Authorization": f"Bearer {UPSTREAM_KEY}"}) as (r, w, _):
            async with ClientSession(r, w) as s:
                await s.initialize()
                res = await s.call_tool(tool, args)
    except Otkaz:
        raise
    except Exception as e:
        raise Otkaz(f"служба OMEGA не ответила ({type(e).__name__})")
    text = "".join(getattr(c, "text", "") for c in res.content)
    return text, bool(res.isError)


def proverit_klyuchi(args: dict, dozvoleno: set[str], chto: str) -> None:
    lishnie = sorted(set(args) - dozvoleno)
    if lishnie:
        raise Otkaz(f"{chto}: аргументы {lishnie} шлюзом не пропускаются")


async def h_store(koren: str, args: dict) -> list[types.TextContent]:
    for k in ("items", "derived_from", "project", "project_id"):
        if k in args:
            raise Otkaz(f"omega_store: «{k}» гостю не разрешён")
    proverit_klyuchi(args, STORE_ARGS, "omega_store")
    a = {k: v for k, v in args.items() if k != "entity_id"}
    meta = a.get("metadata")
    if meta is not None:
        if not isinstance(meta, dict):
            raise Otkaz("omega_store: metadata — не объект")
        meta = {k: v for k, v in meta.items() if k not in ("entity_id", "project", "project_id")}
        meta["entity_id"] = koren
        a["metadata"] = meta
    a["entity_id"] = koren
    # B-N-1644 r3: бессрочность — тип вне вечных (в т.ч. умолчание OMEGA «memory») заменяется на fakt, исходный — в metadata.tip_iskhodnyj.
    tip = a.get("event_type") if isinstance(a.get("event_type"), str) and a.get("event_type").strip() else "memory"
    if TIP_PO_UMOLCHANIYU not in VECHNYE:
        raise Otkaz("omega_store: в поставке OMEGA тип «fakt» не вечный — запись сгорела бы через 90 суток, не пишу")
    meta = dict(a.get("metadata") or {})
    meta["entity_id"] = koren
    if tip not in VECHNYE:
        meta["tip_iskhodnyj"] = tip
        tip = TIP_PO_UMOLCHANIYU
    a["event_type"] = tip
    # B-N-1644 r3: пометка «для гостей» — одна форма, тег dlya-gostej; словесная пометка (dostupnost: «можно гостям») переводится в тег.
    gostyam = pole_gostyam(meta)
    tegi = meta.get("tags") if isinstance(meta.get("tags"), list) else []
    if gostyam and METKA_GOSTEJ not in tegi:
        tegi = [*tegi, METKA_GOSTEJ]
    if tegi:
        meta["tags"] = tegi
    # B-N-1644 r3 (условие ворот 10:45Z): помеченное гостям — тип РОВНО fakt. Типы-«эволюции» OMEGA (решения, уроки, ограничения…)
    # сливают похожие записи и меняют их текст — сумма превью не сойдётся, и сведение молча пропадёт для гостя.
    if METKA_GOSTEJ in tegi and a["event_type"] != TIP_PO_UMOLCHANIYU:
        meta.setdefault("tip_iskhodnyj", a["event_type"])
        a["event_type"] = TIP_PO_UMOLCHANIYU
    a["metadata"] = meta
    text, err = await vverh("omega_store", a)
    if not err:
        # B-N-1644 r3 (З1 ворот 11:05Z): в список своих — ТОЛЬКО новая запись («Stored mem-…»). Склейка OMEGA («Deduped →»,
        # «Reconfirmed», «Evolved») возвращает УЖЕ живущую запись: её сумма — по её тексту, а не по новому (иначе своя помеченная
        # молча скроется от гостя), а чужую запись с тем же текстом склейка не должна делать своей (иначе подброс станет «своим»).
        m = re.match(r"\s*Stored\s+(mem-[0-9a-f]{12})\b", text)
        if m:
            sod = a.get("content") if isinstance(a.get("content"), str) else a.get("text") if isinstance(a.get("text"), str) else None
            dobavit_svoj(koren, m.group(1), summa_prevyu(sod) if sod is not None else None, gostyam)
        else:
            s = ID_RE.search(text)
            if s:
                text = (text.rstrip("\n") + f"\n[шлюз] не записано: такой текст уже живёт в {s.group(0)}. Поменять (тип, метку, срок) — "
                        f"сначала omega_memory supersede {s.group(0)}, потом omega_store.")
    return [types.TextContent(type="text", text=text)]


async def h_query(koren: str, args: dict) -> list[types.TextContent]:
    proverit_klyuchi(args, QUERY_ARGS, "omega_query")
    mode = args.get("mode", "semantic")
    if mode not in QUERY_MODES:
        raise Otkaz(f"omega_query: режим «{mode}» гостю не разрешён (только {sorted(QUERY_MODES)})")
    ft = args.get("filter_tags")
    if ft is not None and not (isinstance(ft, list) and 0 < len(ft) <= 10 and all(isinstance(x, str) and 0 < len(x) <= 64 for x in ft)):
        raise Otkaz("omega_query: filter_tags — только непустой список строк (до 10, каждая до 64 знаков)")
    a = {k: v for k, v in args.items() if k != "entity_id"}
    a["entity_id"] = koren
    text, _ = await vverh("omega_call", {"tool": "omega_query", "args": a})
    if ft is not None:
        # B-N-1644 r2: поиск по метке (выдача гостям) — только СВОИ записи (сделанные через шлюз этим корнем). Прямой ключ службы
        # есть у других агентов, а entity_id в OMEGA ставит вызывающий: без этого любой из них подбросил бы гостям «сведение».
        # B-N-1847: и только помеченные гостям ПОЛЕМ dostupnost при записи (признак в списке своих); метка dlya-gostej в tags
        # сама по себе не довод — её ставит и OMEGA из слов текста.
        text = tolko_svoi(text, svoi_s_summoj(koren, tolko_gostyam=True))
    return [types.TextContent(type="text", text=text)]


def tolko_svoi(text: str, moi: dict[str, str | None]) -> str:
    """B-N-1644 r2: оставить в ответе omega_query блоки «## N. [тип] `mem-<12>`» только СВОИ и только с НЕТРОНУТЫМ текстом
    (сумма превью = записанной шлюзом при записи); хвост «Active Constraints» срезать. Своя запись без суммы (до r2) —
    не отдаётся: подтвердить, что её текст не правили прямым ключом по id, нечем."""
    telo = text.split("\n---\n**Active Constraints")[0]
    chasti = re.split(r"(?m)^(?=## \d+\. )", telo)
    golova, bloki = chasti[0], chasti[1:]
    ostav, chuzhih, tronutyh = [], 0, 0
    for b in bloki:
        m = re.match(r"## \d+\. \[[^\]]*\] `(mem-[0-9a-f]{12})`[^\n]*\n([\s\S]*)$", b)
        if not m or m.group(1) not in moi:
            chuzhih += 1; continue
        telo_b = m.group(2)
        d = re.search(r"\n\*(\d{4}-\d\d-\d\dT\d\d:\d\d)[^\n]*\*\s*$", telo_b)
        prevyu = (telo_b[:d.start()] if d else telo_b).strip()
        if moi[m.group(1)] is None or hashlib.sha256(prevyu.encode("utf-8")).hexdigest() != moi[m.group(1)]:
            tronutyh += 1; continue
        ostav.append(b)
    golova = re.sub(r"^Results: \d+", f"Results: {len(ostav)}", golova)
    if chuzhih or tronutyh:
        golova = golova.rstrip("\n") + f"\n_(шлюз: убрано не своих или не помеченных гостям полем dostupnost — {chuzhih}, своих с текстом, не подтверждённым суммой, — {tronutyh})_\n"
    if tronutyh:
        log.warning("выдача по метке: %d своих записей с текстом, не подтверждённым суммой (правка мимо шлюза или запись до r2)", tronutyh)
    return golova + "".join(ostav)


def vychistit_similar(text: str, moi8: set[str]) -> str:
    """Оставить шапку и Source; блоки «## N. [тип] `mem-xxxxxxxx`» — только свои."""
    chasti = re.split(r"(?m)^(?=## \d+\. )", text)
    golova, bloki = chasti[0], chasti[1:]
    ostav = []
    for b in bloki:
        m = re.match(r"## \d+\. \[[^\]]*\] `(mem-[0-9a-f]{8})", b)
        if m and m.group(1) in moi8:
            ostav.append(b)
    vychishcheno = len(bloki) - len(ostav)
    golova = re.sub(r"^# Similar Memories \(\d+\)", f"# Similar Memories ({len(ostav)})", golova)
    if vychishcheno:
        golova = golova.rstrip("\n") + f"\n\n_(шлюз: убрано чужих похожих записей — {vychishcheno})_\n\n"
    return golova + "".join(ostav)


async def h_supersede(koren: str, args: dict) -> list[types.TextContent]:
    """B-N-1644: снять СВОЮ запись (status superseded) — так гость снимает пометку «для гостей». Чужая — отказ."""
    proverit_klyuchi(args, SUPERSEDE_ARGS, "omega_memory")
    moi = svoi(koren)
    mid = str(args.get("memory_id", "")).strip()
    if not ID_RE.fullmatch(mid) or mid not in moi:
        raise Otkaz(f"omega_memory supersede: запись {mid or '—'} не из корня {koren} (нет в списке записей, сделанных через шлюз)")
    a = {"action": "supersede", "memory_id": mid, "entity_id": koren}
    if args.get("target_id") is not None:
        tid = str(args.get("target_id")).strip()
        if not ID_RE.fullmatch(tid) or tid not in moi:
            raise Otkaz(f"omega_memory supersede: замена {tid or '—'} не из корня {koren}")
        a["target_id"] = tid
    if isinstance(args.get("reason"), str):
        a["reason"] = args["reason"][:500]
    text, _ = await vverh("omega_call", {"tool": "omega_memory", "args": a})
    return [types.TextContent(type="text", text=text)]


async def h_link(koren: str, args: dict) -> list[types.TextContent]:
    """B-N-1644 r3 (слово владельца: «разрешать Варваре связывать знания»): связь только СВОЕЙ записи со СВОЕЙ."""
    proverit_klyuchi(args, LINK_ARGS, "omega_memory")
    moi = svoi(koren)
    mid, tid = str(args.get("memory_id", "")).strip(), str(args.get("target_id", "")).strip()
    for chto, x in (("запись", mid), ("цель", tid)):
        if not ID_RE.fullmatch(x) or x not in moi:
            raise Otkaz(f"omega_memory link: {chto} {x or '—'} не из корня {koren} (нет в списке записей, сделанных через шлюз)")
    a = {"action": "link", "memory_id": mid, "target_id": tid}
    if args.get("edge_type") is not None:
        if args.get("edge_type") not in LINK_VIDY:
            raise Otkaz(f"omega_memory link: вид связи «{args.get('edge_type')}» не из {sorted(LINK_VIDY)}")
        a["edge_type"] = args["edge_type"]
    if isinstance(args.get("weight"), (int, float)) and 0 <= args["weight"] <= 1:
        a["weight"] = args["weight"]
    text, _ = await vverh("omega_call", {"tool": "omega_memory", "args": a})
    return [types.TextContent(type="text", text=text)]


async def h_similar(koren: str, args: dict) -> list[types.TextContent]:
    if args.get("action") == "supersede":
        return await h_supersede(koren, args)
    if args.get("action") == "link":
        return await h_link(koren, args)
    if args.get("action") != "similar":
        raise Otkaz(f"omega_memory: действие «{args.get('action')}» гостю не разрешено (только similar, supersede и link своих записей)")
    proverit_klyuchi(args, SIMILAR_ARGS, "omega_memory")
    mid = str(args.get("memory_id", "")).strip()
    moi = svoi(koren)
    if not ID_RE.fullmatch(mid) or mid not in moi:
        raise Otkaz(f"omega_memory similar: запись {mid or '—'} не из корня {koren} (нет в списке записей, сделанных через шлюз)")
    a = {"action": "similar", "memory_id": mid}
    if "limit" in args:
        a["limit"] = args["limit"]
    text, err = await vverh("omega_call", {"tool": "omega_memory", "args": a})
    if err:
        return [types.TextContent(type="text", text=text)]
    return [types.TextContent(type="text", text=vychistit_similar(text, {x[:12] for x in moi}))]


async def h_welcome(koren: str, args: dict) -> list[types.TextContent]:
    q = args.get("query") if isinstance(args.get("query"), str) and args.get("query").strip() else "последние решения уроки факты состояние"
    text, _ = await vverh("omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 10, "entity_id": koren}})
    return [types.TextContent(type="text", text=f"# OMEGA — приветствие шлюза для гостей (корень {koren})\n"
                              f"Видна только память корня {koren}. Запись — omega_store; поиск — omega_call(omega_query).\n\n" + text)]


async def razobrat(koren: str, name: str, args: dict) -> list[types.TextContent]:
    if name == "omega_store":
        return await h_store(koren, args)
    if name == "omega_welcome":
        return await h_welcome(koren, args)
    if name == "omega_protocol":
        text, _ = await vverh("omega_protocol", {k: v for k, v in args.items() if k == "section"})
        return [types.TextContent(type="text", text=text)]
    if name == "omega_tools":
        text, _ = await vverh("omega_tools", {k: v for k, v in args.items() if k in ("tool", "category")})
        return [types.TextContent(type="text", text=text)]
    if name == "omega_call":
        proverit_klyuchi(args, {"tool", "args"}, "omega_call")
        inner, ia = args.get("tool"), args.get("args") or {}
        if not isinstance(ia, dict):
            raise Otkaz("omega_call: args — не объект")
        if inner == "omega_query":
            return await h_query(koren, ia)
        if inner == "omega_memory":
            return await h_similar(koren, ia)
        raise Otkaz(f"omega_call: инструмент «{inner}» гостю не разрешён")
    raise Otkaz(f"инструмент «{name}» гостю не разрешён")


server = Server("omega-shlyuz-gostej")


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    text_tools = []
    try:
        async with streamablehttp_client(UPSTREAM, headers={"Authorization": f"Bearer {UPSTREAM_KEY}"}) as (r, w, _):
            async with ClientSession(r, w) as s:
                await s.initialize()
                text_tools = [t for t in (await s.list_tools()).tools if t.name in META]
    except Exception as e:
        log.error("список инструментов службы не получен: %s", type(e).__name__)
    return text_tools


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    req = server.request_context.request
    koren = koren_po_zagolovku(req.headers.get("authorization") if req is not None else None)
    if not koren:
        return otkaz("ключ гостя не опознан")
    try:
        return await razobrat(koren, name, arguments or {})
    except Otkaz as e:
        log.warning("отказ: корень %s, %s: %s", koren, name, e)
        return otkaz(str(e))
    except Exception as e:
        log.exception("сбой шлюза")
        return otkaz(f"сбой шлюза ({type(e).__name__}) — ничего не пропущено")


def app():
    from starlette.applications import Starlette
    from starlette.responses import JSONResponse
    from starlette.routing import Mount

    sm = StreamableHTTPSessionManager(app=server, stateless=True, security_settings=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[f"127.0.0.1:{PORT}", f"localhost:{PORT}"],
        allowed_origins=[f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"]))

    async def mcp_asgi(scope, receive, send):
        if scope["type"] == "http":
            auth = dict(scope.get("headers") or []).get(b"authorization", b"").decode("latin-1")
            if not koren_po_zagolovku(auth):
                await JSONResponse({"error": "unauthorized: ключ гостя не опознан"}, status_code=401)(scope, receive, send)
                return
        await sm.handle_request(scope, receive, send)

    @contextlib.asynccontextmanager
    async def lifespan(_):
        async with sm.run():
            yield

    return Starlette(routes=[Mount("/mcp", app=mcp_asgi)], lifespan=lifespan)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if not UPSTREAM_KEY:
        print("ОТКАЗ: OMEGA_MCP_API_KEY не задан — без боевого ключа шлюз не стартует", file=sys.stderr)
        sys.exit(2)
    import uvicorn
    uvicorn.run(app(), host=HOST, port=PORT, log_level="warning")
