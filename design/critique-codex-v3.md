## Verdict: FIX-FIRST

No CRITICAL findings, but several SERIOUS correctness and pedagogy failures remain.

1. **SERIOUS — Continuity reads permanently inflate teacher scores**

   [continuityService.ts:159](/Users/antemo/studyloop/server/src/lib/continuityService.ts:159) persists an update on every `GET /continuity`; [continuity.ts:397](/Users/antemo/studyloop/server/src/lib/continuity.ts:397) increments every channel seen in every query.

   Failing scenario: repeatedly opening or refreshing one project increments identical cached search results until channels reach 10. Worse, a channel appearing in only one query immediately receives a persisted “prior validation” bonus, bypassing the required “≥2 distinct queries” threshold. The unpruned map also grows with every newly encountered channel.

2. **SERIOUS — Review transformations survive edits to their source card**

   [cardTransform.ts:160](/Users/antemo/studyloop/server/src/lib/cardTransform.ts:160) considers only `card.id`; [review.ts:228](/Users/antemo/studyloop/server/src/lib/review.ts:228) keeps that ID stable when bubble text changes.

   Failing scenario: transform “hip angle” into a question, edit the bubble to “shoulder pressure,” then reopen Review. The cached hip-angle question remains attached indefinitely. Cache entries need a source-content hash/version or invalidation on bubble edits.

3. **SERIOUS — Initial attestation loading can overwrite a newer learner action**

   [store.ts:870](/Users/antemo/studyloop/web/src/state/store.ts:870) applies the initial GET whenever the project ID still matches, while [store.ts:503](/Users/antemo/studyloop/web/src/state/store.ts:503) independently applies optimistic PATCH responses.

   Failing scenario: the initial GET reads `{}`, the learner enters a take and attests, PATCH succeeds, then the delayed GET resolves and replaces client state with `{}`. Concurrent attestation PATCHes have the same full-map, out-of-order replacement problem. Server data survives, but reveal/progress state regresses until reload.

4. **SERIOUS — Caption-pass failures silently discard drafts and race each other**

   [CompileFlow.tsx:117](/Users/antemo/studyloop/web/src/study/CompileFlow.tsx:117) assumes `Promise.all(patchBubble(...))` rejects, but [store.ts:1208](/Users/antemo/studyloop/web/src/state/store.ts:1208) catches failures and resolves normally. Each concurrent update also captures and may restore a different whole-array snapshot.

   Failing scenario: saving two captions succeeds for B but fails for A. A’s rollback can erase B from client state; the modal closes and compilation proceeds regardless, losing A’s draft with no retry opportunity.

5. **SERIOUS — Compile and export results lack stale-session guards**

   [store.ts:1393](/Users/antemo/studyloop/web/src/state/store.ts:1393) and [store.ts:1611](/Users/antemo/studyloop/web/src/state/store.ts:1611) capture project A but unconditionally publish their results.

   Failing scenario: start Compile or Share in A, navigate to B before the request finishes, and A’s result modal appears inside B. This can also pair B’s “What’s next” candidates with A’s compiled document.

6. **SERIOUS — YouTube heatmaps are positioned against the last mark, not video duration**

   [heatmap.ts:72](/Users/antemo/studyloop/server/src/routes/heatmap.ts:72) has no YouTube duration and falls back to `maxMarkTime × 1.05`.

   Failing scenario: a 60-minute video has its last mark at 10 minutes. That mark is plotted near 95% of the seek bar instead of 17%, and click-to-inspect bucket mapping is correspondingly wrong. Independent own/overlay normalization itself is correct.

7. **SERIOUS — AI pearls enter review without learner attestation or generation**

   [review.ts:241](/Users/antemo/studyloop/server/src/lib/review.ts:241) adds every model pearl directly to the review queue. This violates `PEDAGOGY.md` §5’s requirement that cards derive only from attested or learner-generated material.

   Failing scenario: analysis completes and untouched AI pearls become scheduled review cards automatically, allowing hallucinated material into retention before learner review.

8. **MINOR — C6 rationales are neither rail-editable nor retained for editing**

   [ShareFlow.tsx:33](/Users/antemo/studyloop/web/src/study/ShareFlow.tsx:33) implements rationales as ephemeral share-modal drafts and resets them at [ShareFlow.tsx:49](/Users/antemo/studyloop/web/src/study/ShareFlow.tsx:49). The contract requires an author-editable input on each own concept in the rail.

   Failing scenario: export annotated rationales, reopen Share to correct one, and every field is blank; the learner cannot see or revise the prior rationale.

