===== PRODUCTSTRATEGIST =====
As a Product Strategist, my core lens is user psychology, activation, and building undeniable trust. Even though my home turf is Etceutica (arbiting truth in supplements), the underlying product thesis translates perfectly to StudyLoop: **Users don't want a "digital filing cabinet" or a complex cognitive science dashboard. They want a trusted learning partner that does the heavy lifting of parsing information, ends their anxiety about missing key concepts, and makes them feel smart.** 

If we over-engineer the UI with Bloom's Taxonomy or Novak concept maps, we fail. The user will bounce. The engine must do the decomposition invisibly, rendering only high-trust, intuitive artifacts.

Here is how we design the Analyze engine’s v3 decomposition and recomposition architecture.

### 1. Domain Detection & Per-Domain Schemas
**(1) What the user experiences:** The user pastes a YouTube link (e.g., a history documentary). They hit "Analyze." Ten seconds later, the rail doesn't just say "Themes" and "Pearls"—it intuitively frames the breakdown into "Causation Chains" and "Sources." The user thinks, *"Wow, this app actually understands what I'm studying."*
**(2) What builds trust vs. complexity:** Silent, automatic domain detection builds massive trust. Forcing the user to select a "Study Mode" (e.g., clicking a "Biology" button) adds friction and feels like configuration. 

**Prompt Architecture & Schemas (Under the hood):**
The v3 prompt needs a two-pass system. 
*   **Pass 1 (Router):** A cheap, fast LLM call that reads the transcript and categorizes the domain into one of four epistemological buckets.
*   **Pass 2 (Extractor):** A domain-specific prompt that extracts the correct "unit of knowledge."

*   **Physical Skill (BJJ):** Unit = *Procedure + Constraint*. Schema: `Goal`, `Mechanical Leverage`, `Trigger/Reaction`, `Common Failure`.
*   **Biology/Systems:** Unit = *Mechanism*. Schema: `Component`, `Action`, `Interaction`, `System Level`.
*   **History:** Unit = *Causation + Context*. Schema: `Event`, `Driver`, `Evidence/Source`, `Consequence`.
*   **Music/Math:** Unit = *Rule/Schema*. Schema: `Principle`, `Application Condition`, `Worked Example`.

### 2. The Universal Spine vs. Domain Overlays
**(1) What the user experiences:** A unified visual language across all subjects. Whether studying BJJ or Biology, a concept card always looks the same: A claim, how it works, and when it breaks. 
**(2) Trust vs. Complexity:** The universal spine ensures zero learning curve. Domain-specific terms stay in the text, not the UI chrome. 

**The Universal Spine Schema (The "Etceutica" approach to learning):**
Just like evaluating a supplement claim (Claim -> Evidence -> Boundary), every concept extracted by the AI should follow a universal structure:
1.  **The Core Claim/Definition** (What is it?)
2.  **The Mechanism/Causation** (How does it work? *This is where the domain lens applies*)
3.  **The Application/Example** (Where do I use it?)
4.  **The Boundary Condition** (When does this *not* work? e.g., "This BJJ choke fails if the opponent's back is flat.")

**Flag:** *Do not build an interactive node-graph UI.* Concept mapping (Novak) is scientifically sound but universally fails in consumer products because users don't want to arrange nodes. Render the "graph" as a linear, prerequisite-ordered list.

### 3. The Recomposition Artifact ("The Lesson")
**(1) What the user experiences:** The user hits "Compile." Instead of just a dump of their notes, they receive a structured "Lesson Brief" that reads like a masterclass syllabus.
**(2) Trust vs. Complexity:** If the AI just gives them the answers, it creates a "digital filing cabinet" (passive). To create retention (active), the artifact must include **desirable difficulties** and leverage the **generation effect**.

**How the learner contributes (Prompt Design):**
The generated lesson must have "intentional blanks." 
Instead of the AI writing: *"The knee cut works by driving the knee across the thigh."*
The Compile artifact renders: *"To execute the knee cut, the primary point of mechanical leverage is [ Fill in your note here ]."*
The learner *must* interact with the artifact to complete it. 

### 4. Feeding Existing Surfaces
How the v3 engine integrates into the current UI without adding features:

*   **Rail (AI Breakdown):** Rename generic "Concepts" dynamically based on the domain detected. If History, the rail groups items by "Causation Chains." If BJJ, by "Techniques/Mechanics."
*   **Ticker/Timeline:** Introduce *Signaling* (Mayer's principles). Instead of just diamonds for Pearls, use subtle color-coding to signal the type of knowledge chunk (e.g., Yellow = Definition, Blue = Application, Red = Boundary/Warning). *Warning: Requires 1 line of legend in the UI; test carefully to ensure it doesn't require education.*
*   **Review Mode (SRS):** Fix the "Generation Effect" problem. Currently, the AI auto-generates cards, stealing the user's generative work. Change the prompt so the AI creates *Fill-in-the-blank* or *Elaborative Interrogation* cards (e.g., Front: "Why did the archduke's assassination cause a global war?" Back: Reveals AI summary + user's notes). 

---

### **PRODUCT CALL:** 

**Anti-feature:** Do NOT build a visual concept-map editor or expose domain settings to the user. Do NOT auto-generate 100% complete flashcards without user input. Both require user education, add UI complexity, and steal the cognitive load required for actual learning.

**P0 Feature:** **Two-Pass Domain Routing & Universal Spine.** 
Update the Analyze engine to invisibly detect the domain (History, Science, Physical Skill) and extract concepts using the Universal Spine (Claim -> Mechanism -> Example -> Boundary). Render this in the existing Rail and Cards.

**P1 Feature:** **The "Generation" Compile Artifact.** 
Update the Compile markdown output to include elaborative interrogation prompts (guiding questions) and intentional blanks that force the user to type/synthesize the answer using their own notes before revealing the AI's summary. 

**P2 Feature:** **Timeline Signaling.**
Update the heatmap/ticker to group or color-code extracted chunks based on their position in the Universal Spine (e.g., distinct markers for "Mechanics" vs "Boundary Conditions").

===== KNOWLEDGEGRAPHARCHITECT =====


===== SCIENTIFICEDITOR =====


===== UIUXDESIGNER =====
**INFORMATION ARCHITECTURE**

The interface is a single-screen, three-pane workspace designed for rapid context-switching between historical council decisions and active session monitoring. 

*   **Left Pane (The Archive):** A dense, grep-filterable list of past session JSONs. Groupable by `topic` (e.g., `studyloop-decompose`, `pricing-strategy`).
*   **Center Pane (The Theater):** The primary focus area. Split into two distinct states: *Active* (live multi-agent feed) and *Resolved* (the final synthesis and directive). 
*   **Right Pane (The Brief):** The immutable context. Displays the exact `topic` and `question` submitted, preventing the operator from losing track of the core prompt while analyzing agent outputs.
*   **Top Bar (The Command Line):** Global system status (Agent health, LangGraph API status) and the primary action: "Fire Session."

**LAYOUT SPEC**

*   **Grid:** CSS Grid layout: `280px (Left) | 1fr (Center) | 360px (Right)`. Height: `100vh`. No scrolling on the main frame; panels scroll internally.
*   **Aesthetic:** Terminal-grade. Deep matte black (`#0A0A0A`) background. High-contrast text (`#FFFFFF` for primary, `#A0A0A0` for secondary). Monospace typography (e.g., JetBrains Mono or IBM Plex Mono) for all data.
*   **Center Pane Arrangement (Resolved State):** 
    *   Top quadrant: Synthesis (CEO Directive) in a high-contrast, slightly larger font size (16px).
    *   Bottom 3/4: A 4x3 matrix grid of Advisor Cards (SystemsArchitect, ProductStrategist, RedTeam, etc.).
*   **Center Pane Arrangement (Active State):**
    *   The Advisor Cards collapse into a vertical chronological log feed (newest at bottom), showing agent status changes (e.g., `[10:42:05] RedTeam: Analyzing schema v3...`).

**COMPONENT INVENTORY**

*   **`[QuickFire_Console]`** (Top Bar)
    *   *State:* Idle (Collapsed input field). 
    *   *Interaction:* `Cmd+K` expands. Typing a topic and hitting `Enter` immediately starts a session with default parameters. 
*   **`[Session_List_Item]`** (Left Pane)
    *   *State:* Idle (Date + Topic + 1-line summary). Hover (Highlights border). Active (Left border turns amber).
    *   *Interaction:* Click loads session into Center/Right panes.
*   **`[Directive_Display]`** (Center Pane)
    *   *State:* Loading (Skeleton text). Complete (Static text with markdown rendering). Error (Red border, fallback to raw text).
    *   *Interaction:* Click-to-copy raw JSON output.
*   **`[Advisor_Node]`** (Center Pane Matrix)
    *   *State:* Idle (Dimmed). Running (Pulsing amber dot). Complete (Solid green dot). Error/Refused (Red dot). 
    *   *Interaction:* Click expands the node to a modal or side-drawer with that specific agent's raw chain-of-thought.
*   **`[Prompt_Context_View]`** (Right Pane)
    *   *State:* Static.
    *   *Interaction:* Read-only display of the exact `studyloop-decompose` question payload.

**UX PRINCIPLES**

1.  **Synthesis Supremacy:** The CEO's final directive is the only thing that matters upon resolution. It must consume the highest visual hierarchy. The multi-agent process is a means to an end, treat it as an audit log, not the main feature.
2.  **Zero-Latency Data Access:** Never use loading spinners for historical sessions. The JSONs are local and small. Pre-load the first 100 characters of the CEO synthesis into the left-pane list item so the operator can scan without clicking.
3.  **Chronological over Alphabetical:** In a live session, operator confusion stems from "who is waiting on whom?" Display active agents in a chronological event log, not an alphabetical grid, to expose the LangGraph execution graph implicitly.
4.  **Signal via Typography, Not Color:** Use bolding, indentation, and monospaced alignment to differentiate between schema definitions, prompt architecture, and directives in the text. Reserve color strictly for system state (Green = Done, Amber = Processing, Red = Error).

**DATA REQUIREMENTS**

*   **Computed on the fly:** 
    *   Time-to-synthesis (duration from session start to CEO completion).
    *   Agent participation rate (did the agent output data or abstain?).
*   **Pulled from Session JSON:**
    *   `session_id`, `timestamp`
    *   `topic` (e.g., "studyloop-decompose")
    *   `question` (The full prompt detailing the universal spine vs domain-specific overlays).
    *   `agents[]`: Name, `status`, `latency_ms`, `response_md`.
    *   `synthesis`: The final directive on analysis output schema v3, prompt architecture, and P0/P1/P2 ranking.

**UX CALL:** 

Design the interface to center the CEO's final synthesis directive while treating the 12 advisor outputs as a secondary, collapsible audit log, ensuring Ryan sees the final strategic decision before getting bogged down in the multi-agent process noise.
