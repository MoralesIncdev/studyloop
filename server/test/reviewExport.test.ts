import { describe, expect, it } from "vitest";
import {
  buildReviewExportCsv,
  buildReviewExportRows,
  cardFrontBack,
  csvEscapeField,
  REVIEW_EXPORT_HEADER,
  serializeReviewExportCsv,
  toCsvLine,
  toExportRow,
  type ReviewExportRow,
} from "../src/lib/reviewExport.js";
import { emptyReviewState, introduceCardState, type ReviewCard, type ReviewState } from "../src/lib/review.js";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");

function bubbleCard(overrides: Partial<Extract<ReviewCard, { kind: "bubble" }>> = {}): ReviewCard {
  return {
    id: "bubble:p1:b1",
    kind: "bubble",
    projectId: "p1",
    projectTitle: "Gordon Ryan Half Guard",
    sourceType: "local",
    sourcePath: "/videos/gordon.mp4",
    t: 30,
    text: "Underhook first",
    shot: null,
    ...overrides,
  };
}

function pearlCard(overrides: Partial<Extract<ReviewCard, { kind: "pearl" }>> = {}): ReviewCard {
  return {
    id: "pearl:p1:60",
    kind: "pearl",
    projectId: "p1",
    projectTitle: "Gordon Ryan Half Guard",
    sourceType: "youtube",
    sourceVideoId: "abc123",
    t: 60,
    label: "Frame early",
    insight: "Get the frame before they settle.",
    importance: 2,
    ...overrides,
  };
}

function unitCard(overrides: Partial<Extract<ReviewCard, { kind: "unit" }>> = {}): ReviewCard {
  return {
    id: "unit:p1:u1",
    kind: "unit",
    projectId: "p1",
    projectTitle: "Gordon Ryan Half Guard",
    sourceType: "local",
    sourcePath: "/videos/gordon.mp4",
    t: 120,
    unitType: "MECHANISM",
    label: "Why the underhook matters",
    summary: "The underhook controls the far side's hips.",
    userTake: null,
    threshold: false,
    ...overrides,
  };
}

function clusterMemberCard(overrides: Partial<Extract<ReviewCard, { kind: "clusterMember" }>> = {}): ReviewCard {
  return {
    id: "unit:p1:u2::m0",
    kind: "clusterMember",
    projectId: "p1",
    projectTitle: "Gordon Ryan Half Guard",
    sourceType: "local",
    sourcePath: "/videos/gordon.mp4",
    t: 200,
    unitId: "unit:p1:u2",
    memberIndex: 0,
    clusterLabel: "Guard retention checklist",
    label: "Frame",
    body: "Keep an elbow-to-knee frame at all times.",
    ...overrides,
  };
}

