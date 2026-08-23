# Design notes: the tool bridge, self-waking, the subscription route

A companion to the package READMEs. They say how to install; this says how it is
built, what the evidence is, and where the boundaries are. The most important
part of this document is Part IV: a reader can work out the structure from the
code, but the places where a mechanism **stays silent instead of refusing** are
never worked out from code — they cost an evening.

Module names are neutral and the same as in the READMEs: `dsh-tool-bridge`,
`llm-subscription` (the provider adapter), `subscription-gateway`.

Every claim below is sorted into one of three grades — measured, read from the
code, taken on somebody else's word. The split is explicit, and the summary is in
Part V.

> Against the original outline one section was added — §35, on a separate remark
> from our auditor. Part V shifted to §36.

---

# Part I. The tool bridge

## 10. Why the tools do not arrive

This is an established fact, not a guess, and it was taken from two independent
readings.

First: **zero `tool/*` events** in the platform log for the entire time the agent
had been working on the subscription route. The platform would have written them
honestly if the calls went through it.

Second: the actual tool calls exist only in the engine transcript — where all of
them are visible, including ones the platform does not have at all.

The cause is structural, not a matter of configuration: the platform has an MCP
**client** but no **server** of its own. The loop is driven by the engine, and the
model's tool set is the engine's own. Platform plugins register tools at home, and
the model does not see them: not because they are forbidden, but because there is
nobody to serve them.

Hence an important consequence, worth keeping in mind for the rest of this
document: **delivery is what is lost, not execution.** The platform tools are
alive and working, they simply have no door. So the right cure is to build a
door, not to rewrite the tools. That is exactly what the bridge does; where it
can, it does not even repeat their bodies (see §14).

## 11. Structure

Three parts in three processes.

**The platform plugin** owns a loopback entry point and executes calls. Execution
is here because the state is here: the goal and job services, the registry of
live agents, the session logs. Moving execution into the gateway would mean
dragging state across a wire.

**The provider adapter** adds one key to the body of every request to the model:
the bridge descriptor with a one-time ticket. Without the bridge the field is not
added at all, and the old behaviour is preserved byte for byte.

**The gateway** builds an MCP server out of the descriptor it receives, hands it
to the engine, and proxies calls back over loopback.

🔴 **The gateway does not know what tools it is carrying.** Names, descriptions
and schemas arrive from the other side; there is only transport here. This is not
aesthetics but a condition of generality: the next agent with a different tool set
connects without a single edit to the gateway. If you catch yourself adding
domain knowledge to the gateway, you are building a patch for one case.

## 12. The door: a one-time ticket instead of identity on the wire

The first revision of the bridge kept a long-lived shared secret, and the agent's
identity travelled as a separate request field. That design worked and was wrong:
**the caller asserted the identity**. Whoever reached the door and knew the secret
could call themselves anyone.

Now there is no identity on the wire at all. The bridge issues a **one-time
ticket** — a random opaque string — and looks the identity up by it in its own
table. The gateway carries the ticket and knows nothing about agents. The
difference is fundamental: the identity used to be asserted by the caller, now it
is issued by the party that knows it. The ticket doubles as the secret, so there
is no separate door secret any more — one field instead of two.

The boundaries, without which the protection would turn into its own opposite:

* **The ticket is bound to a pair (identity, turn), not to an agent.** The first
  revision kept one ticket per identity and revoked the previous one when issuing
  a new one. Concurrent turns of one agent do happen — an interrupted turn lives on
  for minutes alongside a new one — and back then a new turn silently took the
  tools away from the live earlier one.
* **One turn can have several tickets.** Within a single turn the platform
  approaches the provider more than once (the turn itself and, for example,
  generating the session header), and each request asks for its own bridge
  descriptor. While there was one ticket, the second request revoked the first
  one's — which had already gone to the engine, so the model got "ticket unknown"
  at the door in the middle of a live turn. One-time-ness is held at the level of
  the **turn**: its end revokes every ticket at once.
* **An upper lifetime, as a number.** The platform writes the end of a turn both
  on a normal finish and on an abort, but if the process dies before that write
  there is no end at all. Without a deadline a "one-time" ticket would degenerate
  into "lives as long as the process", that is, into a long-lived password.
* **Root agents only.** A platform subagent would receive its own ticket with its
  own identity — that is, its own goal-creation counter, and the ceiling would be
  bypassed by way of the boundary.

