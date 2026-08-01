// Thin typed client for the StudyLoop server API. Every function throws ApiError on
// failure; call sites are expected to catch and surface via the toast store.
import type {
  Analysis,
  AnalyzeStatus,
  AttestationPatchBody,
  AttestationsFile,
  Bubble,
  ConceptCard,
  ConceptProfile,
  ContinuityResponse,
  CreateProjectBody,
  DeleteSlidesResponse,
  GetSlidesResponse,
  HealthResponse,
  HeatmapResponse,
  LensesResponse,
  LibraryResponse,
  MergeCandidatesResponse,
  MergedConceptsResponse,
  MergeResolveAction,
  OverlayMeta,
  PatchProjectBody,
  PatchTermsBody,
  PatchTermsResponse,
  PearlReviewAddsResponse,
  PostSlidesResponse,
  Project,
  RevealResponse,
  ReviewCardTransform,
  ReviewGrade,
  ReviewQueueResponse,
  SearchIntent,
  SearchResponse,
  ShareBundle,
  StudyLoopConfig,
  StudyLoopConfigPatch,
  TermsResponse,
  TranscriptResponse,
  YoutubeResolveResponse,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : "Network error", 0);
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(message, res.status);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export const api = {
  getLibrary: () => request<LibraryResponse>("/api/library"),
  rescanLibrary: () => request<LibraryResponse>("/api/library/rescan", { method: "POST" }),

  getConfig: () => request<StudyLoopConfig>("/api/config"),
  putConfig: (patch: StudyLoopConfigPatch) =>
    request<StudyLoopConfig>("/api/config", { method: "PUT", body: JSON.stringify(patch) }),

  // Phase 10 "Transcript source chain": `path` is now optional — omit it
  // (passing `projectId` alone) to resolve via the full chain (same-dir
  // sidecar, or a lazy YouTube caption pull) for a project whose
  // `transcript.type` is "none". Passing `path` keeps the exact pre-Phase-10
  // behavior (an explicit file lookup).
  getTranscript: (path: string | undefined, projectId?: string) =>
    request<TranscriptResponse>(
      `/api/transcript?${path ? `path=${encodeURIComponent(path)}` : ""}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""}`
    ),

  getHealth: () => request<HealthResponse>("/api/health"),

  listProjects: () => request<{ projects: Project[] }>("/api/projects"),
  getProject: (id: string) => request<Project>(`/api/projects/${encodeURIComponent(id)}`),
  createProject: (body: CreateProjectBody) =>
    request<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  patchProject: (id: string, patch: PatchProjectBody) =>
    request<Project>(`/api/projects/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),

  getNotes: (id: string) => request<string>(`/api/projects/${encodeURIComponent(id)}/notes`),
  putNotes: (id: string, content: string) =>
    request<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}/notes`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),

  listBubbles: (id: string) => request<{ bubbles: Bubble[] }>(`/api/projects/${encodeURIComponent(id)}/bubbles`),
  createBubble: (id: string, body: { t: number; text: string; shot?: string | null }) =>
    request<Bubble>(`/api/projects/${encodeURIComponent(id)}/bubbles`, { method: "POST", body: JSON.stringify(body) }),
  patchBubble: (id: string, bubbleId: string, patch: { t?: number; text?: string; shot?: string | null }) =>
    request<Bubble>(`/api/projects/${encodeURIComponent(id)}/bubbles/${encodeURIComponent(bubbleId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteBubble: (id: string, bubbleId: string) =>
    request<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}/bubbles/${encodeURIComponent(bubbleId)}`, {
      method: "DELETE",
    }),

  captureShot: (id: string, t: number) =>
    request<{ shot: string | null; error?: string }>(`/api/projects/${encodeURIComponent(id)}/shots`, {
      method: "POST",
      body: JSON.stringify({ t }),
    }),

  getConcepts: (id: string) =>
    request<{ profile?: ConceptProfile; concepts: ConceptCard[] }>(`/api/projects/${encodeURIComponent(id)}/concepts`),

  compile: (id: string) =>
    request<{ path: string; markdown: string }>(`/api/projects/${encodeURIComponent(id)}/compile`, { method: "POST" }),
  reveal: (id: string, path?: string) =>
    request<RevealResponse>(`/api/projects/${encodeURIComponent(id)}/reveal`, {
      method: "POST",
      body: JSON.stringify(path ? { path } : {}),
    }),

  resolveYoutube: (url: string) =>
    request<YoutubeResolveResponse>("/api/youtube/resolve", { method: "POST", body: JSON.stringify({ url }) }),
  refreshRelated: (projectId: string, videoId: string) =>
    request<Project>("/api/youtube/related", { method: "POST", body: JSON.stringify({ projectId, videoId }) }),

  // V3-C C2: optional `intent` reshapes the youtube half of the query server-side.
  search: (q: string, intent?: SearchIntent | null) =>
    request<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}${intent ? `&intent=${encodeURIComponent(intent)}` : ""}`),

  // --- V3-C C1: Concept Continuity rail --------------------------------------------
  getContinuity: (id: string) => request<ContinuityResponse>(`/api/projects/${encodeURIComponent(id)}/continuity`),

  // --- V2-C: analysis engine ---------------------------------------------------
  analyze: (id: string, force?: boolean) =>
    request<AnalyzeStatus | Analysis>(`/api/projects/${encodeURIComponent(id)}/analyze`, {
      method: "POST",
      body: JSON.stringify(force ? { force: true } : {}),
    }),
  getAnalyzeStatus: (id: string) => request<AnalyzeStatus>(`/api/projects/${encodeURIComponent(id)}/analyze/status`),
  getAnalysis: (id: string) => request<Analysis>(`/api/projects/${encodeURIComponent(id)}/analysis`),

  // --- V2-C: heatmap -------------------------------------------------------------
  getHeatmap: (id: string) => request<HeatmapResponse>(`/api/projects/${encodeURIComponent(id)}/heatmap`),

  // --- V2-C: share bundles / overlays ---------------------------------------------
  // V3-C C6: optional per-concept "why this grouping" text, entered right before export.
  exportAnalysis: (id: string, conceptRationales?: Record<string, string>) =>
    request<{ path: string; bundle: ShareBundle }>(`/api/projects/${encodeURIComponent(id)}/export-analysis`, {
      method: "POST",
      body: conceptRationales && Object.keys(conceptRationales).length > 0 ? JSON.stringify({ conceptRationales }) : undefined,
    }),
  importAnalysisByPath: (id: string, path: string) =>
    request<{ fileName: string; bundle: ShareBundle; sourceMismatch: string | null }>(
      `/api/projects/${encodeURIComponent(id)}/import-analysis`,
      { method: "POST", body: JSON.stringify({ path }) }
    ),
  listOverlays: (id: string) => request<{ overlays: OverlayMeta[] }>(`/api/projects/${encodeURIComponent(id)}/overlays`),
  deleteOverlay: (id: string, fileName: string) =>
    request<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}/overlays/${encodeURIComponent(fileName)}`, {
      method: "DELETE",
    }),

  // --- F11: review mode -----------------------------------------------------------
  getReviewQueue: () => request<ReviewQueueResponse>("/api/review/queue"),
  gradeReviewCard: (cardId: string, grade: ReviewGrade) =>
    request<ReviewQueueResponse>("/api/review/grade", { method: "POST", body: JSON.stringify({ cardId, grade }) }),
  /** Phase 7 "CSV export": a plain URL (not a `request()` call) — the Review view links to this directly via an anchor's `download` attribute so the browser handles the file save, matching videoStreamUrl/shotUrl below. */
  reviewExportCsvUrl: () => "/api/review/export.csv",

  // --- V3-B B2: attestation + reveal-gating ----------------------------------------
  getAttestations: (id: string) => request<AttestationsFile>(`/api/projects/${encodeURIComponent(id)}/attestations`),
  patchAttestation: (id: string, unitId: string, body: AttestationPatchBody) =>
    request<AttestationsFile>(`/api/projects/${encodeURIComponent(id)}/attestations/${encodeURIComponent(unitId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  clearAttestation: (id: string, unitId: string) =>
    request<AttestationsFile>(`/api/projects/${encodeURIComponent(id)}/attestations/${encodeURIComponent(unitId)}`, {
      method: "DELETE",
    }),

  // --- V3-B review fix #7: pearl "Add to review" -----------------------------------
  getPearlReviewAdds: (id: string) =>
    request<PearlReviewAddsResponse>(`/api/projects/${encodeURIComponent(id)}/pearls/review-adds`),
  addPearlToReview: (id: string, t: number) =>
    request<PearlReviewAddsResponse>(`/api/projects/${encodeURIComponent(id)}/pearls/${encodeURIComponent(t)}/review-add`, {
      method: "POST",
    }),

  // --- V3-D D3: concept merge queue ------------------------------------------------
  getMergeCandidates: () => request<MergeCandidatesResponse>("/api/registry/merge-candidates"),
  resolveMergeCandidate: (candidateId: string, action: MergeResolveAction) =>
    request<{ candidates: number }>(`/api/registry/merge-candidates/${encodeURIComponent(candidateId)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  getMergedConcepts: (id: string) => request<MergedConceptsResponse>(`/api/projects/${encodeURIComponent(id)}/merged-concepts`),

  // --- Phase 9: lens registry summary (label + generated-lens note) ---------------
  getLenses: () => request<LensesResponse>("/api/lenses"),

  // --- Phase 2: terminology corrections ---------------------------------------
  getTerms: (id: string) => request<TermsResponse>(`/api/projects/${encodeURIComponent(id)}/terms`),
  patchTerms: (id: string, body: PatchTermsBody) =>
    request<PatchTermsResponse>(`/api/projects/${encodeURIComponent(id)}/terms`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // --- Phase 6: slide-text channel (PDF) -------------------------------------------
  getSlides: (id: string) => request<GetSlidesResponse>(`/api/projects/${encodeURIComponent(id)}/slides`),
  uploadSlides: (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    // `request()` only sets Content-Type itself for a string body — a
    // FormData body is left alone so fetch sets the correct
    // multipart/form-data boundary header on its own.
    return request<PostSlidesResponse>(`/api/projects/${encodeURIComponent(id)}/slides`, { method: "POST", body: formData });
  },
  deleteSlides: (id: string) =>
    request<DeleteSlidesResponse>(`/api/projects/${encodeURIComponent(id)}/slides`, { method: "DELETE" }),

  // --- V3-D D4: domain-routed card transformation — "improve this card" -----------
  improveReviewCard: (cardId: string) =>
    request<{ transformed: ReviewCardTransform | null }>(`/api/review/cards/${encodeURIComponent(cardId)}/improve`, {
      method: "POST",
    }),

  videoStreamUrl: (path: string) => `/api/video/stream?path=${encodeURIComponent(path)}`,
  shotUrl: (projectId: string, shot: string) =>
    `/api/media/${encodeURIComponent(projectId)}/${shot.replace(/^\/+/, "")}`,
  /** codex P1-1: lazily-generated, cached mid-video-frame thumbnail for a local library video. */
  thumbUrl: (videoPath: string) => `/api/thumb?path=${encodeURIComponent(videoPath)}`,
};
