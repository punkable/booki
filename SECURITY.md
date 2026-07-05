# Security Policy

Thanks for helping keep **Booki Dock** and its users safe.

## Supported versions

Booki is a rolling beta: only the **latest release** is supported, and the
in-app updater keeps you on it. Please make sure you're on the newest version
before reporting.

## Reporting a vulnerability

**Please do not open a public issue for security problems.** Instead, report
privately so it can be fixed before it's disclosed:

- **Preferred:** open a [private security advisory](https://github.com/punkable/booki/security/advisories/new)
  on GitHub (Security → *Report a vulnerability*).
- **Or email:** **punkable@protonmail.com**

Please include, as best you can:

- what the issue is and the impact you think it has,
- the version of Booki and your Windows version,
- clear steps (or a small proof of concept) to reproduce it.

## What to expect

- An acknowledgement, typically within a few days.
- An honest assessment and, for confirmed issues, a fix in the next release.
- Credit in the release notes if you'd like it (or you can stay anonymous).

## Scope & good to know

Booki runs entirely on your PC. It has **no server, no accounts and no
telemetry**, and it only touches its own data folder (`%APPDATA%\Booki`), your
pinned items and — if you enable it — the per-user startup registry entry.
Its only network use is checking for updates on GitHub and fetching the favicon
of a website you pin. Reports about any behaviour beyond that are especially
welcome.

Because this beta isn't signed with a commercial certificate yet, Windows
SmartScreen may warn on first run — that's expected and not a vulnerability.
