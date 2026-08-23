/**
 * Anthropic subscription gateway — a shared system service of the machine.
 *
 * WHY. There are several agents on the machine, each under its own user. If
 * every one of them kept the subscription token, the secret would multiply
 * across the machine. Here it lives in ONE place, under its own user, and the
 * agents get an entry point. A new agent is connected by a line of
 * configuration and knows nothing about the token.
 *
 * 🔴 WHY THE OFFICIAL SDK INSIDE AND NOT HAND-ROLLED HTTP (lesson of 2026-08-19).
 * At first the gateway assembled the API request by hand: subscription token,
 * two beta flags pulled out of the client binary. Authorisation worked (a wrong
 * token got 401, ours got 429), but EVERY call was rejected by a rate limit
 * while the subscription was entirely healthy: three agents were working on it
 * at that very moment. We went through and discarded four hypotheses — client
 * headers, model binding, token expiry, the set of beta flags. The truth was
 * something else: the raw path is simply not served to subscription access. Same
 * token, same machine, same network egress — the SDK answers in four seconds, a
 * hand-rolled request is refused.
 * The general conclusion: DO NOT REINVENT THE VENDOR'S PROTOCOL. Vendor code
 * knows subtleties that are not in the documentation, and it will survive them
 * changing.
 *
 * 🔴 INDEPENDENCE FROM ANY OTHER MACHINE. The SDK is installed HERE, the token is
 * HERE, and the machine has its own network egress. No central node takes part
 * in the chain and any such node may be switched off — a direct requirement of
 * the owner, verified with a live call.
 *
 * BOUNDARIES. Listens on loopback only. It is never exposed outward: this is
 * access to our subscription without a password.
 *
 * 🔴 THE ENGINE EXECUTES THE TOOLS, NOT THE PLATFORM — AND THE CHOICE OF USER
 * FOLLOWS FROM THAT. The SDK is agentic: it drives the loop itself and itself
 * runs the shell, files, search and web. So the agent's "hands" are the user
 * THIS process runs as. That is why the service is started as an INSTANCE PER
 * AGENT (`...@<agent name>.service`), under the agent's own user name and on its
 * own port. A shared system user does not fit here structurally: it has no
 * access to the agent's home, and every agent on the machine would act as one
 * and the same person, treading on each other.
 * What DOES stay shared: the token file — one per machine, no secret in the
 * agent's configuration, rotation in one place.
 * What you must NOT imagine: an agent with sudo will read the token file
 * anyway. Isolation of the secret is real against agents WITHOUT sudo.
 *
 * THE RIGHTS BOUNDARY. No confirmations are requested (`bypassPermissions`):
 * there is nobody here to ask, the far end is not a human but the platform. The
 * real boundary is the rights of the instance user, and it is set in systemd,
 * not here.
 */

import http from 'node:http';
import fs from 'node:fs';
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { shape } from './jsonschema-to-zod.mjs';

const PORT = Number(process.env.GATEWAY_PORT || 8788);
const HOST = '127.0.0.1';
const TOKEN_FILE = process.env.GATEWAY_TOKEN_FILE || '/etc/subscription-gateway/token';
const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_MAX_TURNS = Number(process.env.GATEWAY_MAX_TURNS || 60);
/**
 * External tool servers (MCP) for this instance's agent. Set through the
 * GATEWAY_MCP variable as JSON: {"<server name>":{"type":"http","url":"..."}}.
 * Empty — the agent works without them, and that is not an error.
 */
const MCP_SERVERS = (() => {
  const raw = process.env.GATEWAY_MCP;
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && Object.keys(v).length ? v : null;
  } catch (e) {
    // Ignoring this silently is not allowed: the agent would be left without
    // memory, and it would look like "memory does not work" rather than "I wrote
    // the line wrong".
    console.error(`[subscription-gateway] 🔴 GATEWAY_MCP could not be parsed: ${e?.message}`);
    return null;
  }
})();

/** Default working directory for the tools — the instance user's home. */
const WORK_DIR = process.env.GATEWAY_WORK_DIR || process.env.HOME || '/tmp';

const log = (m) => console.error(`[subscription-gateway] ${m}`);

