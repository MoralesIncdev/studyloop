# 1. Typed Knowledge-Unit Model

## Universal spine (survives every domain)

```json
{
  "id": "n_<sha256(label+domain+firstQuote)>",
  "kind": "node",
  "type": "CLAIM | MECHANISM | PROCEDURE | EXAMPLE | BOUNDARY | RELATION",
  "domain": "generic | biology | history | music | physical_skill",
  "label": "string",
  "summary": "string",
  "body": "markdown",
  "aliases": ["string"],
  "anchors": [
    {
      "videoId": "string",
      "segment": [0.0, 120.0],
      "quote": "string",
      "media": { "thumbnail": "...", "frame": "..." }
    }
  ],
  "universalSignals": {
    "thresholdConcept": false,
    "abstractionLevel": 1,
    "introducedAt": 0.0,
    "revisitedCount": 0
  },
  "provenance": {
    "method": "LLM_CHUNK | LLM_MERGE | USER | IMPORT",
    "chunks": ["c1", "c2"],
    "confidence": 0.85,
    "extractedAt": "ISO"
  },
  "slots": ["slot_1"],
  "contributions": ["contrib_1"]
}
```

```json
{
  "id": "e_<sha256(source+target+type+quote)>",
  "kind": "edge",
  "source": "node_id",
  "target": "node_id",
  "type": "REQUIRES | PART_OF | EXAMPLE_OF | ENABLES | CAUSES | CONTRADICTS | BOUNDARY_OF | PROCEDURE_STEP | RELATION_INSTANCE | SAME_AS",
  "strength": 0.9,
  "evidence": {
    "quote": "string",
    "videoId": "string",
    "segment": [0.0, 120.0]
  },
  "provenance": { "method": "...", "confidence": 0.8 }
}
```

## Per-domain overlays (stored in `domainOverlay`)

**Biology — mechanisms & levels**
```json
{
  "levelOfOrganization": "molecular | cellular | tissue | organ | organism | population | ecosystem",
  "mechanismType": "structure-function | feedback | signal-transduction | evolutionary",
  "entities": ["protein X", "mitochondrion"],
  "directionality": "forward | reverse | bidirectional",
  "scaleMismatchWarning": false
}
```

**History — causation + sourcing**
```json
{
  "sourceType": "primary | secondary | material | oral",
  "sourcing": { "corroboration": 2, "reliability": 3 },
  "causationType": "proximate | structural | contingent",
  "actors": ["Louis XIV"],
  "timeBounds": { "earliest": "...", "latest": "..." },
  "perspectiveFlag": false
}
```

**Music — schemas + notation↔sound**
```json
{
  "schema": "cadence | sequence | modulation | voice-leading",
  "notation": "V7-I",
  "soundDescription": "dominant seventh resolving to tonic",
  "keyContext": "C major",
  "patternType": "harmonic | melodic | rhythmic | formal",
  "earTrainingSlot": true
}
```

**Physical skill — procedure / trigger / failure**
```json
{
  "skillType": "technique | position | transition | drill",
  "triggers": ["opponent overcommits", "sleeve grip"],
  "failureModes": ["posture broken", "weight too far forward"],
  "safetyLevel": "low | medium | high",
  "bodyParts": ["hips", "grips"],
  "equipment": ["gi"],
  "drillPairing": ["node_id"]
}
```

### What survives vs. what is per-domain

- **Survives:** node types, `anchors`, `provenance`, `slots`, `REQUIRES`/`PART_OF`/`EXAMPLE_OF` edge semantics, confidence scoring, generation-slot mechanics.
- **Per-domain:** `domainOverlay` fields, edge link subtypes (e.g., `activates/inhibits` for biology; `authentic/plagal/deceptive` for music), threshold-concept heuristics, and the generation-slot cognitive move (e.g., `source-question` for history, `notation-map` for music, `execute-step` for physical skill).

### Review lens
| | |
|---|---|
| **Mechanics** | Same parser pipeline for all domains; domain classifier routes overlay only. |
| **Assumptions** | Assumes transcript quality and that one chunk contains a complete thought. Breaks when speakers are elliptical or use heavy jargon. |
| **Presentation** | Type badges (`MECHANISM`, `PROCEDURE`) and domain badges on concept cards; overlay shown in an "Advanced" fold. |
| **Intuitiveness** | Badges are self-evident; overlay fields require domain knowledge, so hide them behind a toggle. |

---

# 2. Prerequisite / Dependency Edges

## From a single transcript

1. **Chunk-level extraction:** LLM extracts nodes + candidate `REQUIRES`/`PROCEDURE_STEP` edges per ~8-minute chunk, returning an **evidence quote** and a `0–1` confidence for each edge.
2. **Temporal rule:** If node B is introduced in chunk *j* and explicitly references node A introduced in chunk *i* where *i < j*, create a candidate `A → B` edge.
3. **Lexical markers:** Boost confidence when quotes contain "first," "before X," "you need Y to do X," "because of X," "given X," "since X."
4. **Procedure ordering:** For `PROCEDURE` nodes, `PROCEDURE_STEP` edges are ordered by segment timestamp, not by semantic inference.
5. **Merge:** Across chunks, collapse edges whose source/target fingerprints match and average confidence.

