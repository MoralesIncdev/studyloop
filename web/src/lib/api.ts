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
  CreateProjectBody,
  HealthResponse,
  HeatmapResponse,
  LibraryResponse,
  OverlayMeta,
  PatchProjectBody,
  Project,
  RevealResponse,
  ReviewGrade,
  ReviewQueueResponse,
  SearchResponse,
  ShareBundle,
  StudyLoopConfig,
  StudyLoopConfigPatch,
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

  getTranscript: (path: string, projectId?: string) =>
    request<TranscriptResponse>(
      `/api/transcript?path=${encodeURIComponent(path)}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""}`
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

  search: (q: string) => request<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`),

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
  exportAnalysis: (id: string) =>
    request<{ path: string; bundle: ShareBundle }>(`/api/projects/${encodeURIComponent(id)}/export-analysis`, {
      method: "POST",
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

  videoStreamUrl: (path: string) => `/api/video/stream?path=${encodeURIComponent(path)}`,
  shotUrl: (projectId: string, shot: string) =>
    `/api/media/${encodeURIComponent(projectId)}/${shot.replace(/^\/+/, "")}`,
  /** codex P1-1: lazily-generated, cached mid-video-frame thumbnail for a local library video. */
  thumbUrl: (videoPath: string) => `/api/thumb?path=${encodeURIComponent(videoPath)}`,
};