/**
 * "exited with code N" from the SDK is only a code without a reason; the truth
 * is in the session transcript. We look for attachment.type == "max_turns_reached"
 * and return a human-readable line with the numbers. Not found — the original
 * text plus an explicit "reason not established", WITHOUT inventing a plausible
 * one.
 *
 * 🔴 The strings matched here — 'exited with code', 'returned an error result',
 * 'max_turns_reached' — are the SDK'S OWN wording and protocol constants. They
 * are not ours to translate or prettify: change them and the match silently
 * stops finding anything, leaving a code without a reason again.
 */
function explainExit(err, sessionId, cwd) {
  const raw = String(err?.message ?? err);
  if (!/(?:exited with code|returned an error result)/.test(raw)) return raw;
  try {
    const slug = cwd.replaceAll('/', '-');
    const file = `${process.env.HOME || WORK_DIR}/.claude/projects/${slug}/${sessionId}.jsonl`;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('max_turns_reached')) continue;
      const a = JSON.parse(line)?.attachment;
      if (a?.type === 'max_turns_reached') {
        return `the agent hit the turn limit: reached ${a.turnCount} against a threshold of ${a.maxTurns} (max_turns_reached)`;
      }
    }
  } catch {
    return `${raw} — reason not established (the transcript could not be read)`;
  }
  return `${raw} — reason not established (no max_turns_reached entry in the fresh transcript)`;
}

