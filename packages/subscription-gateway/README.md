# subscription-gateway — run the platform on a subscription instead of per-token billing

A system service: it takes a request from the platform (or from any other host),
drives the model loop through the vendor's official SDK on **subscription**
access, and streams the answer back.

The subscription token lives in **one** place on the machine. Agents do not know
it — they know the address of an entry point.

---

## What it gives you

- the model loop runs on a subscription instead of per-token billing;
- the secret does not multiply across the machine: one file, group permissions,
  rotation in one place;
- a new agent is connected by a line of configuration, without copying the secret;
- platform tools can be mixed into the model's tool set through the bridge (see
  `dsh-tool-bridge`).

---

## When you do NOT need this

**If you have an ordinary API key, you do not need it at all.** The platform can
reach the provider by itself, and an extra process between it and the vendor only
adds places where something can go quiet.

The gateway is for the case where access is by **subscription** and the host knows
nothing about that kind of access.

**And one more case where it is not needed: if you have a single agent.** The
whole point of moving the token out is that there are several agents. With one, it
is simpler to keep the secret next to it.

---

## 🔴 The main thing to know before installing: whose hands the agent works with

The SDK is **agentic**. It drives the loop itself and itself runs the shell,
files, search and web.

So the agent's "hands" are the user the **gateway process** runs as, not the user
the platform runs as. Everything else follows from that:

- the service is started as **one instance per agent**
  (`gateway@<agent name>.service`), under that agent's own user name and on its
  own port;
- a shared system user does not fit here structurally: it has no access to the
  agent's home, and every agent on the machine would act as one and the same
  person;
- **any right you give to the agent's hands is given to THIS unit.** The
  platform's rights are beside the point.

That last one is not theory. We lost a work session to it: we gave the agent the
right to read the system journal, wrote it into the platform's unit, verified it
against the platform's live process — everything checked out, and the agent's
refusal stayed. **A right method applied to the wrong object yields confidence,
not truth.** What must be checked is the process that executes the commands:

```bash
grep ^Groups: /proc/$(systemctl show -p MainPID --value gateway@<agent>.service)/status
```

🔴 `id` and `sudo -u <agent>` do **not answer this question**: they spawn a NEW
process, which takes its groups from the system file, and will show what you want
rather than what is. A live process fixes its group set when it starts.

---

## Installation

### 0. The code and its dependencies

```bash
sudo mkdir -p /opt/subscription-gateway
cd /opt/subscription-gateway
npm install subscription-gateway            # or copy this package here
```

The unit template below starts `/opt/subscription-gateway/gateway.mjs`. Put the
code somewhere else and you have three places to change, all named in the
comment at the top of the unit file.

**Sign of success:** `node -e "import('./gateway.mjs')"` exits without
`ERR_MODULE_NOT_FOUND`. The two runtime dependencies — the vendor agent SDK and
the schema library — must resolve from the directory the unit starts the file
in; `NODE_PATH` does **not** help here, ES modules ignore it.

### 1. The token in one place, permissions by group

```bash
sudo groupadd -r gateway-token
sudo install -d -m 750 -o root -g gateway-token /etc/subscription-gateway
sudo install -m 640 -o root -g gateway-token /dev/null /etc/subscription-gateway/token
# put the subscription token into the file
```

**Sign of success:** the file is readable by a member of the group and not
readable by anyone else.

🔴 Isolation of the secret is real only against agents **without** `sudo`. An
agent with `sudo` will read the file anyway — do not imagine a protection that is
not there.

### 2. The unit template

Install `systemd/gateway@.service` (in this package) and create an instance:

```bash
sudo systemctl enable --now gateway@<agent>.service
```

**Sign of success:**

```bash
curl -s http://127.0.0.1:<port>/health
{"ok":true,"token":"present","sdk":true}
```

🔴 Health means the **presence of the secret**, not "the process is alive".
Without a token the service is up and useless — that must be visible from
outside, which is why it answers 503 rather than 200.

### 3. The instance environment

`/etc/subscription-gateway/instance-<agent>.env`:

```
GATEWAY_PORT=<instance port>
GATEWAY_WORK_DIR=/home/<agent>/workspace
GATEWAY_MAX_TURNS=120
GATEWAY_MCP={"<server name>":{"type":"http","url":"http://127.0.0.1:PORT/mcp"}}
```

