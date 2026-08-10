#!/usr/bin/env node
// Phase 4 Plan 2 "Verbatim-anchor verifier" (D-03, PROOF-01): a thin CLI over
// lib/anchorVerify.ts. Reads <projectDir>/analysis.json and
// <projectDir>/captions.json, runs the classifier, and writes both a JSON and
// a human-readable markdown report into a caller-specified output directory
// (never into the project directory being read — enforced below, not just by
// convention). Exits non-zero when the report contains any violation, so it
// can act as a gate in 04-05.
//
// Runs via tsx with no build step and no new dependency (tsx is already a
// server/package.json devDependency):
//
//   npx tsx src/scripts/verifyAnchors.ts <projectDir> [--tolerance <seconds>] [--out <dir>]
//
// D-03 placement deviation: see the header comment on lib/anchorVerify.ts —
// this file lives at server/src/scripts/ (inside tsconfig's "src" include),
// not server/scripts/ or scripts/ as D-03's wording suggested.
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildCaptionIndex,
  parseAnalysisInput,
  parseCaptionsFile,
  verifyAnchors,
  type AnchorVerifyReport,
} from "../lib/anchorVerify.js";

interface CliArgs {
  projectDir: string;
  toleranceSec?: number;
  outDir: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const [projectDirArg, ...rest] = argv;
  if (!projectDirArg) {
    throw new Error("Usage: verifyAnchors.ts <projectDir> [--tolerance <seconds>] [--out <dir>]");
  }

  let toleranceSec: number | undefined;
  let outDir = process.cwd();

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--tolerance") {
      const value = rest[++i];
      const parsed = Number(value);
      if (value === undefined || !Number.isFinite(parsed)) {
        throw new Error(`Invalid --tolerance value: ${value ?? "(missing)"}`);
      }
      toleranceSec = parsed;
    } else if (arg === "--out") {
      const value = rest[++i];
      if (!value) throw new Error("--out requires a directory argument");
      outDir = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { projectDir: path.resolve(projectDirArg), toleranceSec, outDir: path.resolve(outDir) };
}

/**
 * Hard runtime guard (not just a convention) for "the CLI must never write
 * into the project directory it is reading" — refuses to proceed if the
 * resolved output directory is the project directory or nested inside it.
 */
function assertOutsideProjectDir(projectDir: string, outDir: string): void {
  const relative = path.relative(projectDir, outDir);
  const isInsideOrEqual = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (isInsideOrEqual) {
    throw new Error(
      `Refusing to write the report into the project directory being read (${projectDir}). Pass a different --out.`
    );
  }
}

function truncateQuote(quote: string | undefined, max = 120): string {
  if (!quote) return "";
  const oneLine = quote.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function renderMarkdownReport(report: AnchorVerifyReport, projectDir: string): string {
  const lines: string[] = [];
  lines.push("# Anchor Verification Report");
  lines.push("");
  lines.push(`- **Project:** \`${projectDir}\``);
  lines.push(`- **Checked at:** ${report.checkedAt}`);
  lines.push(`- **Tolerance:** ${report.toleranceSec}s`);
  lines.push("");
  lines.push("## Totals by collection");
  lines.push("");
  lines.push("| Collection | Checked |");
  lines.push("|---|---|");
  lines.push(`| Unit anchors | ${report.totals.units} |`);
  lines.push(`| Edge quotes | ${report.totals.edges} |`);
  lines.push(`| Pearl timestamps | ${report.totals.pearls} |`);
  lines.push(`| **Total** | **${report.totals.checked}** |`);
  lines.push("");
  lines.push("## Exact / normalized split");
  lines.push("");
  lines.push("| Classification | Count |");
  lines.push("|---|---|");
  lines.push(`| Exact | ${report.results.exact} |`);
  lines.push(`| Normalized (whitespace/case) | ${report.results.normalized} |`);
  lines.push(`| Violations | ${report.violations.length} |`);
  lines.push("");
  lines.push(`## Violations (${report.violations.length})`);
  lines.push("");
  if (report.violations.length === 0) {
    lines.push("None.");
  } else {
    lines.push("| Kind | Id | Reason | Anchor t | Matched segment start | Quote |");
    lines.push("|---|---|---|---|---|---|");
    for (const v of report.violations) {
      lines.push(
        `| ${v.kind} | ${v.id} | ${v.reason} | ${v.t ?? ""} | ${v.matchedSegmentStart ?? ""} | ${truncateQuote(v.quote)} |`
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const { projectDir, toleranceSec, outDir } = parseArgs(process.argv.slice(2));
  assertOutsideProjectDir(projectDir, outDir);

  const [analysisRaw, captionsRaw] = await Promise.all([
    fs.readFile(path.join(projectDir, "analysis.json"), "utf8").then((s) => JSON.parse(s)),
    fs.readFile(path.join(projectDir, "captions.json"), "utf8").then((s) => JSON.parse(s)),
  ]);

  const analysis = parseAnalysisInput(analysisRaw);
  const captions = parseCaptionsFile(captionsRaw);
  const index = buildCaptionIndex(captions.segments);
  const report = verifyAnchors(analysis, index, toleranceSec !== undefined ? { toleranceSec } : {});

  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "anchor-verification-report.json");
  const mdPath = path.join(outDir, "anchor-verification-report.md");
  await Promise.all([
    fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    fs.writeFile(mdPath, renderMarkdownReport(report, projectDir), "utf8"),
  ]);

  console.log(
    `Anchor verification: ${report.totals.checked} checked ` +
      `(${report.totals.units} unit anchors, ${report.totals.edges} edge quotes, ${report.totals.pearls} pearl timestamps) — ` +
      `${report.results.exact} exact, ${report.results.normalized} normalized, ${report.violations.length} violations ` +
      `(tolerance ${report.toleranceSec}s). Report: ${outDir}`
  );

  process.exitCode = report.violations.length > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
