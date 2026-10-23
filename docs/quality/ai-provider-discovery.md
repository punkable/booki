# Local AI provider discovery — 0.96.0

| Provider | Local discovery | Allowance |
| --- | --- | --- |
| Claude | Configured and default Claude roots plus XDG configuration; project JSONL usage records | Local token consumption and block timing; subscription quota is unknown unless separately published, and is never inferred from elapsed time |
| Codex | Configured and default homes; active and archived session JSONL records | Actual logged rate-limit windows, when present; token totals deduplicate per session rather than across unrelated sessions |
| Cursor | Home, roaming/config and local data folders | Folder presence only; no account database is opened and no quota percentage is fabricated |
| OpenCode | XDG data, home data and Windows local/config folders | Folder presence only; no account database is opened for quota |

All four providers have a row in AI details. Absent sources are explicitly identified. Automatic tile rotation uses detected providers; users can select a particular provider. Refresh reruns discovery without restarting Booki. A provider installed only in WSL, on a remote machine or used solely in a browser may leave no compatible local usage data.

The activity watcher uses the same Codex/OpenCode/Cursor roots. OpenCode watches database/WAL metadata and older message/part storage. Metadata watches detect equal-length rewrites, without reading file contents. These activity states remain heuristic; they are not proof of a provider's internal agent phase or account balance.

Discovery never reads credential files, authentication databases, browser accounts or remote services. JSONL parsing retains only usage numbers, identifiers for deduplication and timestamps; text fields are discarded. Native tests use temporary fixtures only, covering missing sources, alternate roots, archives, unrelated session counters and equal-length metadata changes.

Windows follow-up: test standard and configured roots on a fresh PC; open the locally installed tool and produce a session record, then Refresh. Confirm detected/missing states, actual Codex limit windows when available, explicit unknown quota for other providers and no fabricated limits. Physical vendor/version coverage remains separate from CI.
