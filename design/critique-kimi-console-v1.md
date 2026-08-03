# Critique — Kimi (console v1)

*Response to `docs/LLM-REVIEW-PROMPT.md`. Vantage: this reviewer spent a full session inside the console codebase — pane engine, store, layout persistence, PlayerChrome event layers, test suite — including shipping slice D's UI wiring and fixing two shipped interaction bugs live in the browser.*

## 1. The read

The app is actually a **trust machine**: its real product is the claim "the AI proposes, you attest, and only what you restate counts." That inversion — AI as proposer, never oracle — is the genuinely differentiated idea, and it's enforced in the data model (attestation store, unit proposals, sealed answers), not just in the marketing. The anchored-everything bet is also right; timestamps are what make video knowledge reviewable at all.

Where the thesis flirts with self-deception:

- **The console is consuming the mission.** Slices A–D built a beautiful cinematic pane engine — envelope fades, park flights, magnetism — but none of that changes whether a learner retains anything. It's the most polished part of the app and the least load-bearing. The delight-to-pedagogy ratio of recent effort is low.
- **One serious user is a blind spot, not a feature.** The builder's tolerance for friction (typing attestations daily, editing domains, rescuing a bad analysis) is not a nursing student's. Everything works; almost nothing is *forgiving*.
- **Extraction quality is the moat, and it's thinner than the UI.** Six LLM providers are abstracted, but extraction itself is one generic prompt family with a five-value domain enum. Breadth where it doesn't matter, depth missing where it does.

## 2. The domain jump — what breaks first

- **The domain enum has no nursing** (`server/src/lib/models.ts:39`: `["biology", "history", "music", "physical_skill", "generic"]`). Nursing router-classifies as "biology" and gets generic overlays. A clinical lens needs dosage/units fields, contraindication pairs, ordered protocol *sequences* (the unit model has no notion of steps), and NCLEX-style questions as its drill slot.
- **ASR is the kill-shot, confirmed in the plumbing.** YouTube projects persist *auto-captions* as the transcript (`server/src/lib/store.ts:185`); local files use whisper-family ASR. "Lisinopril / hyperkalemia / metoprolol" will be mangled, and extraction, echo merging, search, and attestation prompts are all built on that text. Echo merge will fail silently as the same drug appears spelled four ways. Highest-leverage gap: a terminology-correction pass (LLM + domain glossary, pre-analysis, diff-logged) plus fuzzy/phonetic matching in the registry merge.
- **Slides vs. bodies.** BJJ content rides the audio track; nursing lectures carry content *on screen*. The app analyzes transcripts only — "as you can see here" produces garbage extraction. Needs a frame channel: scene-change keyframes (ffmpeg) → one vision call per keyframe → "on screen:" text appended to transcript segments.
- **Concept density.** The console metaphor (one concept card with a 15s envelope fade, parked ticks, constellation map) is tuned for a few deep concepts per instructional. A pharmacology lecture is hundreds of small ones — the ticker floods, the map pane becomes soup, cabinets scroll forever. Density-adaptive UI (tick clustering, chapter rollup) will be forced within a week of real use.

## 3. The 90-day failure mode

The loop breaks at **attestation friction**. Typing a restatement is the highest-effort gesture in the app and it's required for anything to count. Week 1 it's satisfying; week 6 at 11pm before an exam it's the first thing skipped — and once attestation is skipped, the jade/amber state model decays into fiction. Second casualty: attempt-before-reveal (the blur gets clicked through). What survives is whatever is one-tap: review-queue grading.

Execution note from hands-on work: **the shipped UI was never click-tested.** Two event-layer bugs (PlayerChrome's full-frame layer swallowing all pane pointer events; SVG icon targets bypassing the pane drag guard so tool buttons micro-dragged instead of firing) made every pane un-interactive and survived four slices of "verified" work, because verification was typecheck + unit tests. Unit tests can't see a z-index. A standing Playwright smoke script (open study page, drag a pane, click every chrome tool, resize both axes) is an afternoon of work and would have caught both.

## 4. Creative direction — five moves

1. **Transcript truth layer** (before any nursing ingestion). LLM term-normalization pass on transcripts pre-analysis, per-domain glossary, corrections diff-logged and user-editable once with propagation. Smallest slice: one pass over `captions.json` via the existing structured caller, corrections logged into `analysis.json`.
2. **Frame channel for slide content.** Keyframes at scene changes, vision-read, appended as anchored "on screen" segments. Smallest slice: ffmpeg scene-detect + one vision call per frame on a single lecture; compare extraction quality vs transcript-only.
3. **Make the review queue the front door.** The app opens to a library; the retention loop lives a route away. If items are due, open to them. Smallest slice: redirect on load when the queue is non-empty. Cheapest retention win available.
4. **Anki export.** Scheduling already exists (review.json, lapse tiers) — but learner-owns-the-knowledge argues for `.apkg`/CSV export. Costs almost nothing, composes with the ecosystem nursing students already live in.
5. **Freeze the pane engine.** Stop console cosmetics at current state; redirect the next three slices' effort to moves 1–3. Consider deleting the constellation map if it hasn't earned its keep by month two — prettiest pane, least pedagogical load.

## 5. The one question

**"Describe, minute by minute, what a Tuesday-night 20-minute StudyLoop session looks like in month three of nursing school — on what device, in what chair, starting from what urge?"** Every gap above is visible or invisible depending on that answer. If the honest answer involves a phone in a parked car, half the roadmap reorders itself.