/** The token is read on EVERY request: rotating the secret needs no restart. */
function readToken() {
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

/** A short caption for a tool call: what exactly it does, in one line. */
function briefOf(input) {
  if (!input || typeof input !== 'object') return '';
  const v = input.command ?? input.file_path ?? input.pattern ?? input.url ?? input.path ?? input.query;
  return typeof v === 'string' ? v.slice(0, 200) : '';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Assemble one text prompt out of the messages.
 *
 * A deliberate simplification: the SDK takes the prompt as a string. History is
 * glued together with role labels — the model understands them, and the platform
 * keeps its own history anyway. When there is time for it, real message passing
 * will appear here instead of gluing.
 *
 * 🔴 THESE ROLE LABELS ARE MODEL-FACING TEXT, NOT DISPLAY TEXT. They go into the
 * prompt, so changing them changes what the model reads. If your platform speaks
 * another language, change them deliberately and together, not one of the two.
 */
function buildPrompt(messages) {
  const parts = [];
  for (const m of messages ?? []) {
    const who = m.role === 'assistant' ? 'Assistant' : 'User';
    const c = m.content;
    const text =
      typeof c === 'string'
        ? c
        : Array.isArray(c)
          ? c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n')
          : '';
    if (text) parts.push(`${who}: ${text}`);
  }
  return parts.join('\n\n');
}

/**
 * THE PLATFORM TOOL BRIDGE.
 *
 * The engine executes the tools, so its own set is the only one the model sees.
 * Platform plugins do not reach it at all. The bridge builds an MCP server out of
 * the description sent by the platform and proxies the calls back.
 *
 * 🔴 THE GATEWAY DOES NOT KNOW WHAT THESE TOOLS ARE. Names, descriptions and
 * schemas arrive from the other side; there is only transport here. The next
 * agent with a different tool set connects without editing this file — that is
 * what makes it a general solution rather than a patch for one case.
 *
 * TRANSPORT sdk, NOT stdio: an sdk server lives in this same process and spawns
 * no child. Everything the SDK passes to a child process goes as the
 * --mcp-config argument and is readable by any user of the machine through
 * /proc/<pid>/cmdline (mode 444) — verified with a live observer on 2026-08-22.
 * That is why the bridge TICKET does not leak with sdk: it stays in the memory of
 * two processes and in the request body over loopback.
 *
 * 🔴 WHAT EXACTLY THE GATEWAY CARRIES. Not an identity and not a shared secret,
 * but a ONE-TIME TICKET issued by the platform for this turn. The gateway does
 * not know whose it is: there is not a single agent-identity field in this file,
 * neither in the code nor in the comments (we deliberately avoid writing even the
 * name of that field here: otherwise a grep check would find its own caveat and
 * take it for an occurrence). The platform retrieves the identity by the ticket
 * from its own table. So there is nothing here to assert somebody else's identity
 * with — neither for the model nor for the gateway itself.
 */
function buildBridgeServer(bridge) {
  if (!bridge?.url || !bridge?.ticket || !Array.isArray(bridge.tools) || !bridge.tools.length) return null;

  // 🔴 THE GATEWAY DOES NOT KNOW WHOSE REQUEST THIS IS, AND MUST NOT. It carries
  // an opaque one-time ticket issued by the platform for this turn and presents it
  // at the door. The platform retrieves the identity by that ticket from its own
  // table. The identity is NOT transmitted: whoever asserts it must not be the one
  // who assigns it. The ticket lives in the CLOSURE of this handler — with the sdk
  // transport it goes neither into a command line nor into the environment
  // (measured: 0 hits across 275 inspected processes).
  const callBridge = async (toolName, args) => {
    const r = await fetch(bridge.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bridge-ticket': bridge.ticket },
      body: JSON.stringify({ tool: toolName, args }),
    });
    if (!r.ok) throw new Error(`the bridge answered ${r.status}`);
    const out = await r.json();
    if (out?.ok !== true) throw new Error(String(out?.error ?? 'the bridge refused without a reason'));
    return out.value;
  };

  const tools = [];
  for (const t of bridge.tools) {
    let inputShape;
    try {
      inputShape = shape(t.inputSchema ?? { type: 'object', properties: {} });
    } catch (e) {
      // A tool whose schema we cannot assemble is NOT exposed "as is": the model
      // would get a tool with no parameter shape and would fail at execution
      // time. The skip is loud, the rest keep working.
      log(`🔴 tool ${t.name} skipped: ${e?.message}`);
      continue;
    }
    tools.push(
      tool(
        t.name,
        t.description ?? '',
        inputShape,
        async (args) => {
          try {
            const value = await callBridge(t.name, args ?? {});
            return { content: [{ type: 'text', text: JSON.stringify(value ?? null) }] };
          } catch (e) {
            // The refusal is returned as text, not as an exception: the model
            // must read the reason and decide what to do, not see the tool cut
            // off. 🔴 This text is model-facing.
            return { content: [{ type: 'text', text: `REFUSED: ${e?.message ?? e}` }], isError: true };
          }
        },
      ),
    );
  }
  if (!tools.length) return null;

  // alwaysLoad: otherwise the tools go behind a catalogue search and are not
  // visible in the system header — and the header is precisely our acceptance sign.
  return createSdkMcpServer({ name: bridge.name || 'dsh', version: '0.1.0', tools, alwaysLoad: true });
}

/**
 * Merge the tool servers WITHOUT letting the bridge overwrite somebody else's
 * server with its own name.
 *
 * 🔴 THE NAMING RULE (2026-08-22): server names must not coincide — neither with
 * ones already connected here, nor between the root and subagent levels. The
 * price of a collision is silent, and it goes both ways:
 *   * here a plain spread would overwrite a same-named server entirely, and the
 *     model would get the bridge in its place without ever learning of it;
 *   * for a subagent (experiment B, 2026-08-22) a server bearing THE ROOT'S NAME
 *     comes up with its own environment yet the root's one answers anyway — from
 *     the start-up alone it looks as if the configuration works.
 * Therefore a collision means refusing to connect the bridge, not a quiet
 * substitution: without the bridge the agent works worse, with a substituted
 * server it works wrongly.
 */
function mergeMcpServers(base, bridgeName, bridgeServer) {
  const servers = { ...(base ?? {}) };
  if (!bridgeServer) return { servers, mounted: false, conflict: null };
  if (Object.prototype.hasOwnProperty.call(servers, bridgeName)) {
    return { servers, mounted: false, conflict: bridgeName };
  }
  servers[bridgeName] = bridgeServer;
  return { servers, mounted: true, conflict: null };
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    const ok = Boolean(readToken());
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
    // Health means the PRESENCE OF THE SECRET, not "the process is alive":
    // without a token the service is up but useless, and that must be visible
    // from outside.
    // 🔴 The `token` field is API SURFACE, not a log line: the README documents
    // this exact response and acceptance step 1 compares against it. If you change
    // the wording, change the README and anything scripted against it in the same
    // pass — the HTTP status is the machine-readable part, this field is not.
    res.end(JSON.stringify({ ok, token: ok ? 'present' : 'MISSING', sdk: true }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/v1/agent-stream') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'unknown path; /v1/agent-stream and /health exist' }));
    return;
  }

  const token = readToken();
  if (!token) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'no_credential', message: 'no subscription token' } }));
    log('🔴 request rejected: the token could not be read');
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'bad_json', message: 'the request body could not be parsed' } }));
    return;
  }

  // A stream of events as JSON lines: one line, one event. The format is our own
  // and deliberately simple; translating it into the platform's protocol is the
  // job of a module on the agent's side.
  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-cache',
  });
  const send = (o) => res.write(JSON.stringify(o) + '\n');

  const started = Date.now();
  const cwd = body.cwd || WORK_DIR;
  const sessionId = crypto.randomUUID(); // Node >=19; we run v24, the global exists

  // The platform tool bridge: connected ONLY when the other side has sent a
  // descriptor with a ticket. Without one the behaviour is exactly as before.
  let bridgeServer = null;
  try {
    bridgeServer = buildBridgeServer(body.bridge);
  } catch (e) {
    // A failure to build the bridge must not bring down the request itself:
    // without tools the agent works worse, but it works. Staying silent about it
    // is not allowed.
    log(`🔴 the bridge was not built: ${e?.message}`);
  }
  const bridgeName = body.bridge?.name || 'dsh';
  const merged = mergeMcpServers(MCP_SERVERS, bridgeName, bridgeServer);
  const mcpAll = merged.servers;
  // The "connected" line is printed AFTER the merge and only on success: it is
  // our acceptance sign, and it must not lie.
  if (merged.mounted) log(`bridge connected: tools ${body.bridge.tools.length}, server "${bridgeName}" (the ticket carries the identity, the gateway does not know it)`);
  else if (merged.conflict) log(`🔴 bridge NOT connected: the server name "${merged.conflict}" is already taken by another tool server`);
  try {
    const iter = query({
      prompt: buildPrompt(body.messages),
      options: {
        model: body.model || DEFAULT_MODEL,
        // A loop with tools: one turn is only enough for a conversation. We keep
        // a limit so that a jammed agent does not spin forever, but a generous one.
        maxTurns: Number(body.maxTurns) > 0 ? Number(body.maxTurns) : DEFAULT_MAX_TURNS,
        permissionMode: 'bypassPermissions',
        sessionId,
        // 🔴 EXTERNAL TOOL SERVERS ARE CONNECTED HERE, NOT IN THE PLATFORM
        // (2026-08-19, it cost an hour). The engine executes the tools, so its
        // own set is the only one the agent sees. A client plugin on the platform
        // side connects without errors, appears in the plugin set — and does not
        // reach the agent at all: in this arrangement the platform is only a chassis.
        ...(Object.keys(mcpAll).length ? { mcpServers: mcpAll } : {}),
        ...(body.cwd ? { cwd: body.cwd } : { cwd: WORK_DIR }),
        ...(body.system ? { systemPrompt: { type: 'preset', preset: 'claude_code', append: body.system } } : {}),
        env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: token },
      },
    });

    let model = null;
    for await (const m of iter) {
      if (m.type === 'assistant') {
        model = m.message?.model ?? model;
        for (const b of m.message?.content ?? []) {
          if (b.type === 'text') send({ type: 'text', text: b.text });
          else if (b.type === 'thinking') send({ type: 'thinking', text: b.thinking });
          // Tool work is emitted outward as an EVENT rather than as silence:
          // otherwise a long stretch looks like a hang and the platform has
          // nothing to show. The tool input is not forwarded in full — there can
          // be secrets and megabytes in it; only the name and a short caption.
          else if (b.type === 'tool_use') send({ type: 'tool', name: b.name, brief: briefOf(b.input) });
        }
        const u = m.message?.usage;
        if (u) {
          send({
            type: 'usage',
            inputTokens: u.input_tokens ?? 0,
            outputTokens: u.output_tokens ?? 0,
            cacheReadTokens: u.cache_read_input_tokens,
            cacheWriteTokens: u.cache_creation_input_tokens,
          });
        }
      }
    }
    send({ type: 'done', model, tookMs: Date.now() - started });
  } catch (e) {
    // The error is returned IN THE STREAM rather than as silence: a stream cut
    // off without a reason reads as "the model went quiet", and the investigation
    // starts from nothing.
    const message = explainExit(e, sessionId, cwd);
    log(`🔴 call failed: ${message}`);
    send({ type: 'error', message: message.slice(0, 500) });
  } finally {
    res.end();
  }
});

server.listen(PORT, HOST, () => {
  log(`listening on ${HOST}:${PORT}; token from ${TOKEN_FILE}; engine — the official SDK`);
  if (!readToken()) log('🔴 warning: the token is NOT readable right now, requests will be rejected');
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log(`${sig} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