## Across videos in the library

1. Build a global `conceptRegistry.json`.
2. When a new video is analyzed, fingerprint each node and match to existing registry entries (see §3).
3. If existing node X appears as a prerequisite in the new video's graph, create edge `X → newVideoGoal`.
4. Propagate confidence: multiple videos supporting the same prerequisite edge increases its weight.
5. Detect cycles and flag them for review; never auto-infer cycles into the canonical graph.

## Failure modes of LLM-inferred prerequisites

| Failure | Mitigation |
|---|---|
| Hallucinates a dependency | Require evidence quote; hide edges with confidence < 0.6 |
| Correlation → causation | Prefer temporal "used before" over "causes" unless explicit causal language |
| Over-connectivity | Limit out-degree per node; prune weak edges |
| Missing implicit prerequisites (e.g., arithmetic for physics) | Seed known ontologies: Wikipedia, MeSH, UBERON, MusicBrainz; flag "assumed background" |
| Same word, different meaning (false friends) | Domain classifier + user merge queue |
| Cycles | Cycle detection + manual adjudication |

### Review lens
| | |
|---|---|
| **Mechanics** | Edges are inferred from quotes and temporal order; library graph builds transitively. |
| **Assumptions** | Assumes linear teaching order and that prerequisites are verbalized. Breaks in non-linear documentaries and tacit skill demonstrations. |
| **Presentation** | Show edges under concept cards as "You'll need this for…" and "Examples of this"; keep low-confidence edges dashed. |
| **Intuitiveness** | Dashed = "maybe"; solid = "confirmed" is learnable without onboarding. |

---

# 3. Cross-Video Concept Identity

## Same node vs. related node

- **Same node:** identical canonical meaning, different context or phrasing. Merged into one node with aliases and multiple anchors.
- **Related node:** different meaning, connected by an edge (e.g., "World War I" same-as "WWI"; "Treaty of Versailles" related-to "World War I" via `CAUSES`).

## Practical resolution strategy (local-first, JSON files)

1. **Fingerprint:** `lowercase(lemmatized label)` + `first sentence of summary` + `domain`.
2. **Match tiers:**
   - **Auto-merge (exact):** identical fingerprint + same domain + overlapping evidence quote.
   - **Candidate queue:** similarity ≥ 0.85 (cosine of local embeddings or Jaccard of n-grams).
   - **Never auto-merge:** threshold concepts, `BOUNDARY` nodes, safety-critical physical-skill nodes.
3. **Registry:** `conceptRegistry.json` stores canonical nodes; per-video graphs reference registry IDs.
4. **User adjudication:** "Review merges" rail with two actions: `Merge` (alias) or `Link` (create edge).
5. **External anchors:** allow user to paste a Wikipedia/MeSH/UBERON/MusicBrainz URI to force identity.

### Review lens
| | |
|---|---|
| **Mechanics** | Fingerprint matching + user queue; no heavy vector DB. |
| **Assumptions** | Assumes speakers use consistent terminology. Breaks with synonyms and evolving definitions across a series. |
| **Presentation** | Merge suggestions appear as a notification badge on the concepts rail; show both definitions side-by-side. |
| **Intuitiveness** | "These look the same — combine?" is obvious; default to "Link" if the user ignores the suggestion. |

---

# 4. Recomposition Artifact: Lesson as Ordered Graph Walk

```json
{
  "id": "lesson_<sha256>",
  "kind": "lesson",
  "title": "string",
  "objective": "string",
  "sourceGraph": "graph_id",
  "createdFrom": ["video_id_1", "video_id_2"],
  "orderedWalk": [
    {
      "stepIndex": 0,
      "nodeId": "n_...",
      "enterEdge": "e_...",
      "mode": "INTRODUCE | REINFORCE | TEST | BRIDGE",
      "instruction": "Watch 0:00–2:05, then answer the slot before continuing.",
      "timeBudget": 120,
      "slotId": "slot_..."
    }
  ],
  "generationSlots": [
    {
      "id": "slot_...",
      "nodeId": "n_...",
      "bloomLevel": "understand | apply | analyze | evaluate | create",
      "cognitiveMove": "predict | explain | compare | apply | boundary-test | source-question | notation-map | execute-step | elaborate",
      "prompt": "Before the instructor explains X, predict what happens when Y is added.",
      "expectedShape": "1-2 sentences",
      "mediaCue": { "segment": [120, 150], "type": "pause-before" },
      "learnerAnswer": null,
      "modelRubric": "string",
      "attempts": [],
      "evaluation": "pending | self | llm"
    }
  ],
  "learnerContributions": {
    "notes": ["note_id"],
    "answers": ["slot_id"],
    "newNodes": ["node_id"],
    "newEdges": ["edge_id"],
    "revisions": [{ "nodeId": "...", "diff": "..." }]
  }
}
```

## How learner contributions attach

