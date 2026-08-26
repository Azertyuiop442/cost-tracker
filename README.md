<h1 align="center">COST TRACKER</h1>

<p align="center">
  <b>Real-time token cost, prompt cache savings, and context window monitor for Command Code.</b>
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/Version-v0.1.0-24837B?style=flat-square&amp;labelColor=1C1B1A" alt="Version"/></a>
  <a href="https://peership.dev"><img src="https://img.shields.io/badge/Feedback-Want_to_leave_a_feedback%3F-8B7EC8?style=flat-square&amp;labelColor=1C1B1A" alt="Want to leave a feedback?"/></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/License-MIT-DA702C?style=flat-square&amp;labelColor=1C1B1A" alt="License"/></a>
</p>

<p align="center">
  <img src="https://skillicons.dev/icons?i=typescript,bash,git,linux,apple" alt="Tech Stack"/>
</p>

<p align="center">
  <img src="assets/architecture.svg" alt="Cost Tracker Architecture &amp; Data Pipeline" width="100%"/>
</p>

---

## 01. Compatibility

> **Note**: Cost Tracker is primarily designed and optimized for **[Plexus](https://github.com/Azertyuiop442/Plexus)** (live sidebar metrics, dock telemetry, and interactive modals). While it functions in standard standalone terminals with Command Code, visual rendering and layout are best experienced inside Plexus.

---

## 02. Quickstart

```bash
# Clone into Command Code mods directory (auto-registered via jiti)
git clone https://github.com/Azertyuiop442/cost-tracker.git ~/.commandcode/mods/cost-tracker
```

---

## 03. Commands

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

## 04. Features at a Glance

- **Prompt Cache Savings**: Calculates exact dollars saved when prompt cache reads replace full-price tokens.
- **Context Window Gauge**: Live percentage showing conversation proximity to model compaction limit.
- **Plexus Mod Bridge**: Pushes lightweight JSON telemetry to `/tmp/cc-sidebar/mods-data/` in real time.
- **Atomic Disk Checkpoints**: Zero token count loss on sudden terminal exits.

---

<h2 align="center">Feedback &amp; Community</h2>

<p align="center">
  Have feedback, bug reports, or ideas? We're actively co-testing on PeerShip! <br/>
  <b><a href="https://peership.dev">Test Cost Tracker and leave feedback on PeerShip (peership.dev)</a></b>
</p>
