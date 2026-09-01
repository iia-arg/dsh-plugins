/**
 * Извлечь определения трёх инструментов расписания ИСПОЛНЕНИЕМ пакета
 * платформы @deepseek-ai/dsh-schedule — тем же способом, что даёт paritet.json.
 *
 * 🔴 ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ СТРОКИ В paritet.json. paritet.json означает
 * «знак в знак с набором соседнего агента», и это доказывается сверкой против ЕГО
 * живых пакетов. Расписания у соседнего агента нет вовсе — дописав расписание туда,
 * мы сломали бы сам смысл слова «паритет» и его проверку. Здесь паритет
 * другой: с пакетом платформы, который у нас же и смонтирован.
 *
 * 🔴 ПОЧЕМУ НЕ mod.apply, КАК У ЦЕЛЕЙ. Пакет расписания регистрирует
 * инструменты не при загрузке, а на КАЖДОГО созданного агента — публичной
 * функцией registerScheduleTools(rootCtx, toolCtx, agent, onDurableChange).
 * Поэтому подставной ctx здесь двухслойный: корневой и агентский.
 */
// Корень установки платформы — первым доводом при запуске: у каждого он свой.
const root = (process.argv[2] || process.cwd()) + '/node_modules/@deepseek-ai'
const mod = await import(`${root}/dsh-schedule/lib/index.js`)

const out = []
const toolCtx = {
  tools: {
    register: (t) => {
      out.push({ pkg: 'dsh-schedule', name: t.name, description: t.description, parameters: t.parameters ?? {} })
      return () => {}
    },
  },
}
const rootCtx = {
  logger: { warn: () => {}, info: () => {} },
  sessions: { flush: async () => {} },
  agents: { get: () => undefined, roots: () => [] },
  get: () => ({}),
  on: () => () => {},
}
const agent = { id: 'izvlechenie', session: { events: [], header: {} }, ctx: toolCtx }

mod.registerScheduleTools(rootCtx, toolCtx, agent, () => {})

// Падаем громко: молчаливый недобор здесь дал бы мост, у которого часть
// инструментов просто исчезла, и снаружи это выглядело бы как «модель их не
// зовёт». Число обязано быть названо, а не подразумеваться.
const OZHIDAEMO = 3
if (out.length !== OZHIDAEMO) {
  console.error(`🔴 СЛЕПОТА/КРАСНАЯ: снято ${out.length} определений, ожидалось ${OZHIDAEMO}`)
  process.exit(1)
}
console.log(JSON.stringify(out, null, 2))