- **Answers:** stored in `generationSlots[i].learnerAnswer` and `attempts`; linked to the node via `node.slots`.
- **Notes:** existing bubbles are attached to the nearest node via `node.contributions`.
- **New nodes/edges:** user can create a `node`/`edge` from a note; it enters the registry and the lesson's `learnerContributions`.
- **Revisions:** user edits create a new `revision` record; the canonical extracted body remains immutable, but the UI shows the latest user layer.
- **Generation effect guard:** the engine never auto-fills answers; it generates the *question*, the learner generates the *answer*.

### Lesson generation logic

1. Start from the video's terminal goal node(s).
2. Walk backward over `REQUIRES`/`PROCEDURE_STEP` edges to produce a topologically sorted prerequisite chain.
3. Insert `BRIDGE` steps between disconnected sub-graphs.
4. Attach a generation slot to every non-trivial node, targeting Bloom levels above `remember` (apply/analyze/evaluate).
5. For threshold concepts, insert a `REINFORCE` step after a delay.
6. Allow user to save the generated walk as a `lesson` or regenerate it after adding notes/new nodes.

### Review lens
| | |
|---|---|
| **Mechanics** | Lesson = topologically sorted graph walk + one active-recall slot per node. |
| **Assumptions** | Assumes the graph is accurate and that one goal node exists. Breaks in meandering videos or when the LLM misses the objective. |
| **Presentation** | New "Study Path" rail tab showing the walk; slots pop up as inline cards at their media cue. |
| **Intuitiveness** | A linear path is easy to follow; the graph view is optional. "Answer before you watch" is a simple, discoverable pattern. |

---

# 5. Ranked Recommendations: P0 / P1 / P2

## P0 — High learning leverage, low build effort

### 1. Typed extraction prompt with domain classifier
- **Change:** Update the Analyze prompt to (a) classify domain, (b) emit typed nodes (`CLAIM`, `MECHANISM`, `PROCEDURE`, `EXAMPLE`, `BOUNDARY`, `RELATION`), (c) include evidence quotes.
- **UI:** Add type badges and domain badges to concept cards.
- **Leverage:** Converts generic extraction into structured, reusable knowledge; unlocks every downstream feature.

### 2. Generation slots on concept cards
- **Change:** Add a "Test yourself" button to each concept card; open a prompt slot.
- **Cognitive moves:** `predict`, `explain`, `compare`, `elaborate`.
- **UI:** Slot card slides over the player at the media cue; answer is saved before the video resumes.
- **Leverage:** Directly implements the generation effect and elaborative interrogation; pushes Bloom level from remember/understand to apply/analyze.

### 3. Simple linear "Study Path" rail
- **Change:** Use temporal order and `PROCEDURE_STEP` edges to build an ordered walk.
- **UI:** New rail tab "Path" showing lesson steps; click to seek.
- **Leverage:** Reduces split-attention / cognitive load by giving the learner a single coherent sequence.

### 4. Concept merge queue
- **Change:** `conceptRegistry.json` + fingerprint matching.
- **UI:** "Review merges" badge on concepts rail; side-by-side diff.
- **Leverage:** Enables cross-video synthesis without heavy infrastructure.

## P1 — Medium effort, strong leverage

### 5. Edge inference with confidence + evidence
- **Change:** LLM extracts `REQUIRES`/`EXAMPLE_OF`/`PART_OF` edges per chunk with evidence quotes and confidence scores.
- **UI:** Edges appear under concept cards as "Need this for…" / "Examples of this."
- **Leverage:** Prerequisite graph is the foundation of recomposition and interleaving.

### 6. Domain overlay schemas
- **Change:** Implement `domainOverlay` JSON for biology, history, music, physical skill.
- **UI:** "Advanced" fold on concept cards; used to generate domain-specific slots (e.g., `source-question` for history, `notation-map` for music).
- **Leverage:** Honors domain epistemologies; history sourcing and music notation↔sound mapping cannot be represented generically.

### 7. Threshold concept tagging
- **Change:** LLM flags concepts that are transformative, irreversible, integrative, bounded, troublesome.
- **UI:** Warning badge + "This idea unlocks later material" banner; extra reinforcement slot inserted.
- **Leverage:** Targets the material most likely to cause confusion.

## P2 — Higher effort, high but deferred leverage

### 8. Library-level prerequisite graph
- **Change:** Cross-video transitive closure of `REQUIRES` edges; cycle detection; Bayesian confidence update.
- **UI:** Global "Prerequisite map" view.
- **Leverage:** Enables true interleaving and personalized review paths across a whole corpus.

### 9. Automated multi-video lesson composer
- **Change:** Given a target concept, query the library graph to assemble a lesson from the best-prerequisite video segments.
- **UI:** "Create lesson from library" button.
- **Leverage:** Highest form of recomposition; allows learner to contribute new nodes/edges back to the community layer.

### 10. SRS ↔ graph slot integration
- **Change:** Feed generation-slot answers into the existing Review mode as cards.
- **UI:** Review cards now include the original concept node link; answer attempts update the SM-2 ladder.
- **Leverage:** Closes the loop between decomposition, active recall, and spaced repetition.
