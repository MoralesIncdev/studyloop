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
  const raw = await readJsonIfExists<unknown>(projectJsonPath(dataDir, id));
  if (raw === null) return null;
  return ProjectSchema.parse(raw);
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
