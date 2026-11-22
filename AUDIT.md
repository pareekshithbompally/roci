# Roci — Audit Principles

How every code audit in this repo is run, by a person or an agent. An audit agent reads this file and `CLAUDE.md`, checks
only the scope it is given, and returns the payload below to the agent that launched it. The orchestrator verifies each
finding before anyone acts on it.

---

## Safety — always

- **Read-only.** No edits, commits, `git stash`, builds (`npm run build`, `cargo build`, `tauri`), installs, downloads,
  network calls or app launches.
- Allowed: reading files, `grep`/`find`, `git log` / `git diff` / `git show` / `git blame`, `npx tsc --noEmit`.
- Hex (`~/Programs/public-projects/hex`) is read-only reference.
- Other sessions may be editing the same tree: uncommitted changes that are not in scope are left alone and not reported.

## Pillars — what counts as a finding

| # | Pillar | A finding is… | Not a finding |
|---|---|---|---|
| P1 | **Works correctly** | A real bug: wrong output, crash, lost data, race, leak, a swallowed error | Style taste |
| P2 | **One owner per job** | A second copy of a capability, a parallel path, a file written by anyone but its owner | Two small helpers that do different things |
| P3 | **Built from shared parts** | Hand-rolled UI or logic where a kit part, shared util or hook already exists | Layout utilities (flex, gap) in features |
| P4 | **No hardcoding** | Colour, size, radius, copy, timeout or threshold inline instead of in tokens or config | A literal 0, 1 or '' with obvious meaning |
| P5 | **Front and back in step** | A type, field, command or permission that differs between Rust and TS; a TS call with no Rust command or capability | — |
| P6 | **State done right** | Wrong store for the state, a missing invalidation, a selector returning a fresh object, a mutation without rollback, polling | — |
| P7 | **Lean** | Dead code, unused exports, speculative abstraction, defensive wrappers for failures that can't happen, unneeded fallbacks | Handling a failure that is real |

**Hex is the tie-breaker.** Where our code is over-engineered or awkward and Hex has a clean primitive or pattern for the
same job, Hex wins: the finding is P7 and the fix is Hex's way. Roci features Hex doesn't have are judged on P1–P7 alone.

**Severity:** `bug` (P1, or anything a user hits) · `structure` (P2–P6) · `lean` (P7). Nitpicks are dropped, not reported.
Every finding carries evidence (`file:line` and the failure in one sentence); without evidence it is not a finding.

## Frontend primitives — the one place for each job

| Job | The one place |
|---|---|
| UI parts | `@shared/ui` (kit, barrel only), then `@shared/components`; features only arrange |
| Look | `src/styles/tokens.css` → Tailwind role utilities → kit variants |
| Copy, numbers, timings | `src/config/*.config.ts` |
| Client state | Zustand, one slice per selector (`useShallow` for objects) |
| Disk / server state | TanStack Query; keys from `@shared/query/queryKeys`; the writer invalidates; optimistic mutations with `cancelQueries` + rollback |
| AI calls | Vercel AI SDK via `services/ai/provider.ts`; errors through `toAiError` |
| Speech | `services/ai/transcription` — one router: real-time streams when the model streams, else chunks |
| Model facts | models.dev, then `src/config/modelSeed.config.ts`; never per-provider code or listers |
| Price and usage | `costOf` (`@extensions/usage`) and the one usage writer (`recordUsage` / `logUsage`) |
| Formatting | `@shared/utils/formatters` |
| Native calls | wrapped in `isTauriEnvironment()`; events, never polling |

## Backend primitives (Rust)

| Job | The one place |
|---|---|
| Storage | `roci.db` through `tauri-plugin-store`; files only as `assets` rows |
| Meeting status | the store's step guard (`meetings_begin_step` / `meetings_end_step`) and its `meeting://changed` event |
| Commands | each registered, allow-listed in `capabilities/*.json`, and called from TS with matching types |
| Speech engine | `src-tauri/src/stt` (transcribe.cpp) |
| Audio capture, permissions | frozen core (`src/audio`, `src/permissions`): report bugs only, never propose rewrites |
| OS state | native listeners and deadline timers, no polling |
| Build hygiene | no new warnings |

## Payload — what each audit agent returns

```json
{
  "scope": "what was audited (paths or commits)",
  "files_read": 0,
  "findings": [
    {
      "pillar": "P1",
      "severity": "bug | structure | lean",
      "file": "repo-relative path",
      "line": 0,
      "what": "the defect, one sentence",
      "failure": "concrete input or state → wrong result",
      "fix": "one sentence, using an existing primitive (or Hex's)",
      "confidence": "certain | likely"
    }
  ],
  "clean": ["areas checked with nothing found"]
}
```

Findings are ranked bug → structure → lean. An empty `findings` list is a valid result.
