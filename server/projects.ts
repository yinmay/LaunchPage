// 项目的持久化：~/.launchpage/projects/<id>/
//   project.json      项目元数据
//   transcript.jsonl  对话条目（同 id 的后写入覆盖前者，用于工具调用状态更新）
//   AGENTS.md / CLAUDE.md  给 Agent 的项目约定
//   site/             Agent 生成的 Landing Page

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { ChatItem, CreateProjectInput, Project } from "../shared/types.ts";
import { PROJECTS_DIR } from "./config.ts";
import { agentsMd } from "./prompts.ts";

export class ValidationError extends Error {}

export async function listProjects(): Promise<Project[]> {
  if (!existsSync(PROJECTS_DIR)) return [];
  const ids = await readdir(PROJECTS_DIR);
  const all = await Promise.all(ids.map((id) => getProject(id).catch(() => null)));
  return all
    .filter((p): p is Project => p !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProject(id: string): Promise<Project | null> {
  if (!/^[a-z0-9-]+$/.test(id)) return null; // 防路径穿越
  const file = join(PROJECTS_DIR, id, "project.json");
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, "utf8")) as Project;
}

export async function saveProject(p: Project): Promise<void> {
  await writeFile(join(p.dir, "project.json"), `${JSON.stringify(p, null, 2)}\n`);
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const clean = await validate(input);
  const slug =
    clean.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "project";
  const id = `${slug}-${randomBytes(3).toString("hex")}`;
  const dir = join(PROJECTS_DIR, id);
  await mkdir(dir, { recursive: true });

  const project: Project = {
    id,
    name: clean.name,
    createdAt: new Date().toISOString(),
    agent: clean.agent,
    materials: clean.materials,
    sessions: {},
    dir,
  };
  await saveProject(project);
  await writeAgentInstructions(project);
  return project;
}

export async function writeAgentInstructions(p: Project): Promise<void> {
  await writeFile(join(p.dir, "AGENTS.md"), agentsMd(p));
  // Claude Code 读 CLAUDE.md，用 @ 引用同一份内容，避免两份漂移
  await writeFile(join(p.dir, "CLAUDE.md"), "@AGENTS.md\n");
}

export async function appendItem(p: Project, item: ChatItem): Promise<void> {
  await appendFile(join(p.dir, "transcript.jsonl"), `${JSON.stringify(item)}\n`);
}

export async function loadItems(p: Project): Promise<ChatItem[]> {
  const file = join(p.dir, "transcript.jsonl");
  if (!existsSync(file)) return [];
  const byId = new Map<string, ChatItem>();
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line) as ChatItem;
      byId.set(item.id, item); // Map 保留首次插入的位置，值用最后一次
    } catch {
      // 进程被强杀时可能留下半行，跳过
    }
  }
  return [...byId.values()];
}

async function validate(input: CreateProjectInput): Promise<CreateProjectInput> {
  const name = String(input?.name ?? "").trim();
  if (!name || name.length > 60) throw new ValidationError("Product name is required and must be at most 60 characters");
  if (input.agent !== "claude" && input.agent !== "codex") {
    throw new ValidationError("Select Claude Code or Codex");
  }
  const m = input.materials ?? { repoPaths: [], urls: [], notes: "" };
  const urls = (m.urls ?? []).map((s) => s.trim()).filter(Boolean);

  // 代码库 / 资料目录是选填的。用户常在这里写说明（比如「没有对应的代码库」），
  // 所以不像路径的行不报错，而是并入补充说明交给 Agent；像路径的才当目录处理。
  const repoPaths: string[] = [];
  const repoNotes: string[] = [];
  for (const raw of (m.repoPaths ?? []).map((s) => s.trim()).filter(Boolean)) {
    const p = raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : raw;
    if (!isAbsolute(p)) {
      repoNotes.push(raw);
      continue;
    }
    // 明确写了路径却找不到，多半是手误；静默忽略会让 Agent 拿不到资料，所以仍然提示
    const s = await stat(p).catch(() => null);
    if (!s?.isDirectory()) throw new ValidationError(`Directory not found: ${raw}`);
    repoPaths.push(p);
  }
  const notes = [
    String(m.notes ?? "").trim(),
    ...repoNotes.map((t) => `Repository notes: ${t}`),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8000);
  for (const u of urls) {
    let ok = false;
    try {
      ok = ["http:", "https:"].includes(new URL(u).protocol);
    } catch {}
    if (!ok) throw new ValidationError(`Invalid URL: ${u}`);
  }
  if (!repoPaths.length && !urls.length && !notes.trim()) {
    throw new ValidationError("Provide at least one repository, URL, or description");
  }
  return { name, agent: input.agent, materials: { repoPaths, urls, notes } };
}
