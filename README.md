# ESTIN CRM — Handover Pack

Everything from the design phase, ready for the build in Claude Code.

## What's in here

| Item | What it is |
|---|---|
| `CLAUDE.md` | The project brief. Claude Code reads it automatically every session |
| `docs/v1-build-plan.md` | Frozen V1 scope, build phases, technical support plan |
| `docs/crm-specification.md` | The full system specification |
| `docs/modules-to-design.md` | Design notes for the modules not yet prototyped |
| `docs/decisions.md` | What has been decided, and what is still open |
| `prototypes/` | The back office, trader portal and trading terminal prototypes, plus notes on their limits |
| `reference/competitors/` | Leverate and TradeTech screenshots |
| `reference/brand/` | Brand direction boards |

## How to start

1. Unzip this folder somewhere permanent on your laptop, for example in Documents.
2. Open Claude Code and point it at this folder.
3. First message:

   > Read CLAUDE.md and the documents in docs/. Summarise what you understand we are building, list anything unclear, then propose a technology stack for my approval before writing any code.

4. After you approve the stack, start Phase 1:

   > Start Phase 1 of v1-build-plan.md: set up the project, the database schema, trader authentication, admin roles and audit logging. Explain each step and tell me how to check it works.

## Keep this folder up to date

- When you settle an open decision, update `docs/decisions.md`, or ask Claude Code to.
- Ask Claude Code to use version control (git) from the first session, so every change can be reviewed and undone.
- Share this folder with your technical contractor before the first build session.
