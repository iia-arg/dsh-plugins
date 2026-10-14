"""RU: Договор «бой = своему выпуску»; только временные репозитории, подставные боевые корни и подставной приёмник тревог.
EN: Own-version release contract; only temporary repositories, live roots and alert sink.

RU: Проверяет, что сторож сверяет боевой каталог с меткой ТОЧНОЙ версии боя (префикс каталога дерева или имени пакета),
без отката к последней метке: 16 сценариев на копии сторожа (VYPUSK_TEST_WATCH, по умолчанию src/ пакета).
Подставы: временный git-репозиторий с пакетом named-proba в каталоге proba (версии 1.0.0 и 1.1.0, метки ставятся и
снимаются по ходу), «боевая» копия 1.0.0 в подставном корне по имени, подставной канал тревоги, считающий вызовы,
пустой список исключений, файл состояния во временном каталоге; корни агентов, зона сведений, соответствия и ссылки
монтажа отключены. Затем порча самого сторожа: выбор метки заменяется на «последнюю метку любого префикса» — сценарий
new-tag-old-live обязан покраснеть; после этого исходный сторож снова проходит все сценарии.
Чего НЕ проверяет: живые корни и живое дерево, запуск под root, перестановку метки на другой коммит той же версии
с тем же содержимым, доставку тревоги человеку (только число вызовов канала).

EN: Checks that the watcher compares the installed directory with the tag of the EXACT installed version (tree directory
prefix or package name prefix), with no fallback to the latest tag: 16 scenarios on a copy of the watcher
(VYPUSK_TEST_WATCH, the package src/ by default).
Fixtures: a temporary git repository with package named-proba in directory proba (versions 1.0.0 and 1.1.0, tags are
added and removed along the way), an "installed" 1.0.0 copy in a fake by-name root, a fake alert channel counting calls,
an empty exception list, a state file in the temp directory; agent roots, informational zone, correspondences and
install links are disabled. Then the watcher itself is corrupted: tag selection is replaced by "latest tag of either
prefix" — scenario new-tag-old-live must turn red; afterwards the original watcher passes all scenarios again.
NOT checked: live roots and the live tree, running as root, moving a tag to another commit of the same version with the
same content, alert delivery to a human (only the channel call count)."""
from pathlib import Path
import tempfile, subprocess, os, json, shutil, hashlib, sys
watch=Path(os.environ.get('VYPUSK_TEST_WATCH',Path(__file__).resolve().parent.parent/'src/vypusk-okno-watch.sh')).resolve()
# RU: Полный набор сценариев на копии сторожа source в свежем временном каталоге; возвращает список исходов по сценариям.
# EN: Full scenario set on a copy of watcher `source` in a fresh temp directory; returns the list of per-scenario outcomes.
def suite(source):
 with tempfile.TemporaryDirectory(prefix='release-own-version-') as tmp:
  # RU: Раскладка: репозиторий, каталог пакета proba, «боевой» каталог live/named-proba, подставной канал (строка на вызов).
  # EN: Layout: repository, package dir proba, "installed" dir live/named-proba, fake channel (one line per call).
  t=Path(tmp);repo=t/'repo';pkg=repo/'packages/proba';pkg.mkdir(parents=True);live=t/'live/named-proba';live.parent.mkdir();calls=t/'calls';alert=t/'alert';alert.write_text('#!/bin/sh\nprintf "call\\n" >> "$PROBE_CALLS"\n');alert.chmod(0o700)
  copy=t/'watch.sh';shutil.copyfile(source,copy);assert copy.read_bytes()==source.read_bytes()
  checker=source.parent/'copy-compare.sh'
  if checker.is_file():shutil.copyfile(checker,t/'copy-compare.sh');(t/'copy-compare.sh').chmod(0o755)
  def git(*a):return subprocess.check_output(['git','-C',str(repo),'-c','user.name=Probe','-c','user.email=probe@local',*a],stderr=subprocess.PIPE)
  git('init','-q')
  # RU: Коммит версии v: package.json (name named-proba, files), index.js и CHANGELOG с записью этой версии.
  # EN: Commit version v: package.json (name named-proba, files), index.js and a CHANGELOG entry for that version.
  def version(v):
   (pkg/'package.json').write_text(json.dumps({'name':'named-proba','version':v,'files':['index.js','CHANGELOG.md']}));(pkg/'index.js').write_text('version='+repr(v)+';\n');(pkg/'CHANGELOG.md').write_text('## '+v+'\n\n- Changed code.\n');git('add','.');git('commit','-qm',v)
  # RU: Выпуск 1.0.0 с меткой по префиксу каталога и «монтаж» его копии в бой.
  # EN: Release 1.0.0 tagged with the directory prefix, and its copy "installed".
  version('1.0.0');git('tag','proba-v1.0.0');shutil.copytree(pkg,live)
  # RU: Окружение: единственный корень — родитель «боя»; прочие области отключены; канал включён (VYPUSK_TIHO=0).
  # EN: Environment: the only root is the parent of the "installed" dir; other areas disabled; channel enabled (VYPUSK_TIHO=0).
  env=dict({k:v for k,v in os.environ.items() if not k.startswith('VYPUSK_')},VYPUSK_REPO=str(repo),VYPUSK_KORNI=str(live.parent),VYPUSK_AGENT_KORNI='',VYPUSK_INFO_KORNI='',VYPUSK_SOOTVETSTVIYA='',VYPUSK_SSYLKI='',VYPUSK_RASKLADKA='',VYPUSK_REESTR='',VYPUSK_ISKLYUCHENIYA=str(t/'exceptions'),VYPUSK_SOSTOYANIE=str(t/'state'),VYPUSK_ALERT=str(alert),VYPUSK_TIHO='0',PROBE_CALLS=str(calls),PYTHONDONTWRITEBYTECODE='1');(t/'exceptions').write_text('');out=[]
  # RU: Один прогон: сверяет код выхода; если заданы — наличие строки INFO:, прирост вызовов канала, подстроку причины.
  #     Состояние между прогонами НЕ сбрасывается: повторы проверяют, что отметка тревоги не залипает.
  # EN: One run: checks the exit code; when given — presence of an INFO: line, channel call increment, a reason substring.
  #     State is NOT reset between runs: repeats check that an alert mark does not stick.
  def probe(name,want,info=None,alert_count=None,reason=None):
   before=len(calls.read_text().splitlines()) if calls.exists() else 0
   p=subprocess.run(['bash',str(copy)],env=env,capture_output=True,text=True,timeout=30);after=len(calls.read_text().splitlines()) if calls.exists() else 0
   ok=p.returncode==want and (info is None or ('INFO:' in p.stdout)==info) and (alert_count is None or after-before==alert_count) and (reason is None or reason in p.stdout+p.stderr)
   out.append({'case':name,'pass':ok,'rc':p.returncode,'expected_rc':want,'alert_calls':after-before})
   print(('OK ' if ok else 'FAIL ')+name+' '+json.dumps(out[-1]))
   if not ok:print(p.stdout+p.stderr)
  # RU: old-matches: бой = своей метке → 0, тихо. prerelease-not-newer: метка 1.0.0-rc.1 не новее 1.0.0 → без INFO.
  #     new-commit-only: коммит 1.1.0 без метки — не выпуск → без INFO. new-tag-old-live: метка 1.1.0 при бое 1.0.0 →
  #     только INFO, код 0, канал молчит. Ловит сверку с последней меткой вместо своей и тревогу на невыпущенный коммит.
  # EN: old-matches: installed = own tag → 0, silent. prerelease-not-newer: tag 1.0.0-rc.1 is not newer than 1.0.0 → no INFO.
  #     new-commit-only: a 1.1.0 commit without a tag is not a release → no INFO. new-tag-old-live: tag 1.1.0 with 1.0.0
  #     installed → INFO only, exit 0, channel silent. Catches comparing with the latest tag instead of the own one.
  probe('old-matches',0,False,0);git('tag','proba-v1.0.0-rc.1');probe('prerelease-not-newer',0,False,0);git('tag','-d','proba-v1.0.0-rc.1');version('1.1.0');probe('new-commit-only',0,False,0);git('tag','proba-v1.1.0');probe('new-tag-old-live',0,True,0)
  # RU: Своей метки 1.0.0 нет, выпуски известны → «смонтировано невыпущенное», код 1, один вызов канала.
  # EN: No own 1.0.0 tag while releases are known → "installed unreleased", exit 1, one channel call.
  git('tag','-d','proba-v1.0.0');probe('missing-own-tag',1,True,1,'смонтировано невыпущенное: бой=1.0.0, своей метки нет')
  # RU: Две метки версии боя (оба префикса) → неоднозначно, слепота код 2. Ловит молчаливый выбор одной из двух.
  # EN: Two tags for the installed version (both prefixes) → ambiguous, blindness exit 2. Catches silently picking one of them.
  git('tag','proba-v1.0.0','HEAD~1');git('tag','named-proba-v1.0.0','HEAD~1');probe('two-prefix-tags',2,True,None,'меток версии боя')
  # RU: Только метка по префиксу имени пакета → принимается, код 0.
  # EN: Only the package-name-prefix tag → accepted, exit 0.
  git('tag','-d','proba-v1.0.0');probe('name-prefix-only',0)
  # RU: Порча боя: дописана одна строка в index.js; печатает суммы до → после и число вхождений (доказательство внесения).
  # EN: Corrupt the installed copy: one line appended to index.js; prints checksums before → after and occurrence count (proof).
  f=live/'index.js';original=f.read_bytes();before=hashlib.sha256(original).hexdigest();f.write_bytes(original+b'corruption\n');after=hashlib.sha256(f.read_bytes()).hexdigest();assert before!=after;assert f.read_text().count('corruption')==1;print('CORRUPTION live',before,'->',after,'count=1')
  # RU: Порча → код 1; возврат → код 0 дважды подряд (красное гаснет и не возвращается из состояния).
  # EN: Corruption → exit 1; restore → exit 0 twice in a row (red clears and does not come back from state).
  probe('corrupt-live',1);f.write_bytes(original);probe('restored-first',0);probe('restored-second',0)
  # RU: Метка 1.0.0 переставлена на коммит 1.1.0 → версия в архиве метки ≠ версии боя, код 1. Ловит доверие имени метки.
  # EN: Tag 1.0.0 moved onto the 1.1.0 commit → version inside the tag archive ≠ installed version, exit 1. Catches trusting the tag name.
  git('tag','-d','named-proba-v1.0.0');git('tag','named-proba-v1.0.0');probe('archive-version-mismatch',1,reason='версия в архиве метки 1.1.0 не равна версии боя 1.0.0')
  # RU: Метка возвращена на свой коммит → код 0 дважды.
  # EN: Tag returned to its own commit → exit 0 twice.
  git('tag','-d','named-proba-v1.0.0');git('tag','named-proba-v1.0.0','HEAD~1');probe('final-first',0);probe('final-second',0)
  # RU: У пакета нет ни одной метки → слепота код 2, без INFO, один вызов канала.
  # EN: The package has no tags at all → blindness exit 2, no INFO, one channel call.
  git('tag','-d','named-proba-v1.0.0','proba-v1.1.0');probe('no-package-tags',2,False,1,'меток версии боя 1.0.0 найдено 0')
  # RU: Своя метка возвращена → код 0 дважды и без вызовов канала: слепота не залипает в состоянии.
  # EN: Own tag restored → exit 0 twice with no channel calls: blindness does not stick in state.
  git('tag','proba-v1.0.0','HEAD~1');probe('no-tags-restored-first',0,False,0);probe('no-tags-restored-second',0,False,0)
  return out
