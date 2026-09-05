<p align="center">
  <img src="assets/banner.jpg" alt="Cost Tracker - Real-time token cost, prompt cache savings, and context window monitor" width="100%"/>
</p>

<p align="center">
  <b>Real-time token cost, volume accounting, and cache telemetry for Command Code.</b>
</p>

<p align="center">
  <a href="https://github.com/Azertyuiop442/cost-tracker/releases"><img src="https://shieldcn.dev/badge/cost--tracker-v0.1.0-24837b.svg?variant=outline" alt="Version"/></a>
  <a href="https://github.com/Azertyuiop442/cost-tracker"><img src="https://shieldcn.dev/github/stars/Azertyuiop442/cost-tracker.svg?variant=outline" alt="GitHub Stars"/></a>
  <a href="LICENSE.md"><img src="https://shieldcn.dev/badge/license-MIT.svg?variant=outline" alt="License"/></a>
</p>

Built for **[Plexus](https://github.com/Azertyuiop442/Plexus)**. Streams live cost, token volume, cache hit ratio, and turn metrics directly into the Plexus dock and sidebar.

---

## Installation

```bash
git clone https://github.com/Azertyuiop442/cost-tracker.git ~/.commandcode/mods/cost-tracker
```

---

## Features

- **Real-Time Cost Tracking**: Computes live token expenses per turn and session across all major providers.
- **Prompt Cache & Hit Ratio**: Tracks cache reads and live cache hit percentage directly in the telemetry stream.
- **Token Volume Accounting**: Accumulates input and output tokens per turn, session, and project workspace.
- **Plexus Mod Bridge**: Streams live dock segments (cost, tokens in/out, cache hit %, turns) to `/tmp/cc-sidebar/mods-data/cost-tracker.json`.
- **Zero-Loss Persistence**: Atomic checkpoints save session history on disk across restarts.

---

## Architecture

Cost Tracker operates as an autonomous background companion mod, hooking into session turns and publishing metrics via the Plexus Mod Bridge:

<p align="center">
  <img src="assets/architecture.svg" alt="Cost Tracker Architecture &amp; Data Pipeline" width="100%"/>
</p>

---

## Commands

| Command | Description | Scope |
|---|---|:---:|
| `/cost` | Session summary, total cost, prompt cache savings, and context gauge | Session |
| `/cost-history` | Per-turn detailed token and price log | Session |
| `/cost-models` | Percentage and dollar breakdown grouped by AI model | Session |
| `/cost-project` | Lifetime metrics across all recorded sessions in workspace | Project |
| `/cost-total` | Compact single-line summary (cost, savings, turns) | Session |
| `/cost-toggle` | Toggle automatic cost badge after every response | Setting |
| `/cost-reset` | Reset current in-memory session statistics | Session |
| `/cost-clean [workspace\|all]` | Purge saved history on disk | Storage |
| `/cost-help` | Quick command reference and shortcut guide | Help |

---

## License

MIT License. Free for personal, academic, and open-source use.
