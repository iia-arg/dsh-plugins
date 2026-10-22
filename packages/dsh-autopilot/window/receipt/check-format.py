#!/usr/bin/python3
"""Refuse a stale window formatter if the new release changed Beta's literal UI form."""
from pathlib import Path
import sys
NEEDLE="const missing=Array.isArray(value.missing)?value.missing.map(m=>(en?'incomplete for participant ':'неполно у ')+esc(m.participant)+': '+esc(m.reason)+(m.relatedRunId?' · RUN '+esc(m.relatedRunId):'')).join('; '):unknown;"
try:
 if len(sys.argv)!=2:raise ValueError()
 text=(Path(sys.argv[1])/'skill/phases/dashboard-template.html').read_text()
 if NEEDLE not in text or 'this renderer does not understand it' not in text or '[2,3,4].includes(value.schemaVersion)' not in text:raise ValueError()
 print('ФОРМА 0.1.14 / schema4: неполно у X: REASON — дословно по renderTeamUsage')
except (OSError,ValueError):print('СТОП: форма мягкого учёта нового L отличается от согласуемого контракта; пересверить с Бетой');sys.exit(2)
