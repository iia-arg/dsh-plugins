# voice-stack — local speech recognition for your agent

Your agent hears voice messages without sending a single byte of audio to somebody else's cloud.
Recognition runs on the machine's GPU, the model stays resident in memory, and a short phrase comes
back in fractions of a second.

This is **not a harness plugin**. It is a machine service with a one-line contract:

```
<command> <audio-file> <language|auto>   →   transcript on stdout
```

Anything that can run a command can use it. Our [`telegram-multiagent`](../telegram-multiagent) plugin
calls it through its `transcribeCommand` setting; a different channel, a cron job or a shell script
works exactly the same way.

## What is here, and what is not

**Here — our part:** the wrapper that ties the chain together, the systemd units, the fallback
logic, and the ordering knowledge below.

**Not here — other people's software.** No binaries, no models, no vendored source. The install
steps fetch each component from its own upstream. That is deliberate: republishing someone else's
artifacts drags their licenses into your repository and their bugs into your users.

| Component | Upstream | License |
|---|---|---|
| whisper.cpp (recognition engine) | `ggml-org/whisper.cpp` | MIT |
| Whisper model weights (`ggml-large-v3`) | conversion of OpenAI Whisper | MIT |
| Russian transcript corrector (optional) | `ai-forever/sage-fredt5-distilled-95m` | MIT |
| This package (wrappers, units, docs) | you are reading it | MIT |

## Install, in the order that matters

The order is not cosmetic — each step's check is what makes the next one meaningful.

**0. Create a dedicated service account first.**

```bash
sudo useradd --system --home-dir /var/lib/voicesvc --create-home --shell /usr/sbin/nologin voicesvc
```

Why first: moving a working stack later costs more than installing it right. Why at all:
recognition is the one component that eats untrusted input — a stranger's voice note reaches it
before any allow-list. A compromise there should land in an empty service account, not in your own.

⚠️ The name `voice` is usually **already taken** by a stock system group; `useradd voice` fails with
`group voice exists` and exit code 9. Pick another name.

**1. Prove the GPU is reachable** before building anything. If you cannot, you will silently build
a CPU stack and get seconds instead of fractions of a second — and it will look like it works.

**2. Build the engine against your GPU backend and fetch the model.** Put both under a directory the
service owns (`/opt/whisper.cpp` in our units).

**3. Install the units** from `systemd/`, adjusting paths if you chose different ones:

```bash
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now whisper-warm
```

**4. Install the wrappers** from `bin/` into a directory on `PATH`, and point your channel at
`transcribe-local-shared`.

**5. Optional: the Russian corrector.** Only worth it if your users dictate Russian; it fixes
punctuation and casing, and it needs its model and glossary inside the service's own directory.

## Configuration

The wrappers read these, all optional, all with sane defaults:

| Variable | Meaning |
|---|---|
| `WHISPER_HOME` | Engine and model location (default `/opt/whisper.cpp`) |
| `SAGE_HOME` | Corrector location (default `/opt/sage-corrector`) |
| `DENOISE_HOME` | Optional denoiser location |
| `VOICE_ARCHIVE_DIR` | If set, incoming audio is kept here; empty disables archiving |

## Things that look like success and are not

**A recognition service that answers is not a recognition service that recognises.** Check the
transcript, not the status line. Our own acceptance run returned an empty string and a fallback
warning — because the probe was a sine tone, not speech.

**Device access is not granted by group membership added after the fact.** A running service keeps
the group set it was created with. That is why the units carry `SupplementaryGroups=video render`
as an explicit line.

**A service that reads files from a person's home directory works only until it does not.** When we
moved ours to a service account it broke instantly, and correctly. Keep code, models and glossaries
inside the service's own directory — and check the wrappers too, not just the unit.

**Robot-synthesised speech transcribes badly.** If you test the chain with a speech synthesiser,
judge by "text in the right language appeared", not by wording.

**The engine's cold path can be missing while the warm one works.** Ours fell back to a binary that
had never been built. The fallback branch deserves its own test, or it will fail on the first day
the warm server is down.

## Acceptance

1. transcript from the command line on a real speech file → sensible text;
2. timing: fractions of a second on a short phrase, not seconds;
3. a voice message through your channel → the agent answers on the content;
4. `systemctl show <unit> -p User --value` → the service account, not a person;
5. `sudo grep ^Groups /proc/<pid>/status` → the device groups are actually there.

Points 4 and 5 look pedantic until you find out that the file said one thing and the live process
another.

MIT.
