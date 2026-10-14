# Instagram/Threads intake for Anna — B-N-2027

Candidate code; live access, roots, permissions and token lifetime require montage
verification. Package number is assigned when merging after Alpha audit15.
No Instagram/Threads reply/publishing worker is provided. VK writer settings
remain the coordinator's separate decision.

## Version authority and strict pagination

The Meta application owner selected Instagram Graph API v26.0. Its single
runtime source is meta.instagram.apiVersion in Anna's private configuration.
The API client, token refresh/installer and READ/inspection helpers use that
setting; there is no version fallback in helper code or fixed v22 config gate.
The fixed Instagram account check and bounded version syntax remain.

Pagination again requires the exact configured path including its version.
Requests to v26.0 accept next on v26.0; older or newer next versions are held
as page_origin rather than adopted. Host, HTTPS, credentials, fragment and
object/edge checks remain strict, and the next URL is never requested.
The earlier metadata-only version allowance was a compatibility workaround;
matching the confirmed app version removes the need for it. A future Meta
version change requires an explicit configuration update and validation.

Both providers in the migration candidate have enabled=false. The coordinator
keeps Threads at v1.0 after the following one-request read probe from Anna
on 14 October 2026 at 08:32:52Z: GET graph.threads.net/v26.0/me?fields=id,username
returned HTTP 400, THApiException, code 100, error_subcode 33. Exact Meta message:

    Unsupported get request. Object with ID 'v26.0' does not exist, cannot be loaded due to missing permissions, or does not support this operation

The owner changed both application dashboards to version 26, but that does not
establish support for the v26.0 path on graph.threads.net. This observed refusal
has alternative causes in its message; it is not proof of a permissions diagnosis.
There was no v1.0 retry in this turn. Threads v1.0 is retained by the coordinator.
Preparation requires a matching source checksum
and no existing meta section; otherwise preserve the current providers and
recapture the configuration. Old activation fragments with v22 and v25 are historical. The current disabled
fragment is anna-meta-ig-v26-threads-v1-disabled.json (SHA256 prefix
5ba2674c72e7c598); both readers and refresh remain disabled.

## Configuration and callers

Add meta to the existing private Anna config. This is a fragment, not a complete
config. Targets remain strings; Instagram target is 17841453053403067.
An explicit enabled/armed pair starts a worker from src/main.mjs. Without meta,
startup retains previous behavior. Disabled providers make no API requests.

    "meta": {
      "instagram": {
        "enabled": false,
        "armed": true,
        "apiVersion": "v26.0",
        "token": {"passRef": "instagram/ostrov-2026-access-token"},
        "startAt": "2026-10-14T00:00:00Z",
        "maxRoots": 10000,
        "dailyCallLimit": 2000,
        "editCards": true,
        "messagesEnabled": true,
        "accessEpoch": 0,
        "refresh": {"enabled": false}
      }
    }

Replace the example startAt with the coordinator's actual transition-window
start. Threads uses its own existing passRef and target; its prepared v1.0
setting is retained by the coordinator, with app metadata checked separately
by the owner during the future inventory. The sample account in
config.example.json is not a live identity measurement.
No app ID/secret is inferred or fetched; refresh uses the current access token,
not OAuth exchange. App identity/scopes belong to montage inventory.

- maxRoots: default10000, range1..100000, bounds combined durable post/conversation
  inventory for one provider. status.roots separates posts and conversations.
  Counts describe known inventory, not guaranteed currently visible objects.
- dailyCallLimit: default2000, range1..100000; all attempted HTTP, including
  denied/repeated calls and refresh validation, share durable provider/account
  counter. UTC day is in status; rollback of clock parks rather than resets it.
- Poll every900s; ≤100 attempted calls and300s per series, each HTTP≤30s.
  Jobs continue fairly from persistent pages; incomplete series is partial.
  No guarantee that a large inventory is fully revisited every900s.
- Permission refusals hold a road/profile. Same-key restart preserves holds.
  accessEpoch increases only after coordinator verification of access; a
  different credential releases holds only after its matching-account /me.
- HTTP429 and Meta codes4/17/32/613/80002/80004/80006 are rate backoff;
  HTTP401/403 and codes10/190/200/299 are permission holds. Usage headers
  x-app-usage/x-business-use-case-usage at≥90% defer; values above100 saturate
  the percentage indicator. Retry-After integer seconds is bounded1..86400.
- editCards defaults true. A→B→A produces three observed versions. False removes
  only newly created edit-notice outboxes, preserving every model input.

Instagram uses Instagram Login/graph.instagram.com, own media, all comment
pages and separate reply pages, own conversations, paginated messages and
individual message reads. Threads uses own threads and full conversation
pages. APIs that return missing required fields, wrong parent/target or denied
visibility remain named partial/held; HTTP200 empty is unverified_empty.

## Storage, conflicts, delivery

State is the existing Anna config.stateDir/socseti.sqlite. Meta tables hold
jobs, roots, per-section baseline, full provider IDs, observed versions,
per-object holds and counters. Page acceptance, both outboxes and continuation
are atomic. Store remains strict for its other callers.

Identity changes in kind/conversation/subject, or a Store collision in
key/account/kind/conversation/subject/text, quarantine that object with reason.
A savepoint permits the rest of the page. A restored object resumes without
duplicate outboxes. Non-conflict storage failures roll the page back;30000
pending across all Anna networks is resumable backpressure.

