// V3-D D3 "Concept merge queue (cross-video identity)" (SPEC): GET the
// pending merge candidates (with label/summary resolved live from each
// side's owning project, never persisted stale into conceptRegistry.json),
// POST resolves one via {action: merge|link|ignore}. A separate route
// surfaces, for one project, which of its units are already merged/linked
// elsewhere — this is what drives the "also in ⟨project⟩" chip.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { AnalysisSchema, type Analysis } from "../lib/analysis.js";
import { resolveMergeCandidate, type MergeResolveAction } from "../lib/conceptRegistry.js";
import { readConceptRegistry, withConceptRegistryLock, writeConceptRegistry } from "../lib/conceptRegistryStore.js";
import { ProjectIdParamSchema } from "../lib/models.js";
import { analysisJsonPath, newId, readJsonIfExists, readProject } from "../lib/store.js";

interface ResolvedUnitView {
  projectId: string;
  projectTitle: string;
  unitId: string;
  label: string;
  summary: string;
}

/** Reads one unit's CURRENT (not registry-cached) label/summary + its project's title, for the merge-queue panel and the resolve route's "ignore" fallback. Returns null if the project, its analysis, or the unit itself no longer resolves (deleted/legacy analysis) — callers skip/degrade gracefully rather than 500ing the whole list. */
async function resolveUnitView(dataDir: string, projectId: string, unitId: string): Promise<ResolvedUnitView | null> {
  const project = await readProject(dataDir, projectId);
  if (!project) return null;
  const raw = await readJsonIfExists<unknown>(analysisJsonPath(dataDir, projectId));
  if (raw === null) return null;
  const parsed = AnalysisSchema.safeParse(raw);
  const analysis: Analysis | null = parsed.success ? parsed.data : null;
  const unit = analysis?.units?.find((u) => u.id === unitId);
  if (!unit) return null;
  return { projectId, projectTitle: project.title, unitId, label: unit.label, summary: unit.summary };
}

const ResolveParamsSchema = z.object({ candidateId: z.string().min(1) });
const ResolveBodySchema = z.object({ action: z.enum(["merge", "link", "ignore"]) });

export async function registryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/registry/merge-candidates", async () => {
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const registry = await readConceptRegistry(dataDir);

    const candidates = [];
    for (const candidate of registry.candidates) {
      const target = registry.units[candidate.registryUnitId];
      const anchorRef = target?.projectRefs[0];
      if (!target || !anchorRef) continue;
      // eslint-disable-next-line no-await-in-loop -- local-first, candidate queue is small; sequential mirrors routes/review.ts's own per-project loop
      const left = await resolveUnitView(dataDir, anchorRef.projectId, anchorRef.unitId);
      // eslint-disable-next-line no-await-in-loop
      const right = await resolveUnitView(dataDir, candidate.incoming.projectId, candidate.incoming.unitId);
      if (!left || !right) continue; // one side's project/unit was deleted since this candidate was queued
      candidates.push({ id: candidate.id, domain: candidate.domain, similarity: candidate.similarity, left, right });
    }

    return { candidates };
  });

  app.post("/api/registry/merge-candidates/:candidateId/resolve", async (request, reply) => {
    const params = ResolveParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid candidateId" });
    const body = ResolveBodySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Body must be { action: merge|link|ignore }" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);

    const result = await withConceptRegistryLock(async () => {
      const registry = await readConceptRegistry(dataDir);
      const candidate = registry.candidates.find((c) => c.id === params.data.candidateId);
      if (!candidate) return "not_found" as const;
      const incoming = await resolveUnitView(dataDir, candidate.incoming.projectId, candidate.incoming.unitId);
      // Fallback keeps `resolve` usable even if the incoming project/unit
      // vanished between queueing and resolving — better than 404ing a
      // learner's explicit "keep separate" click.
      const fallback = { label: registry.units[candidate.registryUnitId]?.label ?? "Unknown concept", summary: "" };
      const next = resolveMergeCandidate(
        registry,
        params.data.candidateId,
        body.data.action as MergeResolveAction,
        incoming ?? fallback,
        newId
      );
      if (!next) return "not_found" as const;
      await writeConceptRegistry(dataDir, next);
      return next;
    });

    if (result === "not_found") return reply.status(404).send({ error: "Unknown merge candidate" });
    return { candidates: result.candidates.length };
  });

  // V3-D D3: "Merged units display a subtle 'also in ⟨other project⟩' chip
  // linking there." — {[unitId]: other projects this project's unit's
  // registry entry also spans}, empty/omitted for a unit that hasn't merged
  // with anything.
  app.get("/api/projects/:id/merged-concepts", async (request, reply) => {
    const params = ProjectIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const registry = await readConceptRegistry(dataDir);
    const result: Record<string, { projectId: string; projectTitle: string }[]> = {};

    for (const unit of Object.values(registry.units)) {
      const mine = unit.projectRefs.filter((r) => r.projectId === params.data.id);
      if (mine.length === 0) continue;
      const otherProjectIds = [...new Set(unit.projectRefs.filter((r) => r.projectId !== params.data.id).map((r) => r.projectId))];
      if (otherProjectIds.length === 0) continue;
      // eslint-disable-next-line no-await-in-loop
      const others = await Promise.all(
        otherProjectIds.map(async (pid) => {
          const p = await readProject(dataDir, pid);
          return p ? { projectId: pid, projectTitle: p.title } : null;
        })
      );
      const filtered = others.filter((o): o is { projectId: string; projectTitle: string } => o !== null);
      if (filtered.length === 0) continue;
      for (const ref of mine) result[ref.unitId] = filtered;
    }

    return result;
  });
}