describe("csvEscapeField", () => {
  it("leaves a plain field untouched", () => {
    expect(csvEscapeField("Underhook first")).toBe("Underhook first");
  });

  it("quotes a field containing a comma", () => {
    expect(csvEscapeField("front, back")).toBe('"front, back"');
  });

  it("quotes a field containing a double quote and doubles it", () => {
    expect(csvEscapeField('she said "go"')).toBe('"she said ""go"""');
  });

  it("quotes a field containing an embedded newline", () => {
    expect(csvEscapeField("line one\nline two")).toBe('"line one\nline two"');
  });

  it("quotes a field containing an embedded carriage return", () => {
    expect(csvEscapeField("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  it("doubles multiple embedded quotes", () => {
    expect(csvEscapeField('"a" and "b"')).toBe('"""a"" and ""b"""');
  });
});

describe("toCsvLine / serializeReviewExportCsv", () => {
  it("joins escaped fields with commas and terminates with CRLF", () => {
    expect(toCsvLine(["a", "b, c", "d"])).toBe('a,"b, c",d\r\n');
  });

  it("always emits the header row, even for an empty queue", () => {
    const csv = serializeReviewExportCsv([]);
    expect(csv).toBe(toCsvLine(REVIEW_EXPORT_HEADER));
    expect(csv.trim().split("\r\n")).toEqual(["front,back,tags,due"]);
  });

  it("emits one data row per export row, after the header", () => {
    const rows: ReviewExportRow[] = [
      { front: "Q1", back: "A1", tags: "project:demo", due: "2026-07-01T00:00:00.000Z" },
      { front: "Q2", back: "A2, with a comma", tags: "project:demo domain:biology", due: "2026-07-02T00:00:00.000Z" },
    ];
    const csv = serializeReviewExportCsv(rows);
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[0]).toBe("front,back,tags,due");
    expect(lines[1]).toBe("Q1,A1,project:demo,2026-07-01T00:00:00.000Z");
    expect(lines[2]).toBe('Q2,"A2, with a comma",project:demo domain:biology,2026-07-02T00:00:00.000Z');
  });
});

describe("cardFrontBack", () => {
  it("bubble: falls back to raw text/prompt when untransformed", () => {
    const { front, back } = cardFrontBack(bubbleCard());
    expect(front).toBe("What was your note here?");
    expect(back).toBe("Underhook first");
  });

  it("bubble: prefers the transformed front/back when present", () => {
    const { front, back } = cardFrontBack(
      bubbleCard({ transformed: { front: "What controls the hips?", back: "The underhook.", why: "" } })
    );
    expect(front).toBe("What controls the hips?");
    expect(back).toBe("The underhook.");
  });

  it("pearl: falls back to label/insight when untransformed", () => {
    const { front, back } = cardFrontBack(pearlCard());
    expect(front).toBe("Frame early");
    expect(back).toBe("Get the frame before they settle.");
  });

  it("unit: back includes the learner's take when present", () => {
    const { front, back } = cardFrontBack(unitCard({ userTake: "It stops the roll to mount." }));
    expect(front).toContain("Why the underhook matters");
    expect(back).toBe("The underhook controls the far side's hips.\n\nYour take: It stops the roll to mount.");
  });

  it("unit: back omits the take line when there is none", () => {
    const { back } = cardFrontBack(unitCard());
    expect(back).toBe("The underhook controls the far side's hips.");
  });

  it("clusterMember: front/back are the member's label/body", () => {
    const { front, back } = cardFrontBack(clusterMemberCard());
    expect(front).toBe("Frame");
    expect(back).toBe("Keep an elbow-to-knee frame at all times.");
  });
});

describe("toExportRow (tags)", () => {
  it("always includes a project tag, folding spaces to underscores", () => {
    const row = toExportRow(bubbleCard(), "2026-07-01T00:00:00.000Z", "");
    expect(row.tags).toBe("project:Gordon_Ryan_Half_Guard");
  });

  it("adds a domain tag only when a domain is supplied", () => {
    const row = toExportRow(bubbleCard(), "2026-07-01T00:00:00.000Z", "biology");
    expect(row.tags).toBe("project:Gordon_Ryan_Half_Guard domain:biology");
  });

  it("adds a unitType tag for unit cards", () => {
    const row = toExportRow(unitCard(), "2026-07-01T00:00:00.000Z", "biology");
    expect(row.tags).toBe("project:Gordon_Ryan_Half_Guard domain:biology unitType:MECHANISM");
  });

  it("tags a cluster member's unitType as CLUSTER", () => {
    const row = toExportRow(clusterMemberCard(), "2026-07-01T00:00:00.000Z", "");
    expect(row.tags).toBe("project:Gordon_Ryan_Half_Guard unitType:CLUSTER");
  });

  it("omits the unitType tag for bubble/pearl cards", () => {
    expect(toExportRow(bubbleCard(), "2026-07-01T00:00:00.000Z", "").tags).not.toContain("unitType:");
    expect(toExportRow(pearlCard(), "2026-07-01T00:00:00.000Z", "").tags).not.toContain("unitType:");
  });
});

describe("buildReviewExportRows / buildReviewExportCsv", () => {
  it("returns no rows (header-only CSV) for an empty queue", () => {
    expect(buildReviewExportRows([], emptyReviewState(), new Map(), NOW)).toEqual([]);
    expect(buildReviewExportCsv([], emptyReviewState(), new Map(), NOW)).toBe(toCsvLine(REVIEW_EXPORT_HEADER));
  });

  it("gives every live card a row, introducing not-yet-tracked cards as due now", () => {
    const cards = [bubbleCard(), unitCard()];
    const rows = buildReviewExportRows(cards, emptyReviewState(), new Map([["p1", "physical_skill"]]), NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0].due).toBe(new Date(NOW).toISOString());
    expect(rows[0].tags).toBe("project:Gordon_Ryan_Half_Guard domain:physical_skill");
    expect(rows[1].tags).toBe("project:Gordon_Ryan_Half_Guard domain:physical_skill unitType:MECHANISM");
  });

  it("keeps an already-tracked card's real persisted due date instead of overwriting it", () => {
    const futureDue = "2026-08-20T00:00:00.000Z";
    const priorState: ReviewState = {
      ...emptyReviewState(),
      cards: { "bubble:p1:b1": { ...introduceCardState(NOW), due: futureDue, interval: 30 } },
    };
    const rows = buildReviewExportRows([bubbleCard()], priorState, new Map(), NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].due).toBe(futureDue);
  });

  it("does not mutate/persist state — export is read-only regardless of how many live cards exist (no daily-cap starvation)", () => {
    const many = Array.from({ length: 25 }, (_, i) => bubbleCard({ id: `bubble:p1:b${i}`, text: `note ${i}` }));
    const rows = buildReviewExportRows(many, emptyReviewState(), new Map(), NOW);
    // Every one of the 25 cards gets a row — a real study session's queue
    // would cap new-card introduction at 20/day (NEW_CARDS_DAILY_CAP), but
    // export is a full-deck snapshot, not a session.
    expect(rows).toHaveLength(25);
  });
});