Historical objects before startAt build baseline silently. New observations
after a completed section are admitted even with an old provider timestamp.
Untouched sections do not become complete because another section succeeded.
Provider timestamp and received time differ. Completed-page cache is bounded
to1000 per account; object/version dedup remains durable. Expired cursor code100
with after gets one conservative rewind; repeat without a working cursor is
held. Requests never follow arbitrary paging URLs with credentials.

Existing anna_event is consumed by native social-dispatch in the Telegram
channel; ACK means durable admission, not model/human reading. Existing
event_card_request uses Marketing -1001659691422, batches09..23 Europe/Moscow,
night/tail deferred09, empty hour silent, no urgent exception. Notices group
to3500UTF-16; approval drafts have individual buttons/hash,24h TTL from final
confirmed card part. All three approvers remain, all writers remain off.

## Refresh and owner installer

Proposed units are in systemd/, not activated by this code submission.
Refresh oneshots: User=anna, SupplementaryGroups=socseti, UMask0077,
PASSWORD_STORE_DIR=/opt/anna/.password-store; daily00:15IG/00:25Threads UTC,
Persistent/jitter5min,180s deadline, no automatic service restart.
Anna's actual account is not a socseti Unix-group member in the author's
read-only id measurement; the service supplementary group is necessary.

An enabled refresh can represent missing metadata without preventing reading.
It holds precondition_missing before credentials/HTTP until contractVerified,
localSourceConfirmed, tokenType=long_lived, issuedAt/expiresAt and minAgeSeconds
are verified. Dates may be omitted/null while unknown; minimum age must be a
verified integer≥86400. Eligibility: age threshold met, expiry future and≤14d.
Do not turn this flag on merely because /me succeeds.

IG refresh reference failed429; the intended ig_refresh_token contract is
not live-validated. Threads official collection describes th_refresh_token
for unexpired long-lived tokens. Tokens/scopes/actual fields for both networks
are outside this candidate verification. No OAuth/code exchange/reissue occurs.

The renewal and manual owner-token installer share an OS flock derived from
provider/account, in the state directory, wait≤5s. Concurrent renewer returns
busy; an unlocked crash marker is unknown, never a second refresh. An old
encrypted pass record is backed up before pass insert. Token arrives in RAM/
stdin, never argv/log/plaintext temp; readback occurs in RAM. Unexpected body,
identity, transport outcome or install outcome retains unknown.

The existing-token owner installer is src/meta-token-install.mjs. It receives
only the already owner-issued token on stdin, validates /me, takes the same
lock and stages saved_not_loaded. It is not called by a timer or model tool.
The mounting hand runs it as anna with socseti group access. Direct pass writes
bypass this protocol and are outside its protection; old sync/direct writes
must be closed before local renewals. This code tact runs neither installer
nor pass against real credentials.

Worker confirms generation only after loading current pass token and /me.
While saved_not_loaded, a5s reload check runs; persistent loadedRefresh and
fingerprint allow the renewer to finish idle with no further HTTP/install.
A missing live ACK remains held. Secret-specific actor/GPG/pass and these
future systemd units still need live montage verification.

## Watch and independent caller

anna-meta-watch.timer invokes src/meta-watch.mjs every1800s. It checks required
timer state, worker heartbeat≤2100s, no progress7200s, refresh invocation≤30h,
unknown expiry and expiry≤7d. A valid, bounded rate/budget/pressure park requires
a fresh worker heartbeat. Refresh API calls cannot fake it. It reads durable
held jobs/objects separately from successful neighbor activity.

Operational sender is agent-alert, one≤60s attempt per incident. Incident
subject/generation/reason is deduplicated86400s; unknown observations do not
prove recovery. Journal stores count and≤3 object samples per group, bounded
before writing. Output is submitted/unconfirmed, not recipient-read proof.
Social event cards preserve the ordinary09–23 schedule.

The independent reader is test/stend-meta-watch.mjs, called by nightly
vse-stendy-boevye under anna. It returns0healthy/1namedbad/2blind, makes no
Meta/Telegram requests, and has no credentials/alert effect. The candidate
also changes only the necessary rows in dsh-obhod-stendov:
perechen-boevyh-stendov.txt and OBLAST_STENDOV/SREDA_STENDOV in
vse-stendy-boevye.sh. Both installed/source copies receive META_WATCH_CONFIG
and role@anna. Coordinator mounts these rows with Meta; sidecar
systemd/meta-watch.obhod.txt repeats the contract. Until that actual montage,
external coverage is candidate-only. Nightly detection of a removed watch timer
is limited by the nightly caller schedule; this is not continuous detection.

## Montage conditions and limits

Coordinator: verify new IG fields/routes/scopes and controlled comment/reply/DM;
supply Threads refs/appID/actual /me/version/scopes; measure roots and tune daily
budget against actual provider usage; verify own pass/GPG and lifetime; keep
writers off. Anna receives/records/model-turn/cards first, then coordinator
removes IG/Threads TARGET_GROUP_JIDS from Ostrov .env.template and restarts her
instance, verifies extension idle in new PID. For Threads close old refresh/
sync/late queued writes before the first local credential write.

No guarantee for deleted/intermediate edits, inaccessible inbox folders,
retention-limited messages, live/stories/disappearing content, pending/ignored
Threads replies, third-party mentions/posts, Threads DMs, or long downtime.
Polling reports observations, not every provider event. Provider rights, API
version compatibility and actual visibility are not proven by fixture tests.

Primary read references:
- Meta Instagram collection: https://www.postman.com/meta/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00
- Meta Threads collection: https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api
- IG comment/reference and refresh: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/comment-moderation ; https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token