🔴 **Why the ticket never reaches a command line — and why that is decisive.** The
MCP server transport chosen is in-process (`sdk`), not `stdio`. Everything the SDK
passes to a child process goes as a command-line argument, and `/proc/<pid>/cmdline`
is readable by **any** user of the machine — the mode there is `444`. Measured with
a live observer: with in-process transport, 0 occurrences of the ticket across 275
inspected processes. The ticket lives in the memory of two processes and in the
request body over loopback; it is never written to the log, to disk or to the
environment.

What the ticket does not protect against: reading the process memory, and anyone
with root. It has no OS rights; all that guards it is that it is written down
nowhere.

## 13. Parity: the schemas are not written by hand

The tool names, descriptions and parameter schemas in the bridge are **not written
by hand**. They live in two generated files, and they are generated by **executing**
the platform packages themselves: the generator feeds the package a stand-in
context and records what the package registers on the native route.

That is what makes "character for character" provable here rather than asserted. A
divergence is possible only if the packages themselves diverge — and then
regenerating the file catches it, not a reader of the code.

Two files, not one, because the subjects differ: one is parity with the tool set of
an agent on the native loop, the other is parity with the schedule package. The word
"parity" is verified by checking against live packages, and merging two checks into
one means losing both.

Exactly one thing remains ours in the bridge — **execution**. It has to be ours: on
the native route a tool calls a service inside its own process, whereas here the
call arrives from another route and must cross the platform boundary.

## 14. Execution: three ways, and why there are three

| way | for what | why |
|---|---|---|
| the platform's remote boundary | every **mutating** goal operation | identity resolution, argument and result validation are done by the boundary itself; the bridge neither duplicates nor weakens them |
| a direct service call | where there is **no boundary at all** | not every method is exposed: reading goals and some operations are not. The isolation rests not on a check of ours but on the service itself: it takes a live agent and works only with its state |
| the native tool body | schedule | the schedule tools are registered **directly on the live agent** — only delivery was lost. The bridge delivers the call to their body and repeats neither policy nor checks |

The "where there is no boundary" check was not done by eye but against the
decorators in the service sources, and it is confirmed by a live refusal: calling
an unexposed method answers "no active Remote method exports this endpoint". There
is exactly one mutating operation that bypasses the boundary in the bridge, and it
is named in the code — the corresponding method is not exposed, so the check the
boundary performs in the other cases is repeated here by the host.

🔴 **Why not through the tool registry — the least obvious place in the whole bridge.**

`registry.execute()` suggests itself: it is the supported path and it can do
everything. But it runs the call through the permission-request waterfall — that
is, through asking the user. On this layout there is no answerer at all, and the
policy fails **closed**.

Then it gets interesting. The tool would refuse **always**, and it would look like
"the schedule is broken": the model calls, gets refused, starts looking for a way
around. The cause would be in the permission subsystem, and it would be hunted in
the schedule. We only avoided this because we read the waterfall before calling it.

Besides, the registry materialises the result into content blocks, while the bridge
needs JSON. And the platform already wraps the tool body itself at registration:
schema validation of arguments, a typed refusal and the agent-identity check are all
inside, and the bridge repeats none of it.

**What we pay, stated as a list:** the call time limit, the registry's concurrency
queue and cancellation by the turn signal. For the three schedule tools that is
nothing — they declare no time limit and their bodies are serialised by their own
transaction — while cancellation the bridge physically cannot provide: loopback HTTP
knows nothing of the turn signal. The signal passed is non-cancellable and honest: a
fake "already cancelled" would turn every call into a silent refusal.

**A missing definition is blindness, not a refusal.** If the tool is not in the
agent's registry, then the layer is not mounted or the agent is the wrong one. The
bridge shouts about it on its own 🔴 line: the model reads a silent "not found" as
"nothing to schedule", and the defect would be hunted in the schedule rather than in
the mounting.

## 15. Turn authority

The identity in a call answers "whose agent", not "by what right". Engine subagents
arrive with the root's identity, and our MCP server cannot be taken away from them —
verified. So what must be distinguished is not the caller but the **authority of the
turn**: was it opened by a human, or by a round of the current goal?

🔴 **This reproduces somebody else's policy, it is not our own.** It is copied
verbatim from the platform's goal package — together with its **boundaries**, not
only its prohibitions: where the original does not require authority, it is not
required here either.

