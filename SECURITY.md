# Security policy

Sideband moves conversation-derived data across Session boundaries and may send it to an external summarizer provider. Treat its profile configuration, target ids, Host memory, and diagnostic logs as security-sensitive.

## Supported versions

| Sideband | DSH target | Supported |
| --- | --- | --- |
| `0.1.x` | `0.1.0-rc.6` | Yes |

## Report a vulnerability

Please use GitHub's **Security → Report a vulnerability** flow instead of a public issue. Do not include real transcripts, credentials, Session/Room ids, or memory dumps. A useful private report includes affected versions, a synthetic reproduction, expected and observed authorization/data flow, impact, and mitigations.

## Trust boundaries

Sideband assumes the local DSH process, selected profile, plugin installation, and filesystem account are trusted. It does not assume that conversation text, summarizer output, a remote model provider, or destination content is trustworthy.

Protected assets include source and destination text, provider credentials held by DSH, routing metadata, model quota, and snapshots/summaries held temporarily in Host memory.

## Security invariants

1. `/sideband` runs through DSH commands and is not submitted to the source model.
2. The snapshot is fixed synchronously at the command boundary; workers never reread moving history.
3. Projection accepts only visible user/model text. It excludes system/developer/plugin context, reasoning, tools, and attachments.
4. The summarizer has no tools, receives bounded data, and runs under its own signal and timeout.
5. Live targets are checked at admission; every target is resolved and authorized immediately before delivery.
6. Only root Sessions may be sources or Session destinations; self-delivery is rejected.
7. Room delivery delegates ownership checks to Agent Team Room and never bypasses its leader boundary.
8. Neither `quiet` nor `wakeup` mutates an already executing target model call.
9. Job status and cancellation are scoped to the creating Session.
10. The v0.1 queue is process-local and bounded. Host shutdown clears job state instead of claiming ambiguous recovery.

## Prompt injection and data handling

Transcript content is wrapped as untrusted data under a fixed reducer prompt. Sideband supplies no tools and bounds input/output. These controls reduce blast radius; they do not prove that a model will summarize adversarial text perfectly.

Do not relay sensitive or regulated content until you have reviewed the configured provider's retention policy. Do not use a relayed capsule as sufficient authorization for a high-impact tool action; the destination still needs its normal confirmation and permission policy.

## Delivery and retention

`quiet` is the conservative default. `wakeup` can create model work and must be explicit. Cancellation is best-effort once delivery begins and cannot recall a capsule already accepted by a destination.

While the Host is running, its memory may contain snapshots, summaries, and routing metadata. Restrict process inspection, core dumps, swap access, and diagnostic logging accordingly. Restarting or crashing the Host loses queued/in-flight jobs and status history.

## Browser extension boundary

The bundled client module is convenience, not authority. The Host revalidates every command. The client uses the declared command-decoration API, owns no layout, performs no DOM patching, and ships no CSS.
