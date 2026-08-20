# oom-watch — a watchdog for kills that leave no trace you will look at

Your agent dies. `systemctl status` says `failed`. The logs of the agent itself end mid-sentence.
Nothing anywhere says "the memory limit killed it", so you go looking for a bug in your code.

That is what a cgroup OOM kill looks like from the outside, and every fleet running agents under
systemd meets it eventually — a model update, a longer context, one more concurrent session, and
the unit that fit inside `MemoryMax` yesterday does not fit today.

`oom-watch` is a one-minute timer that reads the kernel journal, notices these kills, and says so
out loud — into the journal always, and into an alert channel of your choice if you have one.

**Not a harness plugin.** A machine service, useful to anything running under systemd.

## The trap this package exists for

The obvious way to write this watchdog is to read `memory.events`:

```
$ cat /sys/fs/cgroup/system.slice/my-agent.service/memory.events
oom_kill 1
```

**That counter is reset when the unit restarts**, and a unit that just got OOM-killed is exactly a
unit that is about to restart. Measured on our machine, same unit, same limit:

| | cgroup inode | `oom_kill` |
|---|---|---|
| after the kill | 888101 | 1 |
| after `systemctl restart` | 888318 | **0** |

The cgroup is destroyed and recreated on restart, and the kernel's per-cgroup counters go with it.
A watchdog polling that counter every minute misses any kill followed by a restart inside its own
polling interval — that is, the normal case. It reports "all clear" and it is wrong.

The kernel journal does not have this problem: the lines survive the cgroup that produced them.
So `oom-watch` reads `journalctl -k` from a saved cursor and pairs the two lines the kernel emits:

```
oom-kill:constraint=CONSTRAINT_MEMCG,...,oom_memcg=/system.slice/my-agent.service,task=python3,...
Memory cgroup out of memory: Killed process 1357889 (python3) total-vm:84592kB, anon-rss:65280kB
```

## What it says

```
🔴 Убийство по памяти на host01
Служба: my-agent.service — «Agent runtime» (от имени agent)
Убит процесс: python3 (номер 1460083), занимал 23.8 МБ
Предел службы: 24.0 МБ — выбран на 99%
Дальше: перезапустится сама (Restart=always)
Время: 20.08.2026 23:00:09
```

*(Real output from the acceptance run, with the host and unit names replaced.)*

The alert answers "so what?", not just "who died": which service that unit is in human terms, who
it ran as, **how close to the ceiling** it was, and whether it comes back by itself. "Killed
process python3" alone tells the reader nothing they can act on. Messages are in Russian because
that is what our operators read — one function, `build_alert`, holds every string.

## The second trap: one kill, several kernel lines

The kernel does not print a kill as one line. The unit is in one line, the numbers are in another:

```
oom-kill:constraint=CONSTRAINT_MEMCG,...,oom_memcg=/system.slice/alpha.service,task=python3,pid=1001
Memory cgroup out of memory: Killed process 1001 (python3) total-vm:99999kB, anon-rss:16128kB
```

The obvious way to pair them is "remember the last `oom-kill:` line, attach it to the next
`Killed process` line". That works until two kills land close together, or until the journal drops
a line — and after a kill the kernel dumps a process table, so `printk: N messages suppressed` is
the normal case, not an exotic one. Then the pairing slides by one and the watchdog reports **a
real unit with another unit's numbers**. Measured, same input, one `oom-kill:` line missing:

| | reported unit | reported anon-rss | truth |
|---|---|---|---|
| pairing by order | `beta.service` | 16128 kB | 16128 kB belongs to pid 1001, which is **not** beta |
| pairing by pid | *not identified* | 16128 kB | correct: the line that named the unit is gone |

We shipped the by-order version and had to withdraw it: it announced a kill in a gateway that had
not restarted since noon, with 100 kB of RSS next to real kills of 64 MB.

Both lines carry the pid, so `oom-watch` pairs them **by pid**. When they do not pair, the alert
says *unidentified*, and the nearest unit is never substituted — an alert that names the wrong
service sends you debugging a process that is alive and well.

