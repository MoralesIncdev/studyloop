===== PRODUCTSTRATEGIST =====
As a Product Strategist, my core thesis for StudyLoop is this: **Trust in a study tool is built on cognitive ease.** If a user feels overwhelmed by the UI, they don't just abandon the tool; they feel like they are bad at learning. 

Right now, the Study Loop is suffering from a "kitchen sink" presentation. By trying to show the video, transcript, CC overlays, concept ticker, bubbles rail, and long notes simultaneously, we are violating Mayer’s split-attention principle. We are optimizing for a power-user dashboard rather than an activation moment.

Here is the application of the review lens to the Study Loop cluster, focused on what builds user trust vs. what adds cognitive friction.

---

### 1. The Notation Modal & Auto-Capture (Frame-grab + Quote)
**The User Experience:** The user hits 'N', the video pauses, and a modal pops up with a screenshot and transcript quote already captured. They write a note and hit save. 

**The Learning Lens & The Generation Effect:**
You correctly flagged the risk here: auto-capture steals the "generation effect." If the app does the work of extracting the context, the user’s brain doesn’t have to encode it, drastically weakening memory formation. 
*   **What builds trust:** The *speed* of capture. Users trust tools that get out of the way.
*   **What adds complexity:** Assuming users know *what* to write. Blank text boxes are intimidating. 
*   **The Fix (Scaffolds):** Force the generation effect by changing the UI. The auto-captured quote/screenshot should be greyed out as "Reference Material." The text box should feature an inline, rotating prompt: *"Capture insight: Why does this matter?"* or *"How does this connect to what you just watched?"* This transforms a passive filing cabinet into an active learning tool (elaborative interrogation).

### 2. Split-Attention: Video + Transcript + CC + Concept Ticker
**The User Experience:** A user watches a BJJ instructional. They see the video, the scrolling transcript, the subtitles, and concept cards sliding in. 

