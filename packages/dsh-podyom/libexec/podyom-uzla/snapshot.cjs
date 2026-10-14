    const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync(process.argv[2],{readOnly:true});
    // A-N-1948 №10 (№16): путь снимка — ПАРАМЕТРОМ, а не склейкой в текст SQL (кавычка в пути ломала запрос).
    db.prepare('VACUUM INTO ?').run(process.argv[3]);
    // Таблицы zapisi нет (не та база, старая схема) — снимок СДЕЛАН, считать нечего: это не отказ снимка.
    const est=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='zapisi'").get();
    console.log(est ? '  записей в снимке: ' + db.prepare('SELECT COUNT(*) c FROM zapisi').get().c
                    : '  записей в снимке: таблицы zapisi нет — не считаю (снимок сделан)');
    db.close();