It is easy to err on the side of strictness here, and we did. The first revision
applied the "do not give up before N rounds" threshold **always**, whereas in the
original it applies only under round authority: the threshold guards against an
agent giving up on itself at the first self-wake, and nothing else. In a human turn
the block goes through immediately. The result of home-grown tightening: an agent
whose human had directly asked "so how is it going" could not answer "I am stuck".

**Home-grown tightening breaks work as much as loosening does.** The only difference
is that loosening gets hunted, while tightening looks like caution.

What cannot be reproduced has already been said in the README: the initiator check is
unavailable in the context of an HTTP handler, and so it is written as "if visible and
not ours — refuse".

A small detail with large consequences: in the single place where identity reaches
the wire to the platform boundary, **key order matters**. The identity is added after
the arguments; in the opposite order a request builder that passed the model's
arguments through would silently overwrite the identity — that is, the model would be
assigning it itself.

---

# Part II. Self-waking

## 16. What the platform does not give you out of the box

The schedule package **is** in the platform tree. But it is not referenced anywhere
except by itself: 0 occurrences in the stock web-application build, 0 occurrences in
the agent preset.

This is a strong fact and it explains more than it looks like. The mechanism is not
"missing from the presets" — it is **not mounted by default by anything**. That is
why there is no self-waking even for an agent on the platform's native loop until the
package is mounted by hand. The bridge has nothing to do with it: delivery is the
second layer, and the first one is simply absent.

The practical conclusion for anyone repeating this: if you have no self-waking, start
not with the bridge and not with the engine but with the question "is the layer
mounted at all".

## 17. Three layers, and why they must be told apart

1. **Delivery** — the schedule tools reach the model (the bridge).
2. **Waking** — a dispatch record in the session log gives birth to a new turn.
3. **Continuity** — the schedule state survives a restart.

The layers break independently and are verified independently, yet from outside they
look identical: "the agent did not wake up". We went through all three in that order
and closed each with its own measurement.

🔴 The third layer is not built the way it reads at first glance. **The schedule state
is not kept in a file of its own** — it is folded out of the session log events. Hence
a consequence that must be said out loud: the survivability of a reminder is exactly
equal to the survivability of the log. Break the restoration of a session from disk
and the reminders vanish along with the history, silently.

The same explains the delivery marking "session-local": it means "bound to the session
log", not "dies with the process". We first read it the second way and erred on the
cautious side.

## 18. The schema adapter

The SDK's tool helper requires a schema as a zod object, while a JSON Schema is what
travels over the wire. The adapter builds one from the other — a minimal subset,
exactly what the platform produces.

Three places where it is worth more than it looks:

**Branching shapes (`oneOf`/`anyOf`).** This is how the platform describes a parameter
that takes either a string or an object — the absolute time of a reminder. Without
that branch the converter does not understand a node with no `type` field and refuses,
and the gateway then **silently fails to expose the tool at all**: the refusal is loud
in the gateway log and invisible to the model. The branching boundary is stated
explicitly: there must be at least two branches (one branch is not a choice but a
typo), and each must assemble on its own.

**The order of optionality and description.** `optional()` first, `describe()` second.
In the opposite order the SDK's converter reads the description from the outer node and
**silently loses** the explanation of an optional field: the schema stays valid, the
model does not see the hint. Caught by comparing a tool listing against a stub.

**Value bounds.** Without them the schema quietly weakens: "a positive number" becomes
"any number", the model sees a different contract from the one the platform will
enforce, and gets a refusal at execution time — with a far from obvious reason.

🔴 **An unknown type does not become "anything".** Such a substitution would give the
model a tool with no parameter shape, and a failure would look like working. An unknown
type is an exception, the tool is not exposed, and the gateway writes the reason. This
is the general rule of that whole file: better to lose one tool loudly than to spoil
all of them quietly.

## 19. The measurements, and what they do not prove

| measurement | set for | fired | deviation | what is proved |
|---|---|---|---|---|
| No. 1 | +240 s, the platform untouched | on time | **3 ms** | the layer raises the agent while nobody is there |
| No. 2 | +900 s, the platform restarted **between** setting and firing | on time | **1 ms** | a reminder survives a platform restart |

Both measurements are proved by the **session** log, not by the tool's answer: the log
shows a gap with not a single record between the end of the previous turn and the
dispatch record, and the start of the new turn stands immediately after it. For the
second measurement there is independent evidence of the restart: the event numbering
in the log **continued instead of resetting to zero**, and the platform process id
changed.

