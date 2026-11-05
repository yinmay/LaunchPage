// 驱动本机 Claude Code：每轮对话起一个 `claude -p --output-format stream-json` 进程，
// 用 --resume 续接上一轮的会话。会话本体在 Claude 自己的 session jsonl 里，
// 所以用户随时可以在终端 `claude --resume <id>` 接手同一段对话。
//
// 权限：acceptEdits + 站点构建命令白名单，不跳过全部权限检查。
// AskUserQuestion 在 -p 模式下没有交互通道，禁用它，让 Agent 在回复里直接提问并结束本轮
// （项目 AGENTS.md 里有同样的约定）。

import { basename } from "node:path";
import type { ChatItem } from "../../shared/types.ts";
import { killGroup, onLines, spawnGroup } from "../proc.ts";
import { clip, now, type RunTurn, TailBuffer, type TurnResult } from "./types.ts";

type Rec = Record<string, unknown>;

export const runClaudeTurn: RunTurn = (opts, cb) => {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode", "acceptEdits",
    "--allowedTools=Read,Glob,Grep,Edit,Write,WebFetch,WebSearch,Bash(pnpm *),Bash(npm *),Bash(node *),Bash(cp *),Bash(ls *),Bash(cat *),Bash(mkdir *)",
    "--disallowedTools=AskUserQuestion",
    ...opts.extraDirs.map((d) => `--add-dir=${d}`),
  ];
  if (opts.sessionId) args.push("--resume", opts.sessionId);

  const child = spawnGroup("claude", args, { cwd: opts.cwd });
  child.stdin?.end(opts.prompt);

  const tools = new Map<string, Extract<ChatItem, { kind: "tool" }>>();
  const stderr = new TailBuffer();
  let resultError: string | undefined;
  let stopped = false;

  onLines(child.stdout!, (line) => {
    let ev: Rec;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof ev.session_id === "string" && (ev.type === "system" || ev.type === "result")) {
      cb.onSession(ev.session_id);
    }
    if (ev.type === "assistant") {
      const msg = ev.message as Rec;
      const blocks = (msg?.content as Rec[]) ?? [];
      blocks.forEach((b, i) => {
        if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
          cb.onItem({ id: `${msg.id}-${i}`, kind: "assistant", text: b.text, at: now() });
        } else if (b.type === "tool_use") {
          const item = toolItem(String(b.id), String(b.name), (b.input as Rec) ?? {});
          tools.set(item.id, item);
          cb.onItem(item);
        }
      });
    } else if (ev.type === "user") {
      const blocks = ((ev.message as Rec)?.content as Rec[]) ?? [];
      for (const b of blocks) {
        if (b.type !== "tool_result") continue;
        const prev = tools.get(String(b.tool_use_id));
        if (!prev) continue;
        const next = { ...prev, status: b.is_error ? ("error" as const) : ("done" as const) };
        if (b.is_error) next.detail = clip(resultText(b.content), 400);
        tools.set(next.id, next);
        cb.onItem(next);
      }
    } else if (ev.type === "result" && ev.is_error) {
      resultError = typeof ev.result === "string" ? ev.result : String(ev.subtype ?? "error");
    }
  });
  onLines(child.stderr!, (l) => stderr.push(l));

  const done = new Promise<TurnResult>((resolve) => {
    child.on("error", (err) =>
      resolve({ ok: false, stopped, error: `Could not start Claude: ${err.message}` }),
    );
    child.on("close", (code) => {
      if (stopped) return resolve({ ok: false, stopped: true });
      if (code === 0 && !resultError) return resolve({ ok: true, stopped: false });
      resolve({
        ok: false,
        stopped: false,
        error: resultError ?? (stderr.toString() || `Claude exit code ${code}`),
      });
    });
  });

  return {
    done,
    stop() {
      stopped = true;
      killGroup(child);
    },
  };
};

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c?.text === "string" ? c.text : "")).join("\n");
  }
  return "";
}

function toolItem(id: string, name: string, input: Rec): Extract<ChatItem, { kind: "tool" }> {
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  const file = s("file_path") || s("path");
  let title: string;
  let detail: string | undefined;
  switch (name) {
    case "Bash":
      title = "Run command";
      detail = clip(s("command"), 300);
      break;
    case "Read":
      title = `Read ${basename(file)}`;
      detail = file;
      break;
    case "Write":
      title = `Write ${basename(file)}`;
      detail = file;
      break;
    case "Edit":
    case "MultiEdit":
      title = `Edit ${basename(file)}`;
      detail = file;
      break;
    case "Glob":
    case "Grep":
      title = "Search files";
      detail = clip(s("pattern"), 200);
      break;
    case "WebFetch":
      title = "Fetch web page";
      detail = s("url");
      break;
    case "WebSearch":
      title = "Search the web";
      detail = s("query");
      break;
    case "Skill":
      title = `Use skill ${s("skill") || s("command")}`;
      break;
    case "TodoWrite":
      title = "Update task plan";
      break;
    case "Task":
    case "Agent":
      title = "Delegate to agent";
      detail = clip(s("description") || s("prompt"), 200);
      break;
    default:
      title = name.startsWith("mcp__") ? `Call ${name.split("__").slice(1).join(" · ")}` : name;
  }
  return { id, kind: "tool", title, detail, status: "running", at: now() };
}