# RU: Основа: все сценарии на исходном стороже обязаны пройти, иначе порча ниже ничего не докажет.
# EN: Baseline: all scenarios must pass on the original watcher, otherwise the corruption below proves nothing.
rows=suite(watch);failed=[x['case'] for x in rows if not x['pass']];print('BASELINE',json.dumps({'passed':len(rows)-len(failed),'total':len(rows),'failed':failed}))
if failed:sys.exit(1)
# RU: Якорь порчи — строка выбора метки ровно одной версии; должна встречаться ровно один раз.
# EN: Corruption anchor — the exact-version tag selection line; it must occur exactly once.
s=watch.read_text();anchor='  METKA=${METKI[0]}'
if s.count(anchor)!=1:raise RuntimeError('mutation anchor absent or ambiguous')
replacement='  METKA=$(git -C "$REPO" tag -l "$KATALOG-v*" "$IMYA-v*" | sort -V | tail -1)'
# RU: Порченая копия сторожа «последняя метка»; внесение доказано двумя способами (grep -cF = 1 и разные sha256).
#     Сценарий new-tag-old-live на ней обязан провалиться — иначе стенд слеп к откату к последней метке.
# EN: Corrupted "latest tag" watcher copy; the change is proven two ways (grep -cF = 1 and different sha256).
#     Scenario new-tag-old-live must fail on it — otherwise the bench is blind to a fallback to the latest tag.
with tempfile.TemporaryDirectory(prefix='release-last-tag-mutation-') as tmp:
 p=Path(tmp)/'watch.sh';p.write_text(s.replace(anchor,replacement));before=hashlib.sha256(watch.read_bytes()).hexdigest();after=hashlib.sha256(p.read_bytes()).hexdigest();count=subprocess.check_output(['grep','-cF',replacement,str(p)],text=True).strip();assert count=='1' and before!=after;print('MUTATION last-tag replacements=1 grep_cF='+count,before,'->',after)
 red=suite(p);assert not next(x for x in red if x['case']=='new-tag-old-live')['pass'],'mutation not detected'
# RU: Возврат: исходный сторож снова проходит все сценарии.
# EN: Restore: the original watcher passes all scenarios again.
restored=suite(watch);assert all(x['pass'] for x in restored),'restore failed';print(f'PASS own-version {len(rows)-len(failed)}/{len(rows)}; last-tag mutation detected; restored {sum(x["pass"] for x in restored)}/{len(restored)}')