9. **MINOR — Attestation mutation inputs are insufficiently bounded**

   [attestation.ts:13](/Users/antemo/studyloop/server/src/routes/attestation.ts:13) accepts any nonempty unit ID, while [attestation.ts:15](/Users/antemo/studyloop/server/src/routes/attestation.ts:15) has no length limits and never verifies that the unit exists in the project’s v3 analysis.

   A caller can persist arbitrary keys and large bodies into `attestations.json`. This is principally local data-integrity/storage abuse, not remote code execution.

Compatibility checks found no blocking regression: legacy v2 `analysis.json` receives defaults and remains readable, version-1 bundles tolerate absent V3 fields, `RailSectionId` includes `path`, and the session `Promise.all` branches internally catch failures. Prompt-injected transcript content remains structured/textual rather than executable.

Both workspaces pass TypeScript. Vitest could not start under the read-only sandbox because Vite attempted to create a temporary config file and received `EPERM`.
tokens used
199,779
## Verdict: FIX-FIRST

No CRITICAL findings, but several SERIOUS correctness and pedagogy failures remain.

1. **SERIOUS — Continuity reads permanently inflate teacher scores**

   [continuityService.ts:159](/Users/antemo/studyloop/server/src/lib/continuityService.ts:159) persists an update on every `GET /continuity`; [continuity.ts:397](/Users/antemo/studyloop/server/src/lib/continuity.ts:397) increments every channel seen in every query.

   Failing scenario: repeatedly opening or refreshing one project increments identical cached search results until channels reach 10. Worse, a channel appearing in only one query immediately receives a persisted “prior validation” bonus, bypassing the required “≥2 distinct queries” threshold. The unpruned map also grows with every newly encountered channel.

2. **SERIOUS — Review transformations survive edits to their source card**

   [cardTransform.ts:160](/Users/antemo/studyloop/server/src/lib/cardTransform.ts:160) considers only `card.id`; [review.ts:228](/Users/antemo/studyloop/server/src/lib/review.ts:228) keeps that ID stable when bubble text changes.

   Failing scenario: transform “hip angle” into a question, edit the bubble to “shoulder pressure,” then reopen Review. The cached hip-angle question remains attached indefinitely. Cache entries need a source-content hash/version or invalidation on bubble edits.

3. **SERIOUS — Initial attestation loading can overwrite a newer learner action**

   [store.ts:870](/Users/antemo/studyloop/web/src/state/store.ts:870) applies the initial GET whenever the project ID still matches, while [store.ts:503](/Users/antemo/studyloop/web/src/state/store.ts:503) independently applies optimistic PATCH responses.

   Failing scenario: the initial GET reads `{}`, the learner enters a take and attests, PATCH succeeds, then the delayed GET resolves and replaces client state with `{}`. Concurrent attestation PATCHes have the same full-map, out-of-order replacement problem. Server data survives, but reveal/progress state regresses until reload.

4. **SERIOUS — Caption-pass failures silently discard drafts and race each other**

   [CompileFlow.tsx:117](/Users/antemo/studyloop/web/src/study/CompileFlow.tsx:117) assumes `Promise.all(patchBubble(...))` rejects, but [store.ts:1208](/Users/antemo/studyloop/web/src/state/store.ts:1208) catches failures and resolves normally. Each concurrent update also captures and may restore a different whole-array snapshot.

   Failing scenario: saving two captions succeeds for B but fails for A. A’s rollback can erase B from client state; the modal closes and compilation proceeds regardless, losing A’s draft with no retry opportunity.

5. **SERIOUS — Compile and export results lack stale-session guards**

   [store.ts:1393](/Users/antemo/studyloop/web/src/state/store.ts:1393) and [store.ts:1611](/Users/antemo/studyloop/web/src/state/store.ts:1611) capture project A but unconditionally publish their results.

   Failing scenario: start Compile or Share in A, navigate to B before the request finishes, and A’s result modal appears inside B. This can also pair B’s “What’s next” candidates with A’s compiled document.

6. **SERIOUS — YouTube heatmaps are positioned against the last mark, not video duration**

   [heatmap.ts:72](/Users/antemo/studyloop/server/src/routes/heatmap.ts:72) has no YouTube duration and falls back to `maxMarkTime × 1.05`.

   Failing scenario: a 60-minute video has its last mark at 10 minutes. That mark is plotted near 95% of the seek bar instead of 17%, and click-to-inspect bucket mapping is correspondingly wrong. Independent own/overlay normalization itself is correct.

