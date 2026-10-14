    const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync(process.argv[2],{readOnly:true});
    const est=(t)=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
    if(!est('nastrojki')){ console.log('  рубеж: таблицы nastrojki нет — миграция не прошла или версия старая'); process.exit(0); }
    // 🔴 kluch, а НЕ klyuch (07.09.2026). Имя колонки было взято из головы, а в схеме ядра
    // оно без «я»: CREATE TABLE nastrojki (kluch TEXT PRIMARY KEY, …). Запрос падал ВСЕГДА,
    // разряд был мёртв с написания — и молчал честно («рубеж прочитать не удалось»), потому
    // и не тревожил. Ветка слепоты работала, предмет не проверялся ни разу.
    const r=db.prepare("SELECT znachenie FROM nastrojki WHERE kluch LIKE '%rubezh%'").get();
    const c=db.prepare('SELECT COUNT(*) c FROM zapisi').get().c;
    const m=db.prepare('SELECT COALESCE(MAX(id),0) m FROM zapisi').get().m;
    console.log('  рубеж: ' + (r? r.znachenie : 'НЕ ЗАПИСАН') + ' · записей ' + c + ' · MAX(id) ' + m);
    console.log('  ⚠️ равенство рубежа и MAX(id) проверяет ЧЕЛОВЕК: при дырах в id это разные числа');
    db.close();
