# Real-Lecture Proof Findings — 2026-08-10

Every finding uses this schema:

- **ID** — sequential (`F-01`, `F-02`, ...)
- **Severity** — `MAJOR` (blocks a success criterion or requires a workaround) / `MINOR` (works but rough) / `OBSERVATION` (notable, non-blocking)
- **UI step** — which UI step failed or needed a workaround (or "n/a" for a non-UI observation)
- **Repro** — exact steps to reproduce
- **Workaround used?** — yes/no, and what

Per D-01: any UI step that cannot be completed in the UI is itself a finding, not something to smooth over with an API call.

---

## F-01 — OBSERVATION — `transcriptSource` field is a declared-path category, not a resolve-branch indicator

- **Severity:** OBSERVATION
- **UI step:** n/a (evidence-capture reading, not a UI failure)
- **Repro:** `GET /api/transcript?projectId=<id>` after creating a YouTube project returns `transcriptSource: "youtube"`. This value comes from `transcriptSourceForDeclaredPath()` (`server/src/lib/transcriptChain.ts:67`), which classifies the *declared transcript path's shape* (`captions.json` -> `"youtube"`) — it does NOT distinguish whether the captions were populated by Innertube directly or by the yt-dlp fallback route (`routes/youtube.ts:45-63`). The actual branch that fired for this run is only visible in server logs (`"youtube resolve: innertube metadata-only, trying yt-dlp for captions"`), not in any API response field.
- **Workaround used?** No — RUN-MANIFEST.md records the branch from the server log line directly rather than inferring it from `transcriptSource`, per RESEARCH Pitfall 1's instruction to document whichever branch actually fired.
- **Impact:** None on this run's evidence (the log line is authoritative and was captured), but future proof re-runs relying on `transcriptSource` alone to claim "the fallback fired" would be making an unsupported claim. Not a code defect — the field was never designed for this purpose, just noting the terminology gap for later report writers.

---

## F-02 — OBSERVATION — Innertube caption endpoint unreliable on this network, confirmed twice this run

- **Severity:** OBSERVATION
- **UI step:** n/a
- **Repro:** Both the UI-driven project-creation resolve call and the separate evidence-capture `POST /api/youtube/resolve` call for the same video (`K0maLgTzIto`) logged `"innertube metadata-only, trying yt-dlp for captions"` — Innertube never once returned usable captions for this video on this machine/network across two independent calls.
- **Workaround used?** No — this is the Phase 1 fallback (Bug 1 fix) working as designed, not a workaround. No manual yt-dlp invocation, VTT parsing, or curl step was performed by the operator; the server did it automatically inside the resolve route.
- **Impact:** None — SC1's "zero manual workarounds" claim is genuinely proven here (not vacuously, since the fallback branch is exactly what fired), consistent with the 2026-08-08 proof's own finding that Innertube is unreliable from this network.

---

## F-03 — OBSERVATION — Resolve-branch confirmation relies on elapsed time, not a captured server log line, in this executor's session

- **Severity:** OBSERVATION
- **UI step:** n/a (evidence-capture limitation, not a UI failure)
- **Repro:** 04-01 confirmed the fallback branch via a literal server log line (`"youtube resolve: innertube metadata-only, trying yt-dlp for captions"`) because that plan's executor session had direct access to the harness's foreground/background process output. This 04-03 task's executor is a fresh subagent spawned without a handle on that background process's stdout stream, so the same log line could not be captured directly. The branch is instead inferred from `POST /api/youtube/resolve` returning in 18795ms — an order of magnitude slower than Innertube's <2s warm-cache path documented in `server/src/routes/youtube.ts`'s own header comment, and consistent with a yt-dlp subprocess spawn (which the RESEARCH doc's own chunk-count estimate assumed could take up to its 30s timeout).
- **Workaround used?** No — the project was still created entirely through the real UI paste-then-submit flow (2 learner actions); this finding is about evidence-capture provenance, not about the learner-facing flow needing a workaround.
- **Impact:** Low. The elapsed-time signal is strong circumstantial evidence (F-02 already established Innertube is unreliable twice on this exact video/network from 04-01's own log capture), but a strict reader should treat "yt-dlp fallback fired" for this specific 04-03 run as inferred-from-timing rather than log-confirmed. Does not affect SC1's zero-manual-workaround claim, only the confidence level of the branch-attribution claim for this specific run.
