# RU: Вспомогательный модуль тестов: создаёт пустую базу SQLite с упрощённой таблицей memories хранилища OMEGA и векторной таблицей memories_vec (sqlite_vec, 1024 измерения, косинусное расстояние).
# EN: Test helper: creates an empty SQLite database with a reduced OMEGA `memories` table and a `memories_vec` vector table (sqlite_vec, 1024 dimensions, cosine distance).
# RU: Подставляется вместо боевой базы памяти; полную схему хранилища не воспроизводит, поэтому зависимости от прочих столбцов, индексов и триггеров на ней не проверяются.
# EN: Stands in for the production memory database; it does not reproduce the full store schema, so dependencies on other columns, indexes or triggers are not checked with it.
import sqlite3
import sqlite_vec

# RU: Создаёт базу по пути path; расширение sqlite_vec включается только на время создания таблиц.
# EN: Creates the database at `path`; the sqlite_vec extension is enabled only while the tables are created.
def create_db(path):
    with sqlite3.connect(path) as c:
        c.enable_load_extension(True)
        sqlite_vec.load(c)
        c.enable_load_extension(False)
        c.execute('CREATE TABLE memories(id INTEGER PRIMARY KEY, node_id TEXT UNIQUE,content TEXT,metadata TEXT,created_at TEXT,entity_id TEXT,valid_until TEXT,ttl_seconds INTEGER,status TEXT)')
        c.execute('CREATE VIRTUAL TABLE memories_vec USING vec0(embedding float[1024] distance_metric=cosine)')
