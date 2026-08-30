# a2a-bus — let agents on one machine talk to each other, without giving up isolation

Several agents live on one machine. Each runs as its **own system user** — that is the isolation:
an agent cannot read another one's files, memory, or conversations.

Now they need to write to each other directly, on this machine, and the owner needs to see both
sides of every exchange in his own chat with each agent.

This is **not a harness plugin**. It is a machine service: a spool directory per agent, a postman
that runs from `root`, and one command to enroll a new agent.

## The problem, stated honestly

The obvious design is a shared directory everyone can write to. It fails in a way that is not
obvious: to *deliver* a letter the receiver must read a file the sender owns, and file permissions
are granted by the **owner** of the file, not by the directory. So either the sender keeps the
letter readable — and then every member of the group can read it — or the receiver cannot open it
at all.

Our answer: **each agent owns a mailbox nobody else can list.** Senders may drop a file in
(`--wx`, write and traverse, no read), and cannot see what else is there. A postman running as
`root` then does the one thing that requires root and nothing else: it **changes the owner** of the
letter to the receiver. After that the letter is the receiver's own file, and the sender has lost
access to it.

```
/var/spool/a2a/<agent>     drwx-wx--T   <agent>:a2a-post
                           owner: read+write     sender: drop only, no listing
```

## What is here

| File | What it is |
|---|---|
| `sbin/a2a-pochtalon.py` | the postman: transfers ownership, enforces size and count limits, notifies the owner |
| `sbin/a2a-zavesti` | enroll an agent into the bus in one command — mailbox and group in a single step, with verification |
| `sbin/a2a-proba-novichka` | acceptance probe: does a letter arrive, is a foreign mailbox refused, does the round trip work |
| `systemd/` | the service and a timer that runs it every 5 seconds |

Everything is configured through environment variables (`A2A_KOREN`, `A2A_TELL_BIN`,
`A2A_REESTR_BIN`, and the limits). Nothing about our machines is baked in.

## What this does NOT do

- **It does not deliver the letter into the agent's turn.** That is your channel module's job; the
  bus only puts the file where the receiver can read it.
- **It does not read letter contents.** The postman never opens the body.
- **It does not make the mailbox a private place.** Permissions on a *file* are granted by its
  owner: any file the owner himself makes world-readable will be readable by everyone in the group.
  The bus protects you from other people's curiosity, not from your own carelessness.
- **The sender name in the filename is a hint, not a credential.** Forging it is trivial. Real
  provenance is what the postman saw — the file's owner before transfer. Never grant rights based
  on that name.
- It is not a security boundary against a hostile local root.

## Install

There is nothing to `npm install` here: this lives in the system, and a package manager would put
it where it cannot run — while looking like a successful install. Copy it by hand:

```sh
install -m 0755 sbin/a2a-pochtalon.py sbin/a2a-zavesti sbin/a2a-proba-novichka /usr/local/sbin/
install -m 0644 systemd/a2a-pochtalon.{service,timer} /etc/systemd/system/
groupadd -f a2a-post
install -d -m 0755 -o root -g root /var/spool/a2a
systemctl daemon-reload && systemctl enable --now a2a-pochtalon.timer
a2a-zavesti <agent-system-user>          # per agent
a2a-proba-novichka <agent-system-user>   # prove it, don't assume it
```

## Three traps we walked into, so you don't have to

**`chmod` with a numeric mode keeps the directory's setgid bit.** `chmod 1730` over `2730` yields
`3730` — and returns success. We stepped on this twice; anyone following a written instruction
would step on it every time. That is why enrollment is one command and not a list of steps:
**if a procedure takes more than three steps, simplify the mechanism instead of writing a longer
instruction.** A longer instruction just moves the trap onto the reader.

**An acceptance check that reads one item out of N proves nothing.** Ours took the first file it
found, got a correct one, and passed a planted broken letter. Count what you checked and say the
number out loud: "read 1 of 5" is honest, "OK" is not.

**A check can be blind in the tester's hands and healthy in production.** Our health check ran as
`root` in production — green — and as an ordinary user on the test bench — red. Name the subject
explicitly (`id -u`, then `sudo -n` when needed) instead of assuming whose hands run it.

## License

MIT, same as the rest of this repository.