Two consequences worth knowing:

- an unidentified kill **always** alerts, even when `OOM_WATCH_UNITS` is set. A parser defect must
  not turn into silence;
- the unit name is taken as the **last** segment of the cgroup path, not the first one after
  `/system.slice/`. Template and grouped units live deeper —
  `/system.slice/system-foo.slice/foo@bar.service` — and matching the first segment silently
  dropped them.

## Install

```bash
sudo install -m 755 bin/oom-watch /usr/local/bin/oom-watch
sudo cp systemd/oom-watch.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now oom-watch.timer
```

Requires `python3` and systemd. Runs as root: `journalctl -k` is not readable otherwise, and a
watchdog that cannot read its own signal fails silently.

The first run does not shout about the past — it records the current journal position and exits.

## Configuration

Environment variables, set them in the unit:

| | |
|---|---|
| `OOM_WATCH_UNITS` | Units to alert on, space separated. **Empty (default) = alert on any.** |
| `OOM_WATCH_ALERT` | Executable that receives the message **on stdin** (it is multi-line). Empty = journal only. |
| `OOM_WATCH_STATE` | State directory, default `/var/lib/oom-watch`. |

⚠️ Think twice before filling `OOM_WATCH_UNITS`. A unit forgotten in that list is silence exactly
where you wanted an alarm, and nothing will remind you. The empty default is louder and safer.

## Verify it, do not trust it

A watchdog nobody has fired is a watchdog you hope works. Fire it on purpose:

```bash
# a disposable unit with a limit it cannot fit into
sudo tee /etc/systemd/system/oom-probe.service >/dev/null <<'UNIT'
[Unit]
Description=TEMP OOM probe
[Service]
Type=simple
ExecStart=/usr/bin/python3 -c "x=[bytearray(4*1024*1024) for _ in iter(int,1)]"
MemoryMax=64M
MemorySwapMax=0
Restart=no
UNIT
sudo systemctl daemon-reload && sudo systemctl start oom-probe.service
sleep 15
sudo /usr/local/bin/oom-watch            # must print a 🔴 OOM-KILL line for oom-probe.service
sudo systemctl stop oom-probe.service
sudo rm /etc/systemd/system/oom-probe.service && sudo systemctl daemon-reload
```

Fire **two at once**, in different units, if you change the parsing. A single kill passes even
with by-order pairing; the defect only shows when two kills land together or a line is dropped:

```bash
# same probe twice, MemoryMax=16M and 24M, started in one command
sudo systemctl start oom-probe-a.service oom-probe-b.service
sleep 6 && sudo /usr/local/bin/oom-watch
# each alert must carry ITS OWN unit and ITS OWN numbers: 16M unit ~15.8 MB, 24M unit ~23.8 MB
```

🔴 `MemorySwapMax=0` is not decoration. `MemoryMax` alone does **not** cap swap: a probe with a
64 MB limit and swap available pushed 4.7 GB into the host's swap, hit its limit 19,585 times and
was **never killed** — `oom_kill` stayed 0 while the machine suffered. Without that line the probe
proves nothing, and you may notice the swap before you notice the test.

## Where this stops

- **It reports kills, not suffocation.** The case above — a unit permanently at its ceiling,
  reclaiming and stalling but never killed — produces no kernel line and no alert here. Watch the
  `max` counter in `memory.events` for that; it is a different problem with a different signal.
- **Memory-cgroup kills only.** A global out-of-memory event (`CONSTRAINT_NONE`) and the userspace
  `systemd-oomd` are deliberately not matched: different cause, different fix, different message.
- **One minute of blindness by design.** The timer is not a supervisor. If you need the unit back
  up, that is `Restart=` in the unit — this only makes sure you learn why it went down.
- **It never restarts, throttles or repairs anything.** A watchdog that fixes things quietly turns
  a visible failure into an invisible one, which is the failure this package exists to prevent.

MIT.
