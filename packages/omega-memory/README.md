# omega-memory — long-term memory for harness agents

Your agents remember decisions, lessons and agreements between sessions, and search them by meaning
rather than by exact words. Everything stays on your machine.

Like [`voice-stack`](../voice-stack), this is **not a harness plugin** — it is a machine service.
The harness reaches it over MCP on the loopback, using the MCP client that ships with the product.

We publish our part only: the service account model, the systemd unit, the wiring that actually
reaches the agent, and the traps. The memory engine itself
([OMEGA](https://omegamax.co), core is open source) is installed from its own upstream.

## Install

**1. A dedicated service account, before anything else.**

```bash
sudo useradd --system --home-dir /var/lib/omega --create-home --shell /usr/sbin/nologin omega
```

Memory is shared by every agent on the machine. Start the service under one agent's account and the
database ends up in that agent's home directory with `700` — formally a system service, in practice
the private property of whoever happens to own it. We made exactly this mistake on the first pass:
the service ran, `/health` answered, and the second agent could not reach memory at all.

**2. The engine, in its own virtual environment.**

```bash
python3 -m venv /opt/omega/venv
/opt/omega/venv/bin/pip install -U "omega-memory[server]"
```

Do not pin the version from any document, including this one — take whatever the index serves and
record what actually landed. Any number written down goes stale.

**3. The embedding model — and the step that is not optional.**

At the time of writing, the default model download is broken: the weights file downloads, the
tokenizer and config files 404, and setup finishes "with 2 errors" while the model file sits on
disk. It looks like a near-success. Fetch the model explicitly instead:

```bash
/opt/omega/venv/bin/omega setup --download-model
```

Verify you got a real model, not a fallback: the doctor command should report the model name and
384-dimension embeddings, not "pseudo". A server that silently switches to pseudo-embeddings still
answers every query — it just stops searching by meaning, which is the entire point.

**4. The unit** from `systemd/`, then:

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now omega-memory
```

## Wiring it into an agent — the part that costs an hour

Add the MCP client row to the **agent preset** (`agent.cordis.yml`), not to the profile patch layer:

```yaml
- id: mcp-omega
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: omega
    transport: streamable-http
    url: http://127.0.0.1:8377/mcp
    failOnStartupError: false
```

In the `web` profile, common-plane tools are disabled on purpose and the toolset comes from the
preset. A row in the profile layer composes without a single error, is listed as mounted, and never
reaches the agent. Also: the preset is read when a **session is created** — editing the file changes
nothing in a running session.

🔴 **If your agent's thinking is done by an external engine** (the harness acting as a chassis while
some other agent runtime does the reasoning and runs the tools), then the harness-side MCP client is
useless: the agent only ever sees its own engine's toolset. Attach the memory server to **that
engine** instead. Before wiring anything, establish who actually executes the tools in your setup.

## Per-agent roots

Give every agent its own root (`entity_id`) and write it into the agent's persona: "your root is X,
pass it on every store and every search". Without it everything lands in one unsorted pile.

Roots are a filing system, not a security boundary — see below.

## Things worth knowing before you rely on this

**The database file is not group-readable, and does not need to be.** The package tightens the file
mode on new connections, so any `chmod` you add in the unit survives until the first request. Do not
fight it: agents talk to memory over the network, the service reads the file. We removed our own
`chmod` patch for exactly this reason — a mechanism that works "usually" is worse than none, because
people build on it.

**The real boundary is the port, not file permissions.** Whoever on the machine can reach the
loopback port gets the same data the service serves. Plan access with that in mind: an untrusted
agent with a shell on the same machine is inside the boundary regardless of file modes.

**`--dry-run` on setup is not dry** — it downloads the model, creates directories and installs
hooks.

**A service that answers `/health` has proved that a process is alive**, nothing more. Acceptance is
a live round trip: store a record, then find it by search.

## Acceptance

1. `systemctl is-active` and `is-enabled` — the second one is what survives a reboot;
2. `/health` answers;
3. store → search finds it, from the agent's own tools, not from a shell workaround;
4. the service runs under the service account, not under an agent (`systemctl show … -p User`);
5. the model is real: doctor reports a model name and 384 dimensions.

MIT for our part. The memory engine has its own license — check it upstream.
