// Phase 9 "Lens autogeneration for unknown subjects"
// (design/EXECUTION-PLAN-post-review-v1.md): a thin read-only summary of the
// loaded lens registry — the web app's DomainRow.tsx uses this to (a) show a
// real label for a lens id it doesn't have hardcoded (a user-authored or
// Phase-9-generated one) and (b) surface a "auto-created lens — review it"
// note plus the file path for lenses with `origin: "generated"`. Never
// exposes a lens's full prompt content (routerDescription/unitTypeEmphasis
// etc.) — just enough for the UI, same "routes stay thin" convention as
// routes/registry.ts.
import type { FastifyInstance } from "fastify";
import path from "node:path";
import { getConfig, resolveDataDir } from "../config.js";
import { listLensesOrFallback } from "../lib/lenses.js";

export interface LensSummary {
  id: string;
  label: string;
  origin?: "generated";
  /** Only present for a generated lens (`origin === "generated"`) — the on-disk path DomainRow.tsx shows in its "review it" note's tooltip. */
  path?: string;
}

export async function lensesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/lenses", async () => {
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const lenses = listLensesOrFallback(dataDir);
    const summaries: LensSummary[] = lenses.map((l) => ({
      id: l.id,
      label: l.label,
      ...(l.origin === "generated" ? { origin: "generated" as const, path: path.join(dataDir, "lenses", `${l.id}.json`) } : {}),
    }));
    return { lenses: summaries };
  });
}
