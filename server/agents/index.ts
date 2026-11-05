import type { AgentInfo, AgentKind } from "../../shared/types.ts";
import { execText } from "../proc.ts";
import { runClaudeTurn } from "./claude.ts";
import { runCodexTurn } from "./codex.ts";
import type { RunTurn } from "./types.ts";

export const RUNNERS: Record<AgentKind, RunTurn> = {
  claude: runClaudeTurn,
  codex: runCodexTurn,
};

const LABELS: Record<AgentKind, string> = { claude: "Claude Code", codex: "Codex" };

/** 探测本机装了哪些 Agent。只跑 --version，不会触发任何模型调用 */
export async function detectAgents(): Promise<AgentInfo[]> {
  const kinds: AgentKind[] = ["claude", "codex"];
  return Promise.all(
    kinds.map(async (kind) => {
      try {
        const out = await execText(kind, ["--version"]);
        const version = out.match(/\d+\.\d+\.\d+/)?.[0] ?? out;
        return { kind, label: LABELS[kind], available: true, version };
      } catch {
        return { kind, label: LABELS[kind], available: false };
      }
    }),
  );
}
