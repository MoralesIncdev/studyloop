import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { expandHome, getConfig, resolveDataDir } from "../config.js";
import { AnalysisSchema } from "../lib/analysis.js";
import { readAttestations } from "../lib/attestationStore.js";
import { detectProfileAndParse, parseConceptDoc, type ConceptCard } from "../lib/concepts.js";
import { renderCompiledDocument } from "../lib/compileRenderer.js";
import { ProjectIdParamSchema } from "../lib/models.js";
import { analysisJsonPath, exportsDir, readBubbles, readJsonIfExists, readNotes, readProject, writeFileAtomic } from "../lib/store.js";

const IdParamSchema = ProjectIdParamSchema;

async function loadConcepts(
  conceptDoc: { path?: string; profile?: "bjj-curriculum" | "headings" } | undefined,
  videoPath: string | null
): Promise<ConceptCard[]> {
  if (!conceptDoc?.path) return [];
  let markdown: string;
  try {
    markdown = await fs.readFile(expandHome(conceptDoc.path), "utf8");
  } catch {
    return [];
  }
  if (conceptDoc.profile) return parseConceptDoc(markdown, conceptDoc.profile, videoPath);
  return detectProfileAndParse(markdown, videoPath).cards;
}

export async function compileRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/projects/:id/compile", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const [notes, bubbles, analysisRaw, unitAttestations] = await Promise.all([
      readNotes(dataDir, params.data.id),
      readBubbles(dataDir, params.data.id),
      readJsonIfExists<unknown>(analysisJsonPath(dataDir, params.data.id)),
      readAttestations(dataDir, params.data.id),
    ]);
    const videoPath = project.source.type === "local" ? project.source.path : null;
    const concepts = await loadConcepts(project.conceptDoc, videoPath);
    const analysisParsed = analysisRaw !== null ? AnalysisSchema.safeParse(analysisRaw) : null;
    const analysis = analysisParsed?.success ? analysisParsed.data : null;
    // V3-B B2: v3 analyses render attested/generation-touched units in full,
    // unattested as titles-only "Not yet reviewed" — v2 (or no analysis)
    // keeps the pre-existing flat `analysisConcepts` rendering.
    const isV3 = analysis?.version === 3 && !!analysis.units;

    const markdown = renderCompiledDocument({
      title: project.title,
      source: project.source,
      notes,
      bubbles,
      concepts,
      watchedUpTo: project.watchedUpTo ?? project.lastPosition,
      analysisPearls: analysis?.pearls,
      analysisConcepts: isV3 ? undefined : analysis?.concepts,
      analysisUnits: isV3 ? analysis!.units : undefined,
      unitAttestations: isV3 ? unitAttestations : undefined,
      lessonSummary: project.lessonSummary,
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const outPath = path.join(exportsDir(dataDir, params.data.id), `study-${dateStr}.md`);
    await writeFileAtomic(outPath, markdown);

    return { path: outPath, markdown };
  });
}