The method deserves a separate note, because it is repeatable: the tool's answer proves
nothing here. It says "the rule was created", not "the rule woke me up".

**What the measurements do not prove.** Independence from the platform. Both of them
ran inside a live platform or across its normal restart. Loss of the session log, the
service dying, a machine reboot are not covered by them — and by construction (§17) the
first of the three will kill the reminders.

A third-party measurement, quoted for completeness: on the machine's second agent the
deviation was **54 ms over 300 s**, and there the interval limit fired live twice —
stopping in **47 s** and in **12 s**, the second time already through the deferred call.
This is **not my own reading**: it was not taken by my hand and is quoted from the
second agent's report.

## 20. The stop limit

The numbers: no more often than **1800 s** for a recurring reminder, no more than **6**
autonomous wake-ups in a row without a word from a human, no more than **48** a day
**per session**.

Why at all: while the alarms are one-shot the mechanism is safe. The first recurring
reminder turns it into a guard without a boundary, and the price is paid out of somebody
else's quota, when nobody is around.

🔴 **There is no counter at all, and that is a load-bearing decision.** The requirement
read "the counter must survive a platform restart". It is met not by storage but by
construction: the counter is **derived** from the session log events — the very log the
schedule restores itself from. There is nothing for a restart to reset; the hole has
structurally nowhere to appear.

**The sign of an autonomous turn was read off a live log, not invented:**

```
autonomous turn:  turn/end → inbox/spliced → schedule/change(dispatch) → turn/start
human turn:       turn/end → inbox/spliced → turn/start → user/message(kind=…)
```

🔴 The naive check "was there a message from a human" **does not work**: a reminder and
a letter arrive identically — spliced into the inbox with the user role. Exactly one
thing tells them apart: whether there is a dispatch record **between** the previous end
of turn and this start. That is why the flag is cleared both on the start of a turn
(spent) and on its end (a dispatch in the middle of somebody else's turn woke nobody and
does not count).

**The day is counted through the time-zone library, not by offset arithmetic** — let it,
not us, work out daylight saving.

**The check sits at the end of a turn.** That is a boundary, not a convenience: the limit
must stop the cycle but not touch a turn already started — unfinished work is not
aborted. The end of a turn means the turn is finished; stopping earlier is dishonest, and
later there is nothing to stop on.

**The mounting point was taken already proven.** The design named a subscription to agent
status changes, and it was unverified. Verifying turned out to be unnecessary: this same
plugin holds ticket revocation on session events — so the subscription demonstrably
arrives at that very mounting point. A new mounting point next to a working one would be
a superfluous entity.

**The order on hitting the limit: stop first, notice second.** Stopping matters more than
notifying — but silence is not allowed in any outcome, so the notice is written even when
the stop failed, and then it says outright that reminders may still be alive and must be
removed by hand. If the notice cannot be written, its whole text goes into the log as one
line. We do not crash: the cycle is already stopped, and that is the main thing.

## 21. Where the limit does not apply

Named in the code and printed on every start-up as a separate line.

* **To goal rounds** — they have their own ceiling, and it is about something else.
* **To wake-ups from background jobs** — they have their own limit.
* **To an agent without the bridge** — if the schedule tools run on the platform's native
  loop, our limit does not reach them; such an agent needs a guard of its own. We made that
  separation up front and separately, and it turned out to be right.
* **Against anyone who has sudo** — see §35.

What the limit does **not** exclude, contrary to the first design: one-shot reminders.
**Wake-ups** are counted, not rule types — the analysis of that hole is in §31. The
consequence: on hitting the limit every active reminder is removed, one-shots included,
but each is named by id in the log and in the notice. Nothing disappears silently.

The guard rearms itself when the streak is broken by a human or a new day begins —
otherwise it would fire once in the lifetime of the process and never again. And the stop
notice is sent **once per streak**, not once per turn: a notice repeated every turn would
itself become the noise the limit protects against.

---

# Part III. The subscription gateway

## 22. Why, and how it is built

There are several agents on the machine, each under its own user. If every one of them
kept the subscription token, the secret would multiply across the machine and rotation
would turn into a tour of every home. Here it lives in one place, under its own user, and
the agents get an entry point. A new agent is connected by a line of configuration and
knows nothing about the token.

