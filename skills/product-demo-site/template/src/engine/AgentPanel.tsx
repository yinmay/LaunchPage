// The agent's conversation beside the canvas, scene by scene. Rows appear at scene-local
// moments, so the visitor reads the conversation at the same pace the canvas fills.
//
// If your product HAS a real chat/agent component that renders from props, use it here
// instead — a replica drifts from the product, the real component cannot.

import type { ReactNode } from "react";

export type ChatRow =
  | { kind: "user"; at: number; text: string }
  | { kind: "agent"; at: number; text: string; points?: readonly string[] }
  | { kind: "tool"; at: number; doneAt: number; text: string; failed?: boolean }
  | { kind: "notice"; at: number; tone: "done" | "info" | "alert"; text: string };

export interface SceneChat {
  /** Who the visitor is watching, e.g. "Claude Code · 需求梳理". */
  label: string;
  /** Scene-local window [open, close) — null keeps the panel closed for the scene. */
  open: readonly [number, number] | null;
  rows: readonly ChatRow[];
}

export function isOpen(chat: SceneChat, local: number) {
  return chat.open !== null && local >= chat.open[0] && local < chat.open[1];
}

function Row({ row, local }: { row: ChatRow; local: number }): ReactNode {
  switch (row.kind) {
    case "user":
      return (
        <p className="bg-elevated text-ink ml-8 self-end rounded-xl rounded-br-sm px-3 py-2">
          {row.text}
        </p>
      );
    case "agent":
      return (
        <div className="text-ink mr-6">
          <p>{row.text}</p>
          {row.points ? (
            <ul className="text-muted mt-1 list-disc space-y-0.5 pl-5">
              {row.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    case "tool": {
      const done = local >= row.doneAt;
      const mark = !done ? "◌" : row.failed ? "✕" : "✓";
      const tone = !done ? "text-subtle" : row.failed ? "text-danger" : "text-primary";
      return (
        <p className="border-line text-muted flex gap-2 rounded-md border px-2 py-1 font-mono text-[12px]">
          <span className={tone}>{mark}</span>
          {row.text}
        </p>
      );
    }
    case "notice": {
      const tone = { done: "text-primary", info: "text-secondary", alert: "text-warn" }[row.tone];
      return <p className={`text-[12px] ${tone}`}>— {row.text}</p>;
    }
  }
}

export function AgentPanel({
  chat,
  local,
  compact = false,
}: {
  chat: SceneChat;
  local: number;
  /** Phone strip: newest rows only, no composer. */
  compact?: boolean;
}) {
  const visible = chat.rows.filter((r) => local >= r.at);
  const rows = compact ? visible.slice(-3) : visible;
  return (
    <div className="border-line bg-surface flex h-full flex-col overflow-hidden rounded-xl border shadow-2xl">
      <p className="border-line text-muted flex shrink-0 items-center gap-2 border-b px-3 py-2 font-mono text-[12px]">
        <span className="bg-primary size-2 rounded-full" />
        {chat.label}
      </p>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden p-3 text-[13px] leading-relaxed">
        {rows.map((row, i) => (
          <div key={`${row.kind}-${row.at}-${i}`} className="animate-row flex flex-col">
            <Row row={row} local={local} />
          </div>
        ))}
      </div>
      {compact ? null : (
        <p className="border-line text-subtle shrink-0 border-t px-3 py-2 text-[12px]">输入你的需求…</p>
      )}
    </div>
  );
}
