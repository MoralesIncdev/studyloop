import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir, resolveRoots } from "../config.js";
import { correctTranscriptSegments } from "../lib/terms.js";
import { resolveEffectiveTranscript, transcriptSourceForDeclaredPath } from "../lib/transcriptChain.js";
import { resolveTranscriptPath } from "../lib/transcriptResolve.js";
import { loadTranscriptFromText, TranscriptParseError } from "../lib/transcripts.js";
import { readProject } from "../lib/store.js";

// Phase 10 "Transcript source chain": `path` is now optional. When present,
// behavior is unchanged from before this phase — an explicit file lookup
// (used whenever the caller already knows `project.transcript.path`, or for
// a raw absolute-path lookup with no project at all). When `path` is
// omitted, `projectId` is required and the response comes from the full
// resolution chain instead (lib/transcriptChain.ts) — this is what the web
// app now calls for a project whose `transcript.type` is "none", so a
// same-dir sidecar or a lazily-pulled YouTube caption track still "just
// works" with no `path` for the client to have supplied in the first place.
const QuerySchema = z.object({ path: z.string().min(1).optional(), projectId: z.string().uuid().optional() });

export async function transcriptRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/transcript", async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Missing or invalid ?path=/?projectId=" });
    }
    const { path: rawPath, projectId } = parsed.data;

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const roots = resolveRoots(config);

    if (rawPath) {
      const resolved = await resolveTranscriptPath(dataDir, roots, rawPath, projectId);
      if (!resolved.ok) return reply.status(resolved.status).send({ error: resolved.error });
      const filePath = resolved.filePath;

      let raw: string;
      try {
        raw = await fs.readFile(filePath, "utf8");
      } catch {
        return reply.status(404).send({ error: "Transcript file not found" });
      }

      try {
        const transcript = loadTranscriptFromText(filePath, raw);
        // Phase 2 "Terminology layer v1": read-time-only rewrite — the file on
        // disk (just read above) is never touched. Only meaningful when this
        // request is scoped to a project (terms.json lives per-project); a raw
        // path lookup with no projectId serves the transcript uncorrected, same
        // as it always has.
        if (!projectId) return transcript;
        const project = await readProject(dataDir, projectId);
        const segments = await correctTranscriptSegments(dataDir, projectId, transcript.segments, project?.domain);
        // Phase 10 provenance: derived from the declared path's shape (see
        // transcriptSourceForDeclaredPath's doc comment) — "absent" isn't
        // possible on this branch since every file has *some* extension, but
        // the field stays optional on the wire for forward/backward compat
        // with the chain branch below and any client written before this phase.
        return { segments, transcriptSource: transcriptSourceForDeclaredPath(rawPath) };
      } catch (err) {
        if (err instanceof TranscriptParseError) {
          return reply.status(422).send({ error: err.message });
        }
        throw err;
      }
    }

    if (!projectId) return reply.status(400).send({ error: "Missing ?path= or ?projectId=" });
    const project = await readProject(dataDir, projectId);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const result = await resolveEffectiveTranscript(dataDir, roots, project);
    return {
      segments: result.segments,
      transcriptSource: result.source ?? undefined,
      transcribable: result.transcribable,
    };
  });
}
