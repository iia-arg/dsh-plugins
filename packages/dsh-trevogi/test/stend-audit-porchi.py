#!/usr/bin/env python3
# Source mutations on private package copies, actual real-code tests, insertion+SHA+recovery.
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PLANS = [
 ('html-order', 'bin/agent-alert', 'for tag in reversed(parser.stack)', 'for tag in parser.stack', 'test_01_nested_closures_in_reverse_order'),
 ('html-tags', 'bin/agent-alert', 'self.stack.append(tag)', "self.stack.append(tag) if tag in ('b','i','u','s','code','pre','a') else None", 'test_02_telegram_extended_tags_closed'),
 ('http-retries', 'bin/agent-alert', 'print("transient", retry', 'print("refusal", retry', 'test_03_502_then_success_retried'),
 ('retry-after', 'bin/agent-alert', 'then pauza="$retry_after"; fi', 'then pauza=0; fi', 'test_03_429_retry_after_used'),
 ('trim-read', 'bin/agent-alert-hvost-obrezka', '[ -r "$F" ] ||', '[ -w "$F" ] ||', 'test_04_unreadable_tail_is_blind_and_unchanged'),
 ('cursor-intent', 'bin/otkaz-klyuch-watch', "write_atomic(pending, json.dumps(intent) + '\\n')  # Must succeed BEFORE any channel side effect.", 'pass # MUTATION_SKIP_INTENT', 'test_05_unknown_delivery_never_replayed'),
 ('cursor-no-replay', 'bin/otkaz-klyuch-watch', "if not intent['sent']:", 'if False: # MUTATION_NO_PENDING_STOP', 'test_05_unknown_delivery_never_replayed'),
 ('channel-errors', 'bin/otkaz-klyuch-watch', 'except (OSError, subprocess.SubprocessError):', 'except subprocess.SubprocessError: # MUTATION_NO_OSERROR', 'test_06_blind_journal_missing_channel_has_no_traceback'),
 ('channel-binary-output', 'bin/otkaz-klyuch-watch', "return run_bounded([path, '--', text], 120).returncode == 0", "result = run_bounded([path, '--', text], 120); result.stdout.decode('utf-8'); return result.returncode == 0 # MUTATION_DECODE_CHANNEL_OUTPUT", 'test_06_channel_nonutf8_output_does_not_erase_success'),
 ('value-whitespace', 'lib/dsh-trevogi/nastrojki.py', 'value != value.strip() or ', '', 'test_08_config_trailing_space_rejected'),
 ('path-equals', 'bin/agent-alert', 'value="${setting#*=}"', 'value="${setting#*=}"; value="${value%=}"', 'test_09_equal_suffix_preserved'),
 ('help-result', 'bin/agent-alert', 'logger -t agent-alert "исход=справка" 2>/dev/null; exit 0', 'logger -t agent-alert "исход=отказ-ключ" 2>/dev/null; exit 2', 'test_10_sender_help_is_not_option_refusal'),
 ('watcher-help', 'bin/otkaz-klyuch-watch', 'return 0 if e.code == 0 else 2', 'return 2 # MUTATION_HELP_FAILURE', 'test_11_watcher_help_zero'),
 ('trim-protocol', 'bin/agent-alert-hvost-obrezka', 'if [ "$have_hvost" -ne 1 ] || [ "$have_lines" -ne 1 ]; then', 'if false; then # MUTATION_MISSING_FIELDS', 'test_12_incomplete_reader_cannot_activate_fallback'),
 ('blank-lines', 'bin/agent-alert-hvost-obrezka', 'cat "$buffer" > "$F"', 'printf "%s\\n" "$(cat "$buffer")" > "$F"', 'test_13_trimming_preserves_blank_lines'),
 ('token-mode', 'bin/agent-alert', '(8#$mode & 4) != 0', '(8#$mode & 0) != 0', 'test_20_world_readable_token_check_refused'),
 ('journal-access', 'bin/otkaz-klyuch-watch', 'if not privileged:', 'if False: # MUTATION_JOURNAL_ACCESS', 'test_22_unprivileged_empty_journal_not_green'),
 ('html-attr', 'bin/agent-alert', 't = t[:-len(parser.rawdata)]', 'pass # MUTATION_UNFINISHED_ATTRIBUTE', 'test_01_attribute_angle_does_not_leave_unfinished_tag'),
 ('deadline-drain', 'bin/otkaz-klyuch-watch', 'process.stdout.close()', 'process.communicate() # MUTATION_UNBOUNDED_DRAIN', 'deadline'),
]

def sha(path):
 return hashlib.sha256(path.read_bytes()).hexdigest()

def run(root, test):
 env={**os.environ,'TREVOGI_TEST_ROOT':str(root),'PYTHONDONTWRITEBYTECODE':'1'}
 args=['python3',str(ROOT/'test/stend-audit-deadline.py')] if test=='deadline' else ['python3',str(ROOT/'test/stend-audit-kraev.py'),'Edges.'+test]
 result=subprocess.run(args,env=env,capture_output=True,text=True,timeout=20)
 return result.returncode

with tempfile.TemporaryDirectory(prefix='trevogi-audit-damage-') as td:
 root=Path(td)/'package';shutil.copytree(ROOT,root,ignore=shutil.ignore_patterns('__pycache__','.git'))
 for name,relative,old,new,test in PLANS:
  path=root/relative;original=path.read_bytes();count=original.decode().count(old)
  # Catch handler appears twice (logger and channel); mutate channel's last occurrence only.
  replacements=1
  if name=='channel-errors':
   assert count==2;offset=original.decode().rfind(old);changed=original.decode()[:offset]+original.decode()[offset:].replace(old,new,1)
   top='except (OSError, ValueError, TypeError, KeyError, OverflowError, subprocess.SubprocessError) as e:'
   assert changed.count(top)==1;changed=changed.replace(top,'except (ValueError, TypeError, KeyError, OverflowError, subprocess.SubprocessError) as e:',1);replacements=2
  elif name=='trim-read':
   assert count==1;lines=[];replacements=0
   for line in original.decode().splitlines():
    v=line.strip()
    if v.startswith('[ -r "$F" ] ||'):line='  : # MUTATION_NO_READ_GUARDS';replacements+=1
    elif v.startswith('bylo=$(wc -l'):line='  bylo=$(wc -l < "$F")';replacements+=1
    elif v.startswith('[[ "$bylo" =~'):replacements+=1;continue
    elif v.startswith('stalo=$(wc -l'):line='  stalo=$(wc -l < "$F")';replacements+=1
    lines.append(line)
   assert replacements==4;changed='\n'.join(lines)+'\n';new=': # MUTATION_NO_READ_GUARDS'
  else:
   assert count==1,(name,count);changed=original.decode().replace(old,new,1)
  good=run(root,test);assert good==0,(name,'healthy',good)
  before=sha(path);path.write_text(changed);after=sha(path)
  sample=new if new else 'if not value or any(c in value'
  grep=subprocess.run(['grep','-cF','--',sample,str(path)],capture_output=True,text=True)
  assert before!=after and grep.returncode==0 and grep.stdout.strip()=='1',(name,grep.stdout)
  print(name,'replacements',replacements,'grep-F1','SHA',before,'->',after,flush=True)
  bad=run(root,test);path.write_bytes(original);recovered=run(root,test)
  print(name,'codes',good,bad,recovered,'restoredSHA',sha(path),flush=True)
  assert (good,bad,recovered)==(0,1,0) and sha(path)==before,(name,good,bad,recovered)
