// 驱动本机 Codex：每轮对话起一个 `codex exec --json` 进程，续接时用 `codex exec resume <id>`。
// 事件是 JSONL：thread.started / turn.started / item.started|updated|completed / turn.completed|failed / error。
// item.type 在不同版本里出现过 snake_case 与 camelCase 两种写法，这里两种都认。
//
// 权限：保持 workspace-write 沙箱，网络用于研究资料和安装依赖。

import type { ChatItem } from "../../shared/types.ts";
import { killGroup, onLines, spawnGroup } from "../proc.ts";
import { clip, now, type RunTurn, TailBuffer, type TurnResult } from "./types.ts";

type Rec = Record<string, unknown>;

const COMMON = ["--json", "--skip-git-repo-check", "-c", 'sandbox_mode="workspace-write"', "-c", "sandbox_workspace_write.network_access=true"];

export const runCodexTurn: RunTurn = (opts, cb) => {
  const args = opts.sessionId
    ? ["exec", "resume", opts.sessionId, ...COMMON, "-"]
    : ["exec", ...COMMON, "-"];

  const child = spawnGroup("codex", args, { cwd: opts.cwd });
  child.stdin?.end(opts.prompt);

  const stderr = new TailBuffer();
  let failure: string | undefined;
  let stopped = false;

  onLines(child.stdout!, (line) => {
    let ev: Rec;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    const type = String(ev.type ?? "");
    if (type === "thread.started" && typeof ev.thread_id === "string") {
      cb.onSession(ev.thread_id);
    } else if (type.startsWith("item.")) {
      const item = toChatItem(ev.item as Rec, type === "item.completed");
      if (item) cb.onItem(item);
    } else if (type === "turn.failed") {
      failure = String(((ev.error as Rec) ?? {}).message ?? "Codex turn failed");
    } else if (type === "error") {
      failure = String(ev.message ?? "Codex Error");
    }
  });
  onLines(child.stderr!, (l) => stderr.push(l));

  const done = new Promise<TurnResult>((resolve) => {
    child.on("error", (err) =>
      resolve({ ok: false, stopped, error: `Could not start Codex: ${err.message}` }),
    );
    child.on("close", (code) => {
      if (stopped) return resolve({ ok: false, stopped: true });
      if (code === 0 && !failure) return resolve({ ok: true, stopped: false });
      resolve({
        ok: false,
        stopped: false,
        error: failure ?? (stderr.toString() || `Codex exit code ${code}`),
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

function toChatItem(item: Rec | undefined, completed: boolean): ChatItem | null {
  if (!item) return null;
  const id = `codex-${String(item.id ?? Math.random())}`;
  const type = String(item.type ?? "").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  const at = now();
  const status = (): "running" | "done" | "error" => {
    if (!completed) return "running";
    const s = String(item.status ?? "");
    const exit = item.exit_code ?? item.exitCode;
    if (s === "failed" || (typeof exit === "number" && exit !== 0)) return "error";
    return "done";
  };

  switch (type) {
    case "agent_message": {
      const text = String(item.text ?? "");
      // 文本只在完成时发一次，避免流式中间态刷屏
      return completed && text.trim() ? { id, kind: "assistant", text, at } : null;
    }
    case "command_execution":
      return {
        id,
        kind: "tool",
        title: "Run command",
        detail: clip(String(item.command ?? ""), 300),
        status: status(),
        at,
      };
    case "file_change": {
      const changes = Array.isArray(item.changes) ? (item.changes as Rec[]) : [];
      return {
        id,
        kind: "tool",
        title: `Edit ${changes.length || ""} files`.replace("  ", " "),
        detail: clip(changes.map((c) => String(c.path ?? "")).join("\n"), 400),
        status: status(),
        at,
      };
    }
    case "mcp_tool_call":
      return {
        id,
        kind: "tool",
        title: `Call ${item.server ?? ""} · ${item.tool ?? ""}`,
        status: status(),
        at,
      };
    case "web_search":
      return { id, kind: "tool", title: "Search the web", detail: String(item.query ?? ""), status: status(), at };
    case "error":
      // 实测（codex-cli 0.157）：配置告警等不致命的提示也以 error item 出现，真正的失败走 turn.failed。
      // 所以这里只作提示，不标红
      return { id, kind: "system", level: "info", text: `Codex notice: ${String(item.message ?? "")}`, at };
    default:
      // reasoning / todo_list 等对用户价值不大，不展示
      return null;
  }
}