| variable | what it sets | default |
|---|---|---|
| `GATEWAY_PORT` | loopback port | 8788 |
| `GATEWAY_TOKEN_FILE` | token file | set by the unit |
| `GATEWAY_WORK_DIR` | working directory for the tools | `$HOME`, else `/tmp` |
| `GATEWAY_MAX_TURNS` | upper turn limit within one request | 60 |
| `GATEWAY_MCP` | external MCP servers, JSON | empty (not an error) |

🔴 **Raise `GATEWAY_MAX_TURNS` deliberately.** We hit it on the 61st turn of a
long task, and the SDK reported it as `exited with code N` — that is, a code
without a reason. The gateway now digs the real reason out of the transcript and
prints `the agent hit the turn limit: reached <N> against a threshold of <M>`, and
if it does not find it, says "reason not established" instead of a plausible
invention.

### 4. Check that the subscription answers

Send a short request to `POST /v1/agent-stream` and wait for the model's answer.

**Sign of success:** a stream with text arrived. **Sign of trouble:** every call
is rejected by a rate limit while the subscription is demonstrably healthy — see
the next section, that is not about your quota.

---

## 🔴 Why the vendor SDK inside, and not hand-rolled HTTP

The first version assembled the API request by hand: subscription token, the
required beta flags pulled out of the client binary. **Authorisation worked** — a
wrong token got 401, ours got 429 — but **every** call was rejected by a rate
limit while the subscription was entirely healthy: three agents were working on it
at that very moment.

We went through and discarded four hypotheses: client headers, model binding,
token expiry, the set of beta flags. The truth was something else — **the raw path
is simply not served to subscription access**. Same token, same machine, same
network egress: the SDK answers in four seconds, the hand-rolled request is
refused.

The general conclusion, and it is worth more than the case itself: **do not
reinvent the vendor's protocol.** Vendor code knows subtleties that are not in the
documentation, and it will survive them changing. And a refusal that looks like
"you are out of quota" may mean "you are knocking at the wrong door".

---

## What does not work, and will not

- **it is never exposed outward.** It listens on loopback only. This is access to
  the subscription without a password; moving it to an external address is the
  same as publishing the token;
- **no confirmations are requested** (`bypassPermissions`): there is nobody to
  ask, the far end is not a human but the host. The real boundary is the rights of
  the instance user, and they are set in systemd, not here;
- **the unit sandbox is deliberately not tightened**: the agent needs its own
  files and home, and against an agent with `sudo` the unit's restrictions are no
  boundary anyway;
- **the gateway does not know what tools it is handing over.** It receives their
  description from the bridge and proxies the calls back. That is on purpose: the
  next agent with a different set connects without editing the gateway.

---

## The schema adapter: a place where things are lost silently

Tools arriving from the host are described by a JSON Schema, and the SDK expects a
schema of its own kind. `jsonschema-to-zod.mjs` translates between them.

🔴 **An unfamiliar shape is a silent loss, not a refusal.** The first version did
not know the shape "string OR object" (`anyOf`/`oneOf`) and returned "anything" for
it. The tool still registered, still looked healthy — and failed at call time,
while parsing arguments.

Test the adapter **against the real schemas of your platform**, not invented ones:

```bash
node test-schema-adapter.mjs
```

The bench in this package takes the schemas from a file generated by the platform
itself and checks that both `anyOf` branches pass while a foreign type does **not**.
The second half matters more than the first: a schema that has degenerated into
"anything" lets everything through and thereby hides the error.

---

## Acceptance by your own hand

1. `curl /health` → `{"ok":true,"token":"present","sdk":true}`. Checks that the
   secret is readable.
2. `grep ^Groups: /proc/<MainPID>/status` → the required groups **on the live
   process**. Checks the rights of the agent's hands, and only this method answers
   that question.
3. A short request to `/v1/agent-stream` → the model answered. Checks the
   subscription itself.
4. `node test-schema-adapter.mjs` → everything green. Checks the schema adapter.
5. If the bridge is installed alongside: ask the model to call a platform tool and
   find the call in the host log. The model's answer is not a sign.

🔴 **All five are usable as a run-through after an upgrade** — of the vendor SDK
and of the platform alike. None of these desynchronisations fails with an error:
the schema degenerates into "anything", the group is lost on restart, the token
stays where it was but the path to it changes. All of it looks like healthy work.

---

## License

MIT.
