// RU: Чтение готовой политики порога из файла D (<каталог>/<агент>.json, поле porogi). Здесь нет ни YAML, ни
//     реестра, ни командной строки, ни пересчёта порога, ни кэша: числа уже вычислены сборщиком настроек,
//     модуль только проверяет форму и выбирает маршрут (provider/model). Любая беда — объект { prichina }, а не
//     исключение.
// EN: Reads the ready threshold policy from the D file (<dir>/<agent>.json, field porogi). No YAML, no
//     registry, no CLI, no threshold recomputation, no cache here: the numbers are already computed by the
//     settings builder; the module only validates the shape and picks a route (provider/model). Any fault is
//     returned as { prichina }, not thrown.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KATALOG_D_PO_UMOLCHANIYU } from './tekstovye-nastrojki.mjs';
export function chitatPorogD(imya, route = null, katalog = process.env.KOMPAKT_NASTROJKI_KATALOG || KATALOG_D_PO_UMOLCHANIYU) {
  let put = katalog;
  try {
    if (typeof imya !== 'string' || !/^[A-Za-z0-9_-]+$/.test(imya)) throw Error('негодное имя агента');
    put = join(katalog, imya + '.json');
    const p = JSON.parse(readFileSync(put, 'utf8')).porogi;
    const fields = (obj, names) => obj && Object.keys(obj).length === names.length && names.every(k => Object.hasOwn(obj, k));
    if (!fields(p, ['schema','defaultRoute','routes']) || p.schema !== 1) throw Error('неизвестная schema porogi');
    const validRoute = r => r && typeof r.provider === 'string' && r.provider && typeof r.model === 'string' && r.model;
    if (!fields(p.defaultRoute, ['provider','model']) || !validRoute(p.defaultRoute)) throw Error('негодный defaultRoute');
    if (route !== null && !validRoute(route)) throw Error('неполная пара provider/model');
    if (!Array.isArray(p.routes) || !p.routes.length) throw Error('пустые routes');
    const target = JSON.stringify([...(route === null ? [p.defaultRoute.provider, p.defaultRoute.model] : [route.provider, route.model])]);
    const seen = new Set(); let chosen;
    for (const r of p.routes) {
      if (!fields(r, ['provider','model','window','ratio','nominalThreshold']) || !validRoute(r)) throw Error('негодный маршрут');
      const key = JSON.stringify([r.provider, r.model]);
      if (seen.has(key)) throw Error('повтор маршрута');
      seen.add(key);
      if (!Number.isSafeInteger(r.window) || r.window <= 0 || !Number.isSafeInteger(r.nominalThreshold) || r.nominalThreshold <= 0 || r.nominalThreshold >= r.window || typeof r.ratio !== 'number' || !Number.isFinite(r.ratio) || !(r.ratio > 0 && r.ratio < 1)) throw Error('негодные окно/доля/порог');
      if (key === target) chosen = r;
    }
    if (!seen.has(JSON.stringify([p.defaultRoute.provider, p.defaultRoute.model])) || !chosen) throw Error('маршрут не объявлен');
    return { ...chosen, routeSource: route === null ? 'defaultRoute' : 'request', thresholdKind: 'nominal', path: put };
  } catch (e) {
    return { prichina: `${imya}: D ${put}: ${e.message}` };
  }
}
