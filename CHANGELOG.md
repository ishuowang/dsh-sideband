# Changelog

All notable Sideband changes are documented here. Releases follow Semantic Versioning.

## [Unreleased]

## [0.1.0] - 2026-08-14

### Added

- Native `/sideband` command family for asynchronous relay, target discovery, status, and cancellation.
- Immediate, immutable snapshots with default last-12, `--last N`, bounded `--all`, `--focus`, and visible streaming partial output.
- Independent, no-tool summarizer calls with bounded input/output and untrusted-data framing.
- Process-local queue with concurrency, timeout, cancellation, retention limits, and explicit Host-restart loss semantics.
- Session `quiet`/`wakeup` delivery, cold Session resolution, and optional Agent Team Room delivery.
- Provenance-bearing capsules and exclusion of hidden/plugin/reasoning/tool/attachment data.
- Built-in native DSH Web target picker using command decoration without layout replacement or DOM patching.
- Bilingual documentation, architecture artwork, real UI screenshot, CI, funding, and DSH `0.1.0-rc.6` compatibility pin.

[Unreleased]: https://github.com/ishuowang/dsh-sideband/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ishuowang/dsh-sideband/releases/tag/v0.1.0
