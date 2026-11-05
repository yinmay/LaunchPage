import type { ChatItem } from "../../shared/types.ts";

export interface TurnOptions {
  cwd: string;
  prompt: string;
  /** 上一轮的会话 id；有就续接，没有就开新会话 */
  sessionId?: string;
  /** 除 cwd 外允许 Agent 访问的目录（用户的代码库、skill 目录） */
  extraDirs: string[];
}

export interface TurnCallbacks {
  onSession(id: string): void;
  /** 新条目或同 id 条目的更新（例如工具调用从 running 变成 done） */
  onItem(item: ChatItem): void;
}

export interface TurnResult {
  ok: boolean;
  stopped: boolean;
  error?: string;
}

export interface TurnHandle {
  done: Promise<TurnResult>;
  stop(): void;
}

export type RunTurn = (opts: TurnOptions, cb: TurnCallbacks) => TurnHandle;

export const now = () => new Date().toISOString();

export function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** 保留 stderr 最后几行，用于在 Agent 异常退出时给出可读的错误 */
export class TailBuffer {
  private lines: string[] = [];
  constructor(private max = 20) {}
  push(line: string) {
    this.lines.push(line);
    if (this.lines.length > this.max) this.lines.shift();
  }
  toString() {
    return this.lines.join("\n");
  }
}
