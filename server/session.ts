// 每个项目一个会话管理器：同一时刻最多一轮 Agent 在跑；
// 把 Agent 事件落盘（transcript.jsonl）并广播给所有订阅的浏览器标签页（SSE）。

import { join } from "node:path";
import type {
  AgentKind,
  ChatItem,
  PickedElement,
  Project,
  ProjectSnapshot,
  ServerEvent,
} from "../shared/types.ts";
import { RUNNERS } from "./agents/index.ts";
import { now, type TurnHandle } from "./agents/types.ts";
import { LANDING_SKILL_DIR, SITE_DIRNAME } from "./config.ts";
import { SitePreview } from "./preview.ts";
import { appendItem, getProject, loadItems, saveProject } from "./projects.ts";
import { editPrompt, kickoffPrompt } from "./prompts.ts";

const PREVIEW_POLL_MS = 3000;

export class BusyError extends Error {}

export class ProjectSession {
  private static cache = new Map<string, Promise<ProjectSession | null>>();

  static get(id: string): Promise<ProjectSession | null> {
    let s = ProjectSession.cache.get(id);
    if (!s) {
      s = (async () => {
        const project = await getProject(id);
        if (!project) return null;
        return new ProjectSession(project, await loadItems(project));
      })();
      ProjectSession.cache.set(id, s);
      // 没找到的不缓存，便于之后创建同 id（实际不会发生，但保持无副作用）
      s.then((v) => v ?? ProjectSession.cache.delete(id));
    }
    return s;
  }

  static async stopAll(): Promise<void> {
    for (const p of ProjectSession.cache.values()) {
      const s = await p;
      s?.turn?.stop();
      s?.preview.stop();
    }
  }

  readonly preview: SitePreview;
  private turn?: TurnHandle;
  private listeners = new Set<(ev: ServerEvent) => void>();
  private pollTimer?: NodeJS.Timeout;
  private preparing = false;

  private constructor(
    public project: Project,
    private items: ChatItem[],
  ) {
    this.preview = new SitePreview(join(project.dir, SITE_DIRNAME), (preview) =>
      this.emit({ type: "preview", preview }),
    );
    // 打开项目时如果站点已经生成过，直接把预览起起来
    void this.preview.ensure({ allowInstall: true });
  }

  get running(): boolean {
    return this.preparing || this.turn !== undefined;
  }

  snapshot(): ProjectSnapshot {
    return {
      project: this.project,
      items: this.items,
      running: this.running,
      preview: this.preview.state,
    };
  }

  subscribe(fn: (ev: ServerEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 新项目的第一轮：让 Agent 按 skill 开始研究产品、起草 brief */
  kickoff(): Promise<void> {
    return this.send(
      `Generate a landing page for ${this.project.name}`,
      undefined,
      kickoffPrompt(this.project),
    );
  }

  async send(text: string, picks?: PickedElement[], promptOverride?: string): Promise<void> {
    if (this.running) throw new BusyError("Your agent is still processing the previous message");
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Message cannot be empty");

    const userItem: ChatItem = {
      id: `user-${Date.now()}`,
      kind: "user",
      text: trimmed,
      picks: picks?.length ? picks : undefined,
      at: now(),
    };
    this.preparing = true;
    try {
      await this.record(userItem);
    } catch (error) {
      this.preparing = false;
      throw error;
    }

    const agent = this.project.agent;
    const run = RUNNERS[agent];
    // Agent 给的条目 id 只保证本轮内唯一（实测 Codex 每轮从 item_0 重新编号），加上轮次前缀防止覆盖历史
    const turnKey = `t${Date.now().toString(36)}`;
    const handle = run(
      {
        cwd: this.project.dir,
        prompt: promptOverride ?? editPrompt(trimmed, picks),
        sessionId: this.project.sessions[agent],
        extraDirs: [...this.project.materials.repoPaths, LANDING_SKILL_DIR],
      },
      {
        onSession: (id) => {
          if (this.project.sessions[agent] === id) return;
          this.project = { ...this.project, sessions: { ...this.project.sessions, [agent]: id } };
          void saveProject(this.project);
          this.emit({ type: "project", project: this.project });
        },
        onItem: (item) => void this.record({ ...item, id: `${turnKey}:${item.id}` }),
      },
    );
    this.turn = handle;
    this.preparing = false;
    this.emit({ type: "turn", running: true });

    // Agent 干活期间，一旦站点装好依赖就把预览起起来，用户能边看边等
    this.pollTimer = setInterval(
      () => void this.preview.ensure({ allowInstall: false }),
      PREVIEW_POLL_MS,
    );

    void handle.done.then(async (result) => {
      clearInterval(this.pollTimer);
      // 进程已经结束，还挂着「进行中」的工具调用不会再有结果了：成功时视为完成，否则标为出错
      for (const item of this.items) {
        if (item.kind === "tool" && item.status === "running") {
          await this.record({ ...item, status: result.ok ? "done" : "error" });
        }
      }
      if (result.stopped) {
        await this.record(sys("Turn stopped.", "info"));
      } else if (!result.ok) {
        await this.record(sys(`Agent error: ${result.error ?? "Unknown error"}`, "error"));
      }
      this.turn = undefined;
      this.emit({ type: "turn", running: false });
      await this.preview.ensure({ allowInstall: true });
    });
  }

  stop(): void {
    this.turn?.stop();
  }

  async setAgent(agent: AgentKind): Promise<void> {
    if (this.running) throw new BusyError("Stop the running agent before switching");
    if (agent === this.project.agent) return;
    this.project = { ...this.project, agent };
    await saveProject(this.project);
    this.emit({ type: "project", project: this.project });
    await this.record(
      sys(
        `Switched to ${agent === "claude" ? "Claude Code" : "Codex"}. The new agent will read the project instructions and existing site to continue.`,
        "info",
      ),
    );
  }

  private async record(item: ChatItem): Promise<void> {
    const i = this.items.findIndex((x) => x.id === item.id);
    if (i >= 0) this.items[i] = item;
    else this.items.push(item);
    this.emit({ type: "item", item });
    await appendItem(this.project, item);
  }

  private emit(ev: ServerEvent): void {
    for (const fn of this.listeners) fn(ev);
  }
}

function sys(text: string, level: "info" | "error"): ChatItem {
  return { id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind: "system", text, level, at: now() };
}
