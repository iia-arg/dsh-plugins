// RU: Изолированный стенд test-platform.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness test-platform.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export async function testPlatform(names = ['cordis','dsh-session','dsh-agent','dsh-session-persistence-jsonl','dsh-llm']) {
  let where = 'Node-resolve от пакета';
  try {
    let req;
    if (Object.hasOwn(process.env, 'DSH_TEST_APP')) {
      const app = process.env.DSH_TEST_APP;
      where = `DSH_TEST_APP=${JSON.stringify(app)}`;
      if (!app?.trim() || !path.isAbsolute(app) || !fs.statSync(app).isDirectory()) {
        throw Object.assign(Error('нужен существующий абсолютный каталог платформы'), {code:'TEST_PLATFORM_UNAVAILABLE'});
      }
      req = createRequire(path.join(app, 'package.json'));
    } else req = createRequire(import.meta.url);
    const result = {};
    for (const name of names) result[name] = await import(pathToFileURL(req.resolve('@deepseek-ai/'+name)).href);
    return result;
  } catch (e) {
    if (!['TEST_PLATFORM_UNAVAILABLE','MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND','ENOENT','EACCES','ENOTDIR'].includes(e.code)) throw e;
    console.error(`СЛЕПОТА: тестовая платформа недоступна (${where}): ${e.message}`);
    process.exit(2);
  }
}
