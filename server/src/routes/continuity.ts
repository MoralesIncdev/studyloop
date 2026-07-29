// V3-C C1 "Concept Continuity rail" (SPEC): GET /api/projects/:id/continuity
// replaces the raw youtube-related-list "Up next" cabinet — see
// lib/continuityService.ts for the scoring orchestration and
// lib/continuity.ts for the pure scorer (pre-authored by the kimi seat).
import type { FastifyInstance } from "fastify";
import { getConfig, resolveDataDir, resolveRoots } from "../config.js";
import { getLibrary } from "../lib/libraryScanCache.js";
import {
  continuityForLocalProject,
  continuityForYoutubeProject,
  loadOwnConceptSignals,
  type ContinuityCandidateOut,
  type YoutubeProject,
} from "../lib/continuityService.js";
import { ProjectIdParamSchema } from "../lib/models.js";
import { readProject } from "../lib/store.js";

export interface ContinuityResponse {
  candidates: ContinuityCandidateOut[];
}

export async function continuityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/projects/:id/continuity", async (request, reply) => {
    const params = ProjectIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    // Continuity is presentational rail data, same "degrade, never 500"
    // philosophy as heatmap/overlays — an unexpected failure anywhere in the
    // scoring pipeline (a network blip Innertube's own try/catch didn't
    // anticipate, a malformed teacherScores.json write race) yields an empty
    // rail rather than breaking the whole Study view load.
    try {
      if (project.source.type === "youtube") {
        const candidates = await continuityForYoutubeProject(dataDir, project as YoutubeProject, config.continuityWeights);
        const response: ContinuityResponse = { candidates };
        return response;
      }

      const roots = resolveRoots(config);
      const [{ items }, { topConcepts }] = await Promise.all([
        getLibrary({ libraryRoots: roots.libraryRoots, transcriptRoots: roots.transcriptRoots }),
        loadOwnConceptSignals(dataDir, project.id),
      ]);
      const candidates = continuityForLocalProject(items, project.source.path, topConcepts, config.continuityWeights);
      const response: ContinuityResponse = { candidates };
      return response;
    } catch (err) {
      app.log.warn({ err, projectId: project.id }, "continuity: falling back to an empty rail");
      const response: ContinuityResponse = { candidates: [] };
      return response;
    }
  });
}
