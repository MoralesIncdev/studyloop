import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { BubbleSchema, ProjectSchema, type Bubble, type Project } from "./models.js";

/**
 * Atomic write: write to a temp file in the same directory, then rename over
 * the destination. Avoids partial/corrupt writes if the process dies mid-write.
 */
export async function writeFileAtomic(filePath: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  await fs.writeFile(tmpPath, data, "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await writeFileAtomic(filePath, JSON.stringify(value, null, 2) + "\n");
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as NodeJS.ErrnoException).code === "ENOENT";
}

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "item";
}

export function newId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Per-project mutex: serializes read-modify-write operations against a single
// project's on-disk state (project.json, bubbles.json, notes.md) so two
// concurrent requests (e.g. two bubble POSTs in flight at once) can't clobber
// each other via a read-then-write race. Simple promise-chain lock, keyed by
// project id — no external deps, adequate for a single-process local server.
// ---------------------------------------------------------------------------

const projectLocks = new Map<string, Promise<unknown>>();

export function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const previous = projectLocks.get(projectId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  // Chain link used purely for ordering; never rejects, so it can't poison
  // the next waiter's `.then()` regardless of whether `fn` throws.
  const chained = run.then(
    () => undefined,
    () => undefined
  );
  projectLocks.set(projectId, chained);
  void chained.finally(() => {
    // Only remove the entry if nothing queued behind us — avoids unbounded
    // growth of the map while a project sees no more concurrent writers.
    if (projectLocks.get(projectId) === chained) projectLocks.delete(projectId);
  });
  return run;
}

// ---------------------------------------------------------------------------
// Project folder persistence: <dataDir>/projects/<id>/
// ---------------------------------------------------------------------------

export function projectDir(dataDir: string, id: string): string {
  return path.join(dataDir, "projects", id);
}

function projectJsonPath(dataDir: string, id: string): string {
  return path.join(projectDir(dataDir, id), "project.json");
}

function notesPath(dataDir: string, id: string): string {
  return path.join(projectDir(dataDir, id), "notes.md");
}

function bubblesPath(dataDir: string, id: string): string {
  return path.join(projectDir(dataDir, id), "bubbles.json");
}

export function shotsDir(dataDir: string, id: string): string {
  return path.join(projectDir(dataDir, id), "shots");
}

export function exportsDir(dataDir: string, id: string): string {
  return path.join(projectDir(dataDir, id), "exports");
}

function captionsPath(dataDir: string, id: string): string {
  return path.join(projectDir(dataDir, id), "captions.json");
}

/**
 * Persists YouTube auto-captions as `<project>/captions.json`, in the
 * generic whisper-style shape (`{segments: [{start,end,text}]}`) that
 * lib/transcripts.ts's loadTranscriptFromText already parses for any
 * `.json` transcript — no new loader needed, GET /api/transcript picks this
 * up the same way it reads any other project transcript file.
 */
export async function writeCaptions(
  dataDir: string,
  id: string,
  segments: readonly { start: number; end: number; text: string }[]
): Promise<void> {
  await writeJsonAtomic(captionsPath(dataDir, id), { segments });
}

export async function listProjectIds(dataDir: string): Promise<string[]> {
  const projectsRoot = path.join(dataDir, "projects");
  try {
    const entries = await fs.readdir(projectsRoot, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
}

export async function readProject(dataDir: string, id: string): Promise<Project | null> {
  const raw = await readJsonIfExists<Record<string, unknown>>(projectJsonPath(dataDir, id));
  if (raw === null) return null;
  const parsed = ProjectSchema.parse(raw);
  // Migration: older project.json files predate `watchedUpTo`. Rather than
  // silently defaulting to 0 (which would make previously-covered concepts
  // vanish from the compiled doc), seed it from lastPosition on first read.
  if (raw.watchedUpTo === undefined) {
    return { ...parsed, watchedUpTo: parsed.lastPosition };
  }
  return parsed;
}

/**
 * `watchedUpTo` is a monotonic high-water mark: a PATCH must never move it
 * backwards, regardless of what the client computed client-side (client bugs,
 * stale reads, or out-of-order requests shouldn't be able to erase progress).
 */
export function nextWatchedUpTo(existing: number, patchValue: number | undefined): number {
  return patchValue !== undefined ? Math.max(existing, patchValue) : existing;
}

export async function writeProject(dataDir: string, project: Project): Promise<void> {
  ProjectSchema.parse(project);
  await fs.mkdir(shotsDir(dataDir, project.id), { recursive: true });
  await fs.mkdir(exportsDir(dataDir, project.id), { recursive: true });
  await writeJsonAtomic(projectJsonPath(dataDir, project.id), project);
}

export async function readNotes(dataDir: string, id: string): Promise<string> {
  return (await readTextIfExists(notesPath(dataDir, id))) ?? "";
}

export async function writeNotes(dataDir: string, id: string, content: string): Promise<void> {
  await writeFileAtomic(notesPath(dataDir, id), content);
}

export async function readBubbles(dataDir: string, id: string): Promise<Bubble[]> {
  const raw = await readJsonIfExists<unknown[]>(bubblesPath(dataDir, id));
  if (raw === null) return [];
  return raw.map((b) => BubbleSchema.parse(b));
}

export async function writeBubbles(dataDir: string, id: string, bubbles: Bubble[]): Promise<void> {
  await writeJsonAtomic(bubblesPath(dataDir, id), bubbles);
}
