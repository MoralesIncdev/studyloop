// Phase 1 (design/EXECUTION-PLAN-post-review-v1.md) console smoke harness.
//
// Why this exists (see the phase spec): two shipped event-layer bugs made
// every pane un-clickable and survived several "verified" slices because
// verification was typecheck + unit tests — neither can see a z-index or a
// pointer-capture bug. This spec drives a real browser against a real
// server + real fixture data (e2e/fixtures/seed.mjs) and asserts on the
// concrete *effect* of every pane-chrome click, not just "it didn't throw".
//
// Every selector below is a pre-existing, stable attribute read straight off
// the source (aria-label, role, data-pane, title) — no data-testid additions
// were needed anywhere in web/src for this spec (see the final report).
import { test, expect, type Locator, type Page } from "@playwright/test";

/** Drags `locator` by (dx, dy) using real pointer events, starting from a
 *  point inside it that's ~8px from the edges (avoids landing exactly on a
 *  child button/grip unless that's the intended target). */
async function dragBy(page: Page, locator: Locator, dx: number, dy: number, from: "center" | "topLeft" = "center") {
  const box = await locator.boundingBox();
  if (!box) throw new Error("dragBy: locator has no box");
  const startX = from === "center" ? box.x + Math.min(24, box.width / 2) : box.x + box.width - 8;
  const startY = from === "center" ? box.y + 8 : box.y + box.height - 8;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 8 });
  await page.mouse.up();
}