The token is read **on every request**, not at start-up: rotating the secret needs no
service restart.

🔴 **The service is one instance per agent, and that is not decoration.** The SDK is
agentic: it drives the loop itself and itself runs the shell, files, search and network. So
the agent's "hands" are the user **this** process runs as. A shared system user does not fit
structurally: it has no access to the agent's home, and every agent on the machine would act
as one and the same person, treading on each other.

What stays shared: the token file — one per machine, access by group, no secret in the
agent's configuration.

There is a non-obvious consequence of this design that cost us an hour; it is set out in
§25, because it is a separate class of error.

## 23. Why the vendor SDK inside, and not hand-rolled HTTP

A lesson with a price, and it generalises.

At first the gateway assembled the API request by hand. Authorisation worked — that was
proved by the difference in answers: a deliberately wrong token got one refusal code, the real
one got another, about a rate limit. That is, the credentials were accepted. But **every** call
was rejected by a rate limit while the subscription was entirely healthy: other agents were
working on it at that very moment.

We went through and discarded four hypotheses: client headers, model binding, token expiry, the
set of service flags. The truth was something else: **the raw path is simply not served to
subscription access**. Same token, same machine, same network egress — the vendor SDK answers in
four seconds, the hand-rolled request is refused.

The general conclusion: **do not reinvent the vendor's protocol.** Vendor code knows subtleties
that are not in the documentation, and it will survive them changing. What goes into publication
is the conclusion; the recipe for the hand-rolled request is deliberately not here.

## 24. Boundaries

**Loopback only.** It is never exposed outward: this is access to the subscription without a
password.

**No confirmations are requested.** There is nobody to ask — the far end is not a human but the
platform. The real rights boundary is the rights of the instance user, and they are set in the
service unit, not in the code. The unit sandbox is deliberately not tightened: the agent needs
its own files and home, and against an agent with sudo the unit's restrictions are no boundary
anyway.

**Isolation of the secret is real against agents without sudo — and only them.** That must be
known in advance, not discovered.

**Health means the presence of the secret, not the liveness of the process.** Without a token the
service is up and useless; that must be visible from outside.

**MCP server names must not coincide.** The bridge does not overwrite a same-named foreign
server; it refuses to connect: without the bridge the agent works worse, with a substituted
server it works wrongly. The price of a collision is silent in both directions, so a collision is
a loud refusal, not a quiet substitution.

## 25. Reading the journal: an example of a class of errors

The platform service **writes** to the system journal. The agent's commands are executed by the
**engine** — a descendant of the gateway process. So the journal-read group must be given to the
unit whose descendant executes the commands, not to the one that writes to the journal.

The first attempt added the group to the platform service. The method was right — a line in the
unit, not only membership in the system group file, because a process fixes its group set when it
starts. The verification was right too — against the live process, not through a command. And the
result checked out: for the party doing the checking, everything worked. Yet the agent's refusal
stayed, because the object was the neighbouring one.

Hence a rule worth holding on to during any rights check:

> **A right method applied to the wrong object yields confidence, not truth.**

The ordinary object error is noticeable: you measure the wrong thing and get nonsense. This one is
not: you measure the **neighbouring** thing by the right method and get a coherent, elegant, false
answer.

A second rule from the same place: check `/proc/<pid>/status` of the **live** process. `id`,
running as another user and similar probes spawn a new process and show what you want rather than
what is.

---

# Part IV. The rakes

The most important part of this document.

## 26. Silence instead of a refusal

🔴 Our principal enemy, and it is subtler than an ordinary bug.

Asking the dependency container for a service returns **emptiness without an exception** while the
provider's fiber is not active. There is nothing to check in the return value: "the service is not
in this build" and "the service is still coming up" look identical — empty.

Then this happens. Code written as `const s = ctx.get('…'); if (s) { …the whole block… }` **skips
the whole block** when the provider is inactive. Not a line in the log, not a refusal, not a
trace. An error would have shouted. Emptiness looks normal: "that branch just was not there".

Three instances in a single day, all three in one messaging module:

1. the agent factory appears later than the channel: the very first message failed with a clear
   error — this case **was easy to cure precisely because it shouted**;
2. the session-persistence service appears later than the channel: the history-resume block was
   silently skipped, the agent was created afresh on top of an existing log, and every turn died
   of an id collision within milliseconds. From outside: "it received the message and went quiet";
