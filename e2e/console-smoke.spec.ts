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

    // --- 2b. Click-to-pause on the footage (standard player behavior) -------
    // Click off-center so no floating pane can intercept; toggle back to
    // paused so the 14s fixture can't run out mid-test (the exhale overlay
    // would cover later interactions).
    await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await video.click({ position: { x: 40, y: 200 } });
    await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
    await video.click({ position: { x: 40, y: 200 } });
    await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

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
    // the frame that its bottom-right grip overlaps PlayerChrome's bottom
    // control scrim, which is deliberately painted ABOVE the pane layer.
    // The scrim's box used to be `pointer-events: auto` wholesale while
    // paused, which silently ate this grip's clicks — that's fixed now
    // (PlayerChrome.module.css: only the scrim's content rows opt in), but
    // the reposition stays so this step keeps testing the grip itself in
    // clear space, independent of the scrim's hit-region shape.
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

  // Phase 8 (design/EXECUTION-PLAN-post-review-v1.md) "Document mode": the
  // fixture project's domain is physical_skill (not clinical), so console
  // stays the default surface on load — this test drives the explicit
  // toggle. Covers: toggle to document mode -> units listed -> click an
  // anchor -> video seeks -> toggle back to console.
  test("document mode: toggle -> units listed -> anchor click seeks -> toggle back to console", async ({ page }) => {
    await page.goto("/#/library");
    await page.getByRole("button", { name: /Study Loop Smoke Fixture/ }).click();
    await expect(page).toHaveURL(/#\/study\//);

    const video = page.locator("video");
    await expect(video).toBeVisible();

    // Console is the domain default for this fixture (physical_skill) — the
    // pane-engine-only "Edit layout" corner control is present.
    const editLayoutBtn = page.getByRole("button", { name: "Edit layout" });
    await expect(editLayoutBtn).toBeVisible();
    await expect(page.getByRole("region", { name: "Document" })).toHaveCount(0);

    // --- Toggle to Document via the Session cabinet's Surface group ---------
    await page.getByRole("button", { name: "Session cabinet" }).click();
    const surfaceGroup = page.getByRole("group", { name: "Surface" });
    await expect(surfaceGroup).toBeVisible();
    await surfaceGroup.getByRole("button", { name: "Document", exact: true }).click();
    // Close via the panel's own Close button (not the edge handle — the open
    // panel is pinned over the top of the stage and intercepts clicks on the
    // handle underneath it) so it doesn't sit over the document list below.
    await page.getByRole("button", { name: "Close" }).click();

    // --- Document mode: pane engine gone, the document region lists every unit ---
    await expect(editLayoutBtn, "no pane engine in document mode — the corner Edit-layout control isn't rendered").toBeHidden();
    const documentRegion = page.getByRole("region", { name: "Document" });
    await expect(documentRegion).toBeVisible();
    await expect(documentRegion.getByText("Underhook controls the far hip")).toBeVisible();
    await expect(documentRegion.getByText("Frame prevents hip escape")).toBeVisible();
    await expect(documentRegion.getByText("Step through to mount")).toBeVisible();
    // 3 fixture units, none attested yet.
    await expect(documentRegion.getByText("0 / 3 attested")).toBeVisible();

    // The video is still mounted and playable, just demoted to a corner PiP.
    await expect(video).toBeVisible();

    // --- Click the "Frame" unit's timestamp anchor (t=6s) — seeks to t-3 = 3s ---
    const beforeSeek = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(beforeSeek).toBeLessThan(2);
    await documentRegion.getByRole("button", { name: "0:06" }).click();
    await expect
      .poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
        message: "clicking the unit's timestamp anchor should seek the (still-mounted, PiP'd) video",
      })
      .toBeGreaterThan(2.5);

    // --- Toggle back to Console: document region gone, pane engine back ------
    await page.getByRole("button", { name: "Session cabinet" }).click();
    await surfaceGroup.getByRole("button", { name: "Console", exact: true }).click();
    await page.getByRole("button", { name: "Close" }).click();

    await expect(page.getByRole("region", { name: "Document" })).toHaveCount(0);
    await expect(editLayoutBtn, "toggling back to console restores the pane-engine corner control").toBeVisible();
    const conceptPane = page.locator('[data-pane="concept"]');
    await editLayoutBtn.click();
    await expect(conceptPane, "console mode's pane engine is fully functional again after the round trip").toBeVisible();
  });
});
