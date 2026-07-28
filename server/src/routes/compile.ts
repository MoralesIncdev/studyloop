import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { detectProfileAndParse, parseConceptDoc, type ConceptCard } from "../lib/concepts.js";
import { renderCompiledDocument } from "../lib/compileRenderer.js";
import { exportsDir, readBubbles, readNotes, readProject, writeFileAtomic } from "../lib/store.js";

const IdParamSchema = z.object({ id: z.string().min(1) });

async function loadConcepts(
  conceptDoc: { path?: string; profile?: "bjj-curriculum" | "headings" } | undefined,
  videoPath: string | null
): Promise<ConceptCard[]> {
  if (!conceptDoc?.path) return [];
  let markdown: string;
  try {
    markdown = await fs.readFile(conceptDoc.path, "utf8");
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

    const [notes, bubbles] = await Promise.all([
      readNotes(dataDir, params.data.id),
      readBubbles(dataDir, params.data.id),
    ]);
    const videoPath = project.source.type === "local" ? project.source.path : null;
    const concepts = await loadConcepts(project.conceptDoc, videoPath);

    const markdown = renderCompiledDocument({
      title: project.title,
      source: project.source,
      notes,
      bubbles,
      concepts,
      watchedUpTo: project.lastPosition,
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const outPath = path.join(exportsDir(dataDir, params.data.id), `study-${dateStr}.md`);
    await writeFileAtomic(outPath, markdown);

    return { path: outPath, markdown };
  });
}