3. the preset and default-model services: on the machine's second agent this went off the same
   evening — **the model's tool set dropped from 33 to 3**, with no error and no log line. The
   agent was left without a shell, without memory and without file reading, and it looked like an
   agent that had got stupider, not like a breakage.

The cure is the same everywhere: wait for a bounded time and **say** how the wait ended. Not wait
silently, not proceed silently — print a line in both outcomes.

And the boundary of the wait is stated explicitly: we wait no longer than 30 seconds, and only
while creating an agent. Otherwise the channel would lock forever where the service is not in the
build at all — that is, the protection would itself become the failure.

## 27. Cure the class, not the instance

The second case in §26 came **out of curing the first**: the wait was introduced for the agent
factory and not for the other service lookups in the same file, twenty lines below.

> **A cure applied to an instance rather than to every place of the class guarantees a relapse —
> and the relapse looks like a new disease, because the proof that "we already cured this" is lying
> right next to it.**

The rule: check **every** service lookup, not the one you got burned on.

That rule has a third dimension which is easy to forget: **the published copy**. We cured two
copies of our module and nearly forgot the third — the one already installed by other people. The
class covers it too.

## 28. A check that answers a different question

A syntax check of the file passed — and the platform fell over: the method the file called did not
exist in the installed version. The check honestly answered its own question ("does the file
parse") and said nothing about the one we cared about ("does it work").

The general form of this error is in §25: a right method applied to the wrong object. Both cases
share one thing: the check **passed**, and that is exactly why its result was not re-examined.

The practical technique against it is in §34.

## 29. Lazy agent creation

An agent is assembled on its first message, not when the platform starts. The measured gap on our
installation: **77 seconds** separate the start-up lines from the creation of the agent, and there
are no live agents at all in that interval.

Two consequences follow, each capable of costing an hour.

**The absence of a trace means "the mechanism was not called", not "the mechanism is broken".**
After a platform restart the log lacked the line we were waiting for as an acceptance sign — and
the conclusion "the fix did not arrive" suggested itself. There was simply nobody to call the
mechanism. This repeated three times in one evening, and to the very person who had formulated the
rule: **knowledge does not protect, a mechanism protects.**

**Live state must not be printed in a start-up line.** The number of live sessions at start-up is
always zero — such a line would lie every time. So the start-up line carries a computed "number of
sessions × limit", while the live number is taken where sessions already exist — in the stop
notice.

## 30. Re-entrancy of writing to the log

The platform publishes a session event **synchronously** and holds a lock while publishing: a
second write to the log from inside the publication of the first is refused.

Stopping the cycle writes to the log. So calling it directly from the event handler **is
impossible — it would always be refused**. The call is deferred to the next tick and lands outside
the publication.

This is not a precaution but a necessity, and it is proved on the bench: the synchronous write is
refused, the deferred one goes through.

🔴 **The difference in grounds deserves a separate mention, because it is worth more than the code
itself.** The machine's second agent has the same deferred call — but its subscription is not to a
session event, and the lock **does not manifest** for it. So the same code sits in two places: here
it is a **cure for a proven failure**, there it is a **precaution**. Merging them into one case
would lose knowledge: the next person to see "it is done this way everywhere" would not know which
of the two places can be changed with impunity.

## 31. The hole in an exception

The first formulation of the stop limit excluded one-shot reminders: they are safe, so the argument
went.

The hole is bypassed in one line: every self-wake sets itself a new one-shot alarm — and the cycle
is eternal while remaining formally "one-shot" at every step.

The cure: count **wake-ups**, not rule types. Then the chain falls under the limit in full, while
an honest single alarm set in a human turn does not — because there is no streak in front of it.

🔴 **The technique that caught the hole matters more than the correction.** The question asked was
not "what does the rule do" but **"how do I get around it"**. The first question tests the design,
the second tests the object. Worth asking the second one about every limit you write.

## 32. The absence of a default as a means of telling things apart

Our working numbers coincide with the code's defaults. If a field had a default value, the start-up
line would print an identical picture in two different cases: the configuration arrived, and the
configuration was lost.

So the fields are left without a default in the schema (the default is resolved in code), and the
start-up line marks every number with the word "configured" or "default". The technique is cheap,
and it has paid for itself twice: both losses of configuration were spotted by eye.

A small detail from the same place, which cost a separate fix: the mark must stand **immediately
after its own value**. Two marks in a row at the end of the line keep the meaning but do not read —
it is unclear which belongs to which.

## 33. The silent loss of a schema's shape

The first version of the bridge converted the schema a second time — the one the platform had
already normalised at registration. The converter expected one shape, received another and **lost
everything**: the list of allowed actions and the required fields disappeared, while the schema
stayed syntactically valid. The model got a tool with an empty contract.

It was caught by the bench, comparing the list of allowed actions — not by reading the code.

The rule: **any converter is a reason to first prove that it is needed.** There is no converter in
the bridge at all now, and in its place stands a comment with this history: otherwise the next
reader will take the absence of a converter for an omission and put it back.

## 34. The bench takes its text from the installed file

A method we hold as a rule.

A bench that verifies a fix cuts the text of the function **out of the installed file** — not out
of the author's head, not out of a copy lying next to it, not out of a draft. Otherwise what is
verified is the design and not the object: exactly the substitution of questions described in §28.

A second technique of the same kind, for when the mechanism prints nothing: **ask it for something
knowingly forbidden and recognise your own text in the refusal.** That proves that it is the fixed
file running in the live process. And always check the permitting side too — that what is allowed
goes through: otherwise you have installed not a limit but a blanket ban.

## 35. A mechanism must not pretend to be what it is not

An auditor's remark, set out separately.

The stop limit is **behavioural, not enforced**. It protects against a cooperative mechanism running
away: against a loop the mechanism entered by itself, against a bug in the code, against an avalanche
of retries. That is exactly the case that was caught by a live measurement.

It does **not** protect against anyone with full privileges: such a party bypasses the limit, and the
counter lies in the log of its own process, under its control. This is by design.

That is why it is announced outright — as a line on every start-up, not as a footnote in the
documentation. Otherwise, a month later, somebody will read the word "limit" as a security boundary
and build a plan on it.

> The line between an honest protection and a "protection without a boundary" runs exactly here: the
> honest one names where it does not apply — and names it where it will be read.

---

# Part V

## 36. The limits of trust in this document

So that the reader knows what to trust without re-checking and what to measure again at home.

**Verified by a live measurement** (our machine, our hand):

* the absence of tool-call events on the subscription route and the presence of calls in the engine
  transcript — §10;
* the ticket does not reach a command line with in-process transport: 0 occurrences across 275
  inspected processes — §12;
* two wake-up measurements, 3 ms over 240 s and 1 ms over 900 s across a restart, proved by the
  session log and by the continuation of event numbering — §19;
* the interval limit on a live system: a forbidden value was rejected with our own text, a permitted
  one was created — §34;
* re-entrancy of writing to the log: the synchronous call is refused, the deferred one goes through
  — §30;
* the lazy-creation gap of 77 seconds — §29;
* the loss of a parameter description with the reverse order of optionality and description — §18;
* the loss of the action list and the required fields on a second conversion of the schema — §33;
* listing the persisted sessions over a tree in the required state returns all 28 entries, including
  the one we were looking for — that is, the hypothesis that the listing was crashing was **refuted
  by fact**, and the cause was a different one (§26);
* the published version of the messaging module contains all three bare service lookups — checked
  against the package downloaded from the registry, not from memory.

**Taken by reading the code** (true for the version installed on our machine; re-check on yours):

* the return of emptiness without an exception while the provider's fiber is inactive — §26;
* which service methods are exposed and which are not — §14;
* the passage of a call through the permission waterfall in the tool registry — §14. We did **not**
  observe that refusal live: we read the waterfall and chose another path. If you repeat this, check
  it on your own layout — you may well have an answerer;
* the folding of the schedule state out of log events — §17. The consequence (it survives a restart)
  is measured; the mechanism is read;
* the absence of the schedule package from the stock builds: 0 occurrences — §16. That is a count over
  the tree of our installation.

**Taken by somebody else's hand and accepted on trust** — marked as such in the text:

* the deviation of 54 ms over 300 s and the limit stopping in 47 and 12 seconds on the machine's second
  agent — §19, from its report;
* platform log lines for the periods when we had no rights to read the journal — those were taken by our
  coordinator. The rights exist now, and every line in this document has been read with my own eyes.

**What cannot be established at all, and this is said outright:** which of the two silent paths fired in
a particular failure cannot be determined after the fact — the log is silent in both cases. That was
precisely the trouble. The fix removes the silence in both, so next time it will name itself.
