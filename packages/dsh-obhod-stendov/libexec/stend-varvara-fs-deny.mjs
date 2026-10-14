// Night reader: installed module/profile; synthetic contents only; no retries.
// 0 healthy, 1 broken policy, 2 blind prerequisites. Deadline 15 s, caller 30 s.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
if (process.argv.length !== 2) { console.error('СЛЕПОТА: unknown arguments'); process.exit(2); }
const app = process.env.DSH_TEST_APP ?? '/opt/varvara/app';
const profile = process.env.FS_DENY_PROFILE ?? '/opt/varvara/.dsh/profiles/web/cordis.patch.yml';
const backend = process.env.FS_DENY_BACKEND ?? path.join(app, 'node_modules/@deepseek-ai/dsh-fs-sandbox/lib/index.js');
const sessionRoot = process.env.FS_DENY_SESSION_ROOT ?? '/opt/varvara/.dsh/sessions';
const ledger = process.env.FS_DENY_LEDGER ?? '/opt/varvara/workspace/.message-receipts/receipts.sqlite';
const required = ['/opt/varvara/workspace/.message-receipts/**', '/var/tmp/dsh-voice-*', '/opt/varvara/.dsh/.env', '/opt/varvara/workspace/.gws/**', '/opt/varvara/.npmrc', '/opt/varvara/.dsh/sessions/**', '/opt/varvara/.dsh/attachments/**', '/opt/varvara/.ostrov-api-requests/**', '/opt/varvara/workspace/.ostrov-api-state.json', '/opt/varvara/workspace/a2a/**', '/opt/varvara/.dsh/.credentials.yaml', '/opt/varvara/workspace/attachments/**'];
let ctx, anchorCtx, voice, normal, passed = 0, failed = 0, serial = 0;
const scopes = [];
const timer = setTimeout(() => { console.error('СЛЕПОТА: reader exceeded 15 seconds'); process.exit(2); }, 15000);
timer.unref();
const check = async (label, fn) => {
  try { await fn(); passed++; console.log('PASS ' + label); }
  catch (e) { failed++; console.error('FAIL ' + label + ': ' + e.message); }
};
const assert = (value, message) => { if (!value) throw Error(message); };
// Session storage is root/project/session-id; no logs or message contents are opened.
async function sessionNamespaces(root) {
  const info = await fs.promises.lstat(root);
  assert(info.isDirectory() && !info.isSymbolicLink(), 'session root must be a real directory: ' + root);
  const names = [];
  let inspected = 0;
  const entries = async dir => {
    const rows = await fs.promises.readdir(dir, {withFileTypes: true});
    inspected += rows.length;
    assert(inspected <= 4096, 'session namespace scan exceeds 4096 directory entries');
    return rows;
  };
  for (const project of await entries(root)) {
    assert(!project.isSymbolicLink(), 'symlink in session storage: ' + path.join(root, project.name));
    assert(!project.isFile() || !/\.jsonl(?:\.zstd)?$/.test(project.name), 'unsupported flat session log: ' + path.join(root, project.name));
    if (!project.isDirectory()) continue;
    const directory = path.join(root, project.name);
    for (const entry of await entries(directory)) {
      const address = path.join(directory, entry.name);
      assert(!entry.isSymbolicLink(), 'symlink in session storage: ' + address);
      assert(!entry.isFile() || !/\.jsonl(?:\.zstd)?$/.test(entry.name), 'unsupported flat session log: ' + address);
      if (entry.isDirectory()) names.push({id: entry.name, path: address});
    }
  }
  assert(names.length > 0, 'no session directories found: ' + root);
  return names.sort((a, b) => a.path.localeCompare(b.path));
}
try {
  assert(process.getuid() === 981, 'reader must run under varvara UID981');
  const req = createRequire(path.join(app, 'package.json')), yaml = req('yaml');
  const doc = yaml.parseDocument(fs.readFileSync(profile, 'utf8'), {customTags: [{tag: 'tag:yaml.org,2002:js', resolve: v => v}]});
  assert(!doc.errors.length, 'profile YAML invalid');
  const rows = doc.toJS(); assert(Array.isArray(rows), 'profile root is not an array');
  const entries = rows.filter(row => row?.id === 'fs-sandbox');
  assert(entries.length === 1 && entries[0].config, 'fs-sandbox absent or duplicated');
  const config = entries[0].config;
  const channels = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (value.id === 'dsh-telegram-multiagent') channels.push(value.config);
    for (const child of Object.values(value)) visit(child);
  };
  visit(rows);
  assert(channels.length === 1 && Array.isArray(channels[0]?.allowedUsers), 'channel allowedUsers absent or ambiguous');
  const users = channels[0].allowedUsers;
  assert(users.every(id => Number.isSafeInteger(id) && id > 0), 'channel allowedUsers must contain positive integer IDs');
  const allowedUsers = new Set(users.map(String));
  const namespaces = await sessionNamespaces(sessionRoot);
  const rotated = new Set();
  // Ordinary chat rotation loses the numeric ID in its directory name. Only a
  // durable route to an explicitly allowed user admits that UUID; never its shape.
  if (namespaces.some(row => /^telegram-v2-/.test(row.id))) {
    const {DatabaseSync} = await import('node:sqlite');
    const db = new DatabaseSync(ledger, {readOnly: true});
    try {
      for (const row of db.prepare('SELECT route_key, session_id FROM channel_sessions').all())
        if (allowedUsers.has(row.route_key)) rotated.add(row.session_id);
      for (const row of db.prepare("SELECT route_key, old_id, new_id FROM session_rotations WHERE phase='committed'").all())
        if (allowedUsers.has(row.route_key)) { rotated.add(row.old_id); rotated.add(row.new_id); }
    } finally { db.close(); }
  }
  await check('session namespace prefixes', async () => {
    const unknown = namespaces.filter(row => {
      if (row.id === 'telegram-a2a' || row.id.startsWith('telegram-gost-') || row.id.startsWith('telegram-site-')) return false;
      const numeric = /^telegram-([1-9][0-9]*)$/.exec(row.id);
      if (numeric && allowedUsers.has(numeric[1])) return false;
      return !(/^telegram-v2-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(row.id) && rotated.has(row.id));
    });
    assert(!unknown.length, 'unknown session prefix: ' + unknown.map(row => row.path).join(', '));
    console.log('SESSION_NAMES ' + JSON.stringify({root: sessionRoot, ids: namespaces.map(row => row.id)}));
  });
  for (const rule of required) await check('profile rule ' + rule, async () => assert(config.deniedPaths?.includes(rule), 'missing rule'));
  await check('profile guest-only scope', async () => assert(JSON.stringify(config.deniedSessionPrefixes) === JSON.stringify(['telegram-gost-', 'telegram-site-']), 'wrong session prefixes'));
  const load = n => import(req.resolve('@deepseek-ai/' + n));
  const [{Context}, {default: Sandbox}, {default: Tools, defineTool}, {createScope}, native, present] = await Promise.all([load('cordis'), import(pathToFileURL(backend)), load('dsh-tools'), load('dsh-scope'), load('dsh-tool-fs'), load('dsh-tool-present')]);
  const start = async cfg => {
    const c = new Context();
    c.provide('systemPrompt', {tools() {}, section() {}, getSectionOrder() { return 1; }});
    c.provide('sandboxPolicy', {defaultMode: 'workspace-write', resolve: () => ({mode: 'workspace-write', workspaceRoot: cfg.cwd})});
    c.provide('sessionProjections', {stateOf: () => ({openTurnStartSeq: 1, lastTurn: 1})});
    c.plugin(Tools); c.plugin(Sandbox, cfg); c.plugin(native); c.plugin(present);
    for (let n = 0; n < 100 && !c.get('tools')?.get('present'); n++) await new Promise(r => setTimeout(r, 10));
    assert(c.get('tools')?.get('present'), 'native tools not loaded');
    // Metadata-only check. Even a missing patch never opens production contents.
    c.tools.register(defineTool({name: 'fs_deny_resolve', description: 'reader metadata probe', parameters: {path: {type: 'string', required: true}},
      output: {schema: {type: 'object', additionalProperties: true}, render: (_a, v) => [{type: 'text', text: JSON.stringify(v)}]},
      async execute(args) { try { await c.fs.resolve(args.path); return {code: 'ALLOWED'}; } catch (e) { return {code: e.code ?? 'OTHER'}; } }}));
    return c;
  };
  const actor = (c, id, header = {}) => {
    const a = {id, session: {id, header: {id, cwd: c.fs.config.cwd, ...header}, events: [], append() {}}};
    const scope = createScope(c, a); a.ctx = scope.ctx; scopes.push(scope); return a;
  };
  const call = (c, a, name, args) => c.tools.execute({agent: a, name, arguments: args, callId: 'night-' + (++serial), signal: AbortSignal.timeout(5000)});
  const refused = async (c, a, name, args) => { const out = await call(c, a, name, args); assert(out.isError && /путь закрыт настройкой/.test(JSON.stringify(out)), 'wrong or missing refusal'); };
  const allowed = async (c, a, file, marker) => { const out = await call(c, a, 'read', {file_path: file}); assert(!out.isError && JSON.stringify(out).includes(marker), 'allowed read failed'); };
  ctx = await start({...config, cwd: '/opt/varvara/workspace'});
  const guest = actor(ctx, 'telegram-gost-1683'), site = actor(ctx, 'telegram-site-1683'), work = actor(ctx, 'telegram-a2a');
  for (const rule of required) {
    const literal = rule.endsWith('/**') ? rule.slice(0, -3) : rule.endsWith('*') ? null : rule;
    if (literal) await check('guest metadata FS_PERMISSION_DENIED ' + literal, async () => {
      const out = await call(ctx, guest, 'fs_deny_resolve', {path: literal}); assert(out.value?.code === 'FS_PERMISSION_DENIED', 'wrong backend code');
    });
  }
  voice = fs.mkdtempSync('/var/tmp/dsh-voice-fscheck-'); normal = fs.mkdtempSync('/var/tmp/fs-deny-neighbor-');
  const privateFile = path.join(voice, 'canary.txt'), neighbor = path.join(normal, 'neighbor.txt');
  fs.writeFileSync(privateFile, 'SYNTHETIC_PRIVATE', {mode: 0o600}); fs.writeFileSync(neighbor, 'SYNTHETIC_NEIGHBOR', {mode: 0o600});
  assert(fs.readFileSync(privateFile, 'utf8') === 'SYNTHETIC_PRIVATE', 'fixture not created');
  for (const a of [guest, site]) {
    await check(a.id + ' read denied', () => refused(ctx, a, 'read', {file_path: privateFile}));
    await check(a.id + ' present preflight denied', () => refused(ctx, a, 'present', {files: [{path: neighbor + '-absent'}, {path: privateFile}]}));
    await check(a.id + ' neighbor allowed', () => allowed(ctx, a, neighbor, 'SYNTHETIC_NEIGHBOR'));
  }
  await check('working protected read allowed', () => allowed(ctx, work, privateFile, 'SYNTHETIC_PRIVATE'));
  const resumed = actor(ctx, 'reader-resumed-child', {origin: 'subagent', parentSession: guest.id});
  await check('durable guest child denied', () => refused(ctx, resumed, 'read', {file_path: privateFile}));
  const anchor = path.join(normal, '.ostrov-api-state.json'); fs.writeFileSync(anchor, 'SYNTHETIC_ANCHOR', {mode: 0o600});
  anchorCtx = await start({...config, cwd: normal, deniedPaths: (config.deniedPaths ?? []).map(rule => rule === '/opt/varvara/workspace/.ostrov-api-state.json' ? anchor : rule)});
  const anchorGuest = actor(anchorCtx, guest.id), anchorWork = actor(anchorCtx, work.id);
  for (const [name, args] of [['read', {file_path: anchor}], ['write', {file_path: anchor, content: 'BAD'}], ['edit', {file_path: anchor, old_string: 'ANCHOR', new_string: 'BAD'}]]) {
    await check('anchor guest ' + name, async () => { await refused(anchorCtx, anchorGuest, name, args); assert(fs.readFileSync(anchor, 'utf8') === 'SYNTHETIC_ANCHOR', 'anchor changed'); });
  }
  await check('anchor work read allowed', () => allowed(anchorCtx, anchorWork, anchor, 'SYNTHETIC_ANCHOR'));
  const policy = process.env.FS_DENY_SITE_POLICY ?? '/opt/agent-plugins/dsh-telegram-multiagent/src/site-policy.js';
  const {installSitePolicy} = await import(pathToFileURL(policy));
  let bodyCalls = 0;
  ctx.tools.register(defineTool({name: 'bash', description: 'safe sentinel, no shell', parameters: {}, output: {schema: {type: 'string'}, render: (_a, v) => [{type: 'text', text: v}]}, execute: async () => { bodyCalls++; return 'SAFE_BASH_BODY'; }}));
  ctx.tools.register(defineTool({name: 'pismo_rukovoditelyu', description: 'policy prerequisite, not called', parameters: {}, output: {schema: {type: 'string'}, render: () => []}, execute: async () => { throw Error('unexpected mail'); }}));
  await check('working bash body positive control', async () => { const out = await call(ctx, work, 'bash', {}); assert(!out.isError && bodyCalls === 1, 'body unreachable'); });
  for (const a of [guest, site]) {
    installSitePolicy(a.ctx, a, {closed: () => false});
    await check(a.id + ' bash denied before body', async () => {
      const before = bodyCalls, out = await call(ctx, a, 'bash', {});
      assert(out.isError && bodyCalls === before && !ctx.tools.wireSchemas(a).schemas.some(t => t.name === 'bash'), 'bash reached body or advertised');
    });
  }
  console.log('RESULT native fs-deny ' + passed + '/' + (passed + failed) + '; backend=' + backend + '; profile=' + profile);
  process.exitCode = failed ? 1 : 0;
} catch (e) { console.error('СЛЕПОТА: fs-deny ' + e.message); process.exitCode = 2; }
finally {
  clearTimeout(timer); for (const scope of scopes) await scope.dispose(); await anchorCtx?.fiber.dispose(); await ctx?.fiber.dispose();
  for (const p of [voice, normal]) if (p) fs.rmSync(p, {recursive: true, force: true});
}