**The Learning Lens (Cognitive Load Theory):**
This is an extraneous cognitive load nightmare. If the user is reading the transcript or a concept card, they are missing the visual-motor demonstration in the video (fatal for BJJ or Biology).
*   **What builds trust:** Progressive disclosure. Showing the user *only* what they need at that exact second.
*   **What adds complexity (Flagged for User Education):** The Concept Ticker. Having concept cards slide in over a video requires user education. Users don't know whether to read the card, watch the video, or pause. 
*   **The Fix (Timing & Presentation):** Decouple the modalities. 
    *   *When paused:* Show everything. The user is in "study" mode.
    *   *When playing:* Hide the transcript and long notes. Keep only the video and minimal CC.
    *   *Concept Ticker:* Instead of sliding *over* the video (obscuring the visual), concepts should appear as a subtle, non-clickable "chip" in the bottom margin (like YouTube's chapter markers). The user's eye naturally tracks to the video, and they register the concept peripherally.

### 3. Bubbles Rail & Long Notes
**The User Experience:** The user takes notes, and they appear as little time-anchored tokens in a rail. 

**The Learning Lens:**
*   **Assumptions:** This assumes the user understands how to synthesize. Left alone, users will just transcribe the video. Transcription is low-level cognitive work (Bloom's: Remember).
*   **The Fix (Scaffolds):** Use Cornell-style philosophy. When the user clicks the "Compile" button, don't just dump the notes chronologically. Add a prompt at the top of the compiled doc: *"Before reviewing your notes, write a 2-sentence summary of this video's main argument."* This pushes the user up Bloom's taxonomy to Understand/Evaluate without forcing a clunky UI during the watch phase.

---

### Ranked Recommendations (Learning Leverage / Build Effort)

**P0: Playback Cognitive Purge (High Leverage / Low Effort)**
*   **Mechanics:** When the video is playing, automatically fade out the Transcript pane and hide the Concept Ticker cards. When the video is paused (via spacebar or 'N'), snap the Transcript and Notes back into full opacity. 
*   **Why:** Immediately solves split-attention issue. Requires no data-model changes, just a CSS state toggle tied to `<video>` play/pause events.

**P1: Notation Elaborative Prompts (High Leverage / Medium Effort)**
*   **Mechanics:** In the 'N' Notation modal, separate the auto-captured quote/screenshot from the user input. Add ghost-text (placeholder) prompts that rotate based on context (e.g., *"The mechanism here is..."*, *"This contrasts with..."*).
*   **Why:** Reclaims the generation effect. Prevents the tool from becoming a passive digital filing cabinet. 

**P2: Concept Ticker Repositioning (Medium Leverage / Low Effort)**
*   **Mechanics:** Move the concept ticker cards from "sliding over the video" to residing *underneath* the player progress bar, styled like chips. If clicked, they expand. Otherwise, they are passive signals.
*   **Why:** Removes the need to educate the user on what to do when a card pops up. Keeps the visual plane entirely dedicated to the video content.

***

**PRODUCT CALL:** 
ANTI-FEATURE: Kill the "auto-pop up" behavior of the Concept Ticker over the video during playback. It forces split-attention and requires user education to understand. Keep the concepts anchored in the rail and the heatmap.
FEATURE: Implement **State-Aware UI (P0)**. The app must actively hide text-based UI elements (transcripts, tickers) while the video is playing, and reveal them only when the user pauses to take a notation. Build trust by managing the user's cognitive ceiling, not by giving them more features to look at.

===== KNOWLEDGEGRAPHARCHITECT =====


===== SCIENTIFICEDITOR =====
**Evidence quality grade for the “Study Loop” cluster: MODERATE — with STRONG evidence for the individual multimedia principles, but WEAK-to-MODERATE evidence that the current bundle improves learning in long-form, domain-rich video (especially BJJ).**

- **STRONG** support: cognitive load / split-attention and redundancy effects (Mayer, Sweller, Moreno; large bodies of controlled experiments), and retrieval practice/spaced repetition (Agarwal et al., Dunlosky et al. 2013).  
- **MODERATE** support: note-taking scaffolds and generation effect in verbal and static learning materials; less direct evidence in video/skill domains.  
- **WEAK/INSUFFICIENT** support: using “furthest watched position” as a proxy for concept mastery, and assuming auto-captured screenshots/quotes produce the same learning as self-generated notes.  
- **Major caveat**: almost all of this evidence comes from short, controlled instructional materials, not 45–90 minute BJJ instructionals or lecture-length documentaries. Transfer to real skill acquisition is a leap.

---

## 1. Review lens per feature

### A. Player + synced transcript + CC overlay
**MECHANICS**  
Video + clickable transcript + auto-scroll + a CC-style text overlay on top of the video. YouTube-native surface; zero onboarding for playback.

**ASSUMPTIONS**  
- The transcript is accurate enough to trust. For BJJ this is fragile: Portuguese terms, named positions, and slang are often mis-transcribed.  
- Two redundant text streams (transcript pane + CC overlay) help rather than hurt. Multimedia

===== UIUXDESIGNER =====
**INFORMATION ARCHITECTURE**

The Etceutica Advisory Council is a multi-agent LangGraph system, but to the operator (Ryan), it is a strategic telemetry dashboard. The IA prioritizes graph execution visibility and rapid extraction of decisions, treating the StudyLoop context as the active payload.

*   **Global Header (System State):** persistent visibility of session status, active LangGraph nodes, and global controls.
*   **Left Rail (Payload & History):** The injected context (StudyLoop features, cognitive load constraints) and a dense, chronological list of past session JSONs.
*   **Main Canvas (Center):** The CEO Synthesis. This is the primary directive. It parses the raw LLM output into a structured, scannable matrix of decisions regarding the StudyLoop product.
*   **Right Rail (Telemetry & Agents):** The raw execution stream of the up-to-12 advisors. Grouped by function (Strategy, Engineering, Red Team). 

**LAYOUT SPEC**

*   **Theme:** Dark background (`#0A0A0A`), high-contrast text (`#E0E0E0`), monospace typography (`JetBrains Mono` or `IBM Plex Mono`). Syntax highlighting colors for data extraction (e.g., Yellow for P0, Cyan for P1).
*   **Grid:** 3-column layout. `grid-template-columns: 260px 1fr 1fr;`
*   **Top-Left Control:** The `[ + NEW SESSION ]` button is pinned to the absolute top-left, directly above the Left Rail. 
*   **Center Panel (The Directive):** Zero conversational AI filler. The CEO output is stripped of "Greetings Ryan" and rendered as structured data blocks. The StudyLoop feature review (Player, Notation Bubbles, Concept Ticker) is rendered as a priority matrix (P0/P1/P2) based on the CEO's synthesis.
*   **Right Panel (The Graph):** A vertical stack of terminal-style nodes representing the advisors. No bubbles, no avatars. Just `AGENT_NAME :: STATUS :: LATENCY`.

**COMPONENT INVENTORY**

*   **`<SessionStateBadge />`** (Top Header)
    *   *States:* `IDLE` (Grey), `RUNNING [4/12]` (Pulsing Yellow), `SYNTHESIS` (Cyan), `COMPLETE` (Green), `ERROR` (Red).
*   **`<PayloadDigest />`** (Left Rail)
    *   *Function:* Ingests the submitted topic/question. Renders high-density keyword chips extracted from the StudyLoop prompt (e.g., `[SPLIT_ATTENTION]`, `[GENERATION_EFFECT]`, `[BLOOMS_TAXONOMY]`). 
*   **`<DirectiveMatrix />`** (Center)
    *   *States:* `Empty` (pre-run), `Parsing` (active session), `Ranked` (complete).
    *   *Function:* Maps the CEO's final directive. For the StudyLoop session, it outputs a table: `Feature` (e.g., Auto-Screenshot) -> `Intervention` (e.g., Make opt-in) -> `Priority` (P0).
*   **`<AgentStreamBlock />`** (Right Rail)
    *   *States:* `WAITING` (collapsed, 1 line), `THINKING` (pulsing block cursor), `STREAMING` (monospace text flowing, auto-scroll disabled if user scrolls up), `COMPLETE` (static text, highlighted entities).
*   **`<EntityCrossReference />`** (Global)
    *   *Function:* Hovering over a keyword in the CEO's directive (e.g., "Cognitive Load") instantly highlights where the RedTeam or ProductStrategist addressed it in the Right Rail.

**UX PRINCIPLES**

1.  **Parse, Don't Chat:** A 12-agent LangGraph system generates massive text. The UI must automatically extract structural elements (like the requested P0/P1/P2 rankings) into tables. Raw conversational output is demoted to a collapsible terminal view.
2.  **Entity-Gated Navigation:** The StudyLoop prompt relies on dense academic frameworks (Mayer's multimedia principles, Bjork's desirable difficulties). The operator must be able to click a framework name and see the exact intersection of all 12 advisors' comments on that specific framework.
3.  **State-Supremacy:** Multi-agent graphs hang. The transition from "RedTeam analyzing" to "SystemsArchitect analyzing" must be immediately recognizable via color and layout shifts without requiring a full page reload. 
4.  **Absolute Destructive Control:** Running a 12-agent deep-dive burns compute and time. A highly visible `[ HALT GRAPH ]` terminal command must be accessible at all times to kill a runaway session (e.g., if RedTeam gets stuck in a loop).

**DATA REQUIREMENTS**

*   **Source:** `~/.openclaw/council/sessions/*.json`
*   **Graph State:** Extract `current_node` and `active_agents` array to populate the `<SessionStateBadge />`.
*   **Input Payload:** Extract `topic` ("studyloop-studyloop") and parse `question` to populate the `<PayloadDigest />`.
*   **CEO Synthesis Data:** Regex-compute the final output string to identify priority tags (`P0`, `P1`, `P2`) and feature names (`Player`, `Bubbles`, `Ticker`) to feed the `<DirectiveMatrix />`.
*   **Agent Data:** Map `agent_name` to raw output text. Compute a 1-line summary via regex (first sentence or first bullet point) for the collapsed `<AgentStreamBlock />` state.

**UX CALL:** 
Treat the UI as a high-frequency stock ticker for AI logic—by regex-parsing the StudyLoop academic frameworks and P0/P1/P2 priorities out of the raw text streams into a scannable matrix, we prevent the operator from having to read 10,000 words of LLM dialogue to find the single architectural directive they need.