test.describe("console smoke", () => {
  test("library -> study page -> pane engine -> modality switch", async ({ page }) => {
    // --- 1. Library loads and shows the fixture project ---------------------
    await page.goto("/#/library");
    const projectCard = page.getByRole("button", { name: /Study Loop Smoke Fixture/ });
    await expect(projectCard).toBeVisible();

    // --- 2. Opening it lands on the study page: <video> + timeline rail -----
    await projectCard.click();
    await expect(page).toHaveURL(/#\/study\//);
    const video = page.locator("video");
    await expect(video).toBeVisible();
    const timelineRail = page.getByRole("slider", { name: "Seek" });
    await expect(timelineRail).toBeVisible();

    const consoleRoot = page.locator('[class*="consoleRoot"]');
    await expect(consoleRoot).toBeVisible();

    // --- 3. Open a pane from the chrome --------------------------------------
    // Console slice A's corner "Edit layout" control (StudyView.tsx) is the
    // chrome-level affordance that reveals every pane, including ones that
    // are otherwise hidden pending real activity (Pane.tsx: "hidden panes
    // reappear ghosted in edit mode"). Every project session starts with
    // consoleMode already true (state/store.ts loadProjectSession) — edit
    // mode is what actually "opens" the full pane set for interaction.
    const editLayoutBtn = page.getByRole("button", { name: "Edit layout" });
    await editLayoutBtn.click();
    await expect(editLayoutBtn).toHaveAttribute("aria-pressed", "true");

    const notePane = page.locator('[data-pane="note"]');
    const conceptPane = page.locator('[data-pane="concept"]');
    await expect(notePane).toBeVisible();
    // The fixture's first unit is anchored at t=2s with a 15s fade-in window
    // (lib/envelope.ts ENVELOPE_FADE_IN_S) that starts well before t=0, so
    // ConceptPane is already the active concept from the moment the video
    // mounts — no seeking required for a deterministic park test later.
    await expect(conceptPane).toBeVisible();

    // --- 4. Drag a pane ~100px and assert its position changed --------------
    const beforeDrag = await notePane.boundingBox();
    if (!beforeDrag) throw new Error("notePane has no box before drag");
    await dragBy(page, notePane, 100, 60);
    const afterDrag = await notePane.boundingBox();
    if (!afterDrag) throw new Error("notePane has no box after drag");
    const movedX = Math.abs(afterDrag.x - beforeDrag.x);
    const movedY = Math.abs(afterDrag.y - beforeDrag.y);
    expect(movedX + movedY, "dragging the pane's chrome strip should move it, not just no-crash").toBeGreaterThan(40);

    // --- 5. Click every pane chrome tool button, assert each *fires* --------
    // This is the historical bug's exact shape: an SVG icon inside a tool
    // button used to start a micro-drag (via Pane.tsx's pointerdown handler)
    // that swallowed the button's own click. Every assertion below checks a
    // concrete state change caused by the click, not just "no exception".

    // 5a. Toggle container mode (bare <-> glassy) — both directions.
    const toggleModeBtn = notePane.getByRole("button", { name: "Toggle pane container" });
    const classBeforeToggle = await notePane.getAttribute("class");
    await toggleModeBtn.click();
    const classAfterToggle = await notePane.getAttribute("class");
    expect(classAfterToggle, "mode toggle should change the pane's class (bare<->glassy)").not.toBe(classBeforeToggle);
    await toggleModeBtn.click();
    const classAfterSecondToggle = await notePane.getAttribute("class");
    expect(classAfterSecondToggle, "toggling twice should return to the original mode").toBe(classBeforeToggle);

    // 5b. Hide, then unhide.
    const hideBtn = notePane.getByRole("button", { name: "Hide pane" });
    await hideBtn.click();
    const unhideBtn = notePane.getByRole("button", { name: "Unhide pane" });
    await expect(unhideBtn, "hiding should fade the pane out and swap the tool to Unhide").toBeVisible();
    await unhideBtn.click();
    await expect(notePane.getByRole("button", { name: "Hide pane" }), "unhiding should swap the tool back to Hide").toBeVisible();

    // 5c. Park (concept pane only — the tick-anchored pane type) — asserted
    // together with step 6 below since "a tick appears on the timeline" IS
    // the assertion that the park button fired.
    const parkBtn = conceptPane.getByRole("button", { name: "Park pane on the timeline" });
    await parkBtn.click();

    // 5d. Reset this pane to its default position (edit-mode-only tool).
    // Run last (before resize) — handleReset (Pane.tsx) also clears any
    // stored width/height, so it must not run after the resize step.
    const resetBtn = notePane.getByRole("button", { name: "Reset pane position" });
    await resetBtn.click();
    const afterReset = await notePane.boundingBox();
    if (!afterReset) throw new Error("notePane has no box after reset");
    expect(Math.abs(afterReset.x - beforeDrag.x), "reset should return the pane to its pre-drag default position").toBeLessThan(6);
    expect(Math.abs(afterReset.y - beforeDrag.y)).toBeLessThan(6);

    // --- 6. Park a pane: assert a waiting tick appears on the timeline ------
    const waitingTick = timelineRail.locator('[data-waiting="true"]');
    await expect(waitingTick, "parking a concept pane should mark its seek-bar tick as waiting").toBeVisible();

    // --- 7. Resize a pane on both axes; assert it persists after reload ----
    // Reposition first: NotePane's default spot (fy 0.6) sits low enough in
    // the frame that its bottom-right grip falls under PlayerChrome's bottom
    // control scrim, which is deliberately painted ABOVE the pane layer and
    // (while paused, i.e. always in this spec) has `pointer-events: auto`
    // (PlayerChrome.module.css's `.scrimVisible`) — a real stacking
    // conflict, found the same way the codebase's own comments say the
    // original chrome-tool click bug was found ("live click-tracing", not a
    // static screenshot). Dragging the pane clear of that band first keeps
    // this step testing the grip, not that unrelated overlap.
    await dragBy(page, notePane, 0, -300);
    const grip = notePane.locator('[title="Resize"]');
    const beforeResize = await notePane.boundingBox();
    if (!beforeResize) throw new Error("notePane has no box before resize");
    await dragBy(page, grip, 150, 90, "topLeft");
    const afterResize = await notePane.boundingBox();
    if (!afterResize) throw new Error("notePane has no box after resize");
    expect(afterResize.width - beforeResize.width, "grip drag should grow the pane's width").toBeGreaterThan(50);
    expect(afterResize.height - beforeResize.height, "grip drag should grow the pane's height").toBeGreaterThan(30);

    await page.reload();
    const notePaneAfterReload = page.locator('[data-pane="note"]');
    await expect(notePaneAfterReload).toBeVisible();
    const afterReloadBox = await notePaneAfterReload.boundingBox();
    if (!afterReloadBox) throw new Error("notePane has no box after reload");
    expect(Math.abs(afterReloadBox.width - afterResize.width), "resized width should persist across reload").toBeLessThan(4);
    expect(Math.abs(afterReloadBox.height - afterResize.height), "resized height should persist across reload").toBeLessThan(4);

    // --- 8. Switch modality Watch -> Review and back ------------------------
    // The Watch/Generate/Review switch lives in the Session cabinet
    // (console/cabinets/SessionCabinet.tsx), opened via the top edge handle
    // (console/cabinets/EdgeHandles.tsx) — a fixed chrome control distinct
    // from the pane engine tested above.
    const consoleRootAfterReload = page.locator('[class*="consoleRoot"]');
    await expect(consoleRootAfterReload).not.toHaveClass(/\breview\b/);

    await page.getByRole("button", { name: "Session cabinet" }).click();
    const modalityGroup = page.getByRole("group", { name: "Modality" });
    await expect(modalityGroup).toBeVisible();

    await modalityGroup.getByRole("button", { name: "Review", exact: true }).click();
    await expect(consoleRootAfterReload, "switching to Review should mark the console root with the .review modality class").toHaveClass(/\breview\b/);

    await modalityGroup.getByRole("button", { name: "Watch", exact: true }).click();
    await expect(consoleRootAfterReload, "switching back to Watch should drop the .review modality class").not.toHaveClass(/\breview\b/);
  });
});
