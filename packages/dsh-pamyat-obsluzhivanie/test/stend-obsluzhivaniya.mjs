// RU: Стенд пакета: запускает все test_*.py этого каталога через unittest интерпретатором Python из venv OMEGA.
// EN: Package test bench: runs every test_*.py in this directory via unittest using the OMEGA venv Python.
// RU: Коды: 0 — все тесты прошли; 1 — тест упал или стенд не запустился (в т.ч. предел 110 с); 2 — СЛЕПОТА: нет Python OMEGA, numpy или sqlite_vec.
// EN: Exit codes: 0 — all tests passed; 1 — a test failed or the bench failed to run (including the 110 s limit); 2 — BLIND: OMEGA Python, numpy or sqlite_vec missing.
// RU: Не запускает security-root.py и proba-root-paths.sh: им нужен root и отдельное пространство монтирования.
// EN: Does not run security-root.py or proba-root-paths.sh: they need root and a separate mount namespace.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const python='/opt/omega/venv/bin/python3';
const env={...process.env,PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1'};
// RU: Сначала проверяются зависимости: без них прогон был бы не проверкой, а слепотой.
// EN: Dependencies are checked first: without them a run would be blindness, not a check.
const deps=spawnSync(python,['-B','-c','import numpy, sqlite_vec'],{env,encoding:'utf8',timeout:10000});
if(deps.error||deps.status!==0){console.error('СЛЕПОТА: нет Python OMEGA/numpy/sqlite_vec');process.exit(2);}
// RU: Прогон тестов без записи байткода и с одним потоком BLAS.
// EN: Test run without bytecode writes and with a single BLAS thread.
const r=spawnSync(python,['-B','-m','unittest','discover','-s',fileURLToPath(new URL('.',import.meta.url)),'-p','test_*.py','-v'],{env,encoding:'utf8',timeout:110000,maxBuffer:16*1024*1024});
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
if(r.error){console.error('ОТКАЗ стенда: '+r.error.code);process.exit(1);}
process.exit(r.status===0?0:1);
