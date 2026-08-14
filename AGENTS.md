# AGENTS.md

These instructions apply to the entire `dsh-sideband` repository.

## Product intent

Sideband snapshots selected context from a source Session, summarizes it with an independent tool-free LLM call, and asynchronously delivers a provenance-bearing capsule to another root Session or an authorized Agent Team Room. It is a bounded relay, not transcript synchronization, shared memory, arbitrary messaging, or a replacement chat UI.

## Non-negotiable invariants

1. `/sideband` is a native command; never implement it as a user message to the source Agent.
2. Snapshot and bound history synchronously before enqueue; background work must not reread the Session.
3. Return after process-local admission; do not await summary or delivery in the handler.
4. Project only visible user/model text. Exclude hidden/plugin context, reasoning, tools, and attachments.
5. Summarize through an independent, bounded, no-tool call with explicit untrusted-data delimiters.
6. Never inject into an in-flight target model call. `quiet` is default; `wakeup` is explicit.
7. Validate live targets at admission and resolve/authorize all targets again at delivery.
8. Preserve Room ownership and root/subagent fences. Reject self-delivery.
9. Include job/source/time/boundary/scope/focus/delivery provenance in every capsule.
10. Keep the v0.1 queue bounded and process-local; do not invent durable recovery semantics.

## UI rules

The browser half belongs in this same plugin package, but all core behavior must remain available through `/sideband`.

- Use DSH typed client services and command decoration.
- Do not replace root, composer, sidebar, or conversation.
- Do not query or patch host DOM nodes, use `MutationObserver`, or ship global CSS.
- Do not create a generic arbitrary-element insertion layer.
- Teardown registrations through Cordis lifecycle hooks.
- Capture screenshots only from a real local DSH instance with synthetic data.

## Compatibility and workflow

- Target DSH `0.1.0-rc.6` and Node.js `^22.19.0 || >=24` until a tested change says otherwise.
- Use `feature/<short-name>` branches.
- Preserve unrelated work and never add star/watch/follow behavior.
- Update both READMEs and CHANGELOG for public behavior changes.
- Commit required `lib/` artifacts after verifying they match source.

Before release run:

```sh
npm ci
npm run check
npm pack --dry-run --ignore-scripts
git diff --check
```

Verify command/model separation, frozen partial snapshots, no-tool summarization, target authorization, quiet/wakeup behavior, Room ownership, cancellation/shutdown, browser ModuleLoader registration, and clean-profile DSH installation.
