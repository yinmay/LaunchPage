// Agent 适配层测试：用回放真实录制事件流的替身可执行文件代替 claude / codex，
// 验证参数拼装、事件 → ChatItem 的映射、会话 id 捕获、失败与停止。
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { ChatItem } from "../shared/types.ts";
import { runClaudeTurn } from "../server/agents/claude.ts";
import { runCodexTurn } from "../server/agents/codex.ts";
import type { RunTurn } from "../server/agents/types.ts";

const FAKE_BIN = join(import.meta.dirname, "fake-bin");

beforeAll(() => {
  process.env.PATH = `${FAKE_BIN}:${process.env.PATH}`;
});

async function run(runner: RunTurn, opts: { sessionId?: string; mode?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "lr-test-"));
  const log = join(dir, "call.json");
  process.env.FAKE_AGENT_LOG = log;
  process.env.FAKE_AGENT_MODE = opts.mode ?? "";
  const items = new Map<string, ChatItem>();
  const sessions: string[] = [];
  const handle = runner(
    { cwd: dir, prompt: "做一个官网", sessionId: opts.sessionId, extraDirs: ["/repo/a"] },
    { onSession: (id) => sessions.push(id), onItem: (i) => items.set(i.id, i) },
  );
  return { handle, items, sessions, call: () => JSON.parse(readFileSync(log, "utf8")) };
}

describe("Claude Code 适配", () => {
  it("把 stream-json 映射成对话条目，并记下会话 id", async () => {
    const r = await run(runClaudeTurn);
    const result = await r.handle.done;
    expect(result).toEqual({ ok: true, stopped: false });
    expect(r.sessions[0]).toBe("2a39476b-7d4a-4439-baa8-1fe078838d48");

    const list = [...r.items.values()];
    expect(list[0]).toMatchObject({ kind: "tool", title: "读取 a.txt", status: "done" });
    expect(list[1]).toMatchObject({ kind: "assistant", text: "hello" });

    const call = r.call();
    expect(call.stdin).toBe("做一个官网");
    expect(call.args).toContain("acceptEdits");
    expect(call.args).not.toContain("--dangerously-skip-permissions");
    expect(call.args).toContain("--disallowedTools=AskUserQuestion");
    expect(call.args).toContain("--add-dir=/repo/a");
    expect(call.args).not.toContain("--resume");
  });

  it("有会话 id 时用 --resume 续接", async () => {
    const r = await run(runClaudeTurn, { sessionId: "sess-1" });
    await r.handle.done;
    const args: string[] = r.call().args;
    expect(args[args.indexOf("--resume") + 1]).toBe("sess-1");
  });

  it("异常退出时带上 stderr 作为错误信息", async () => {
    const r = await run(runClaudeTurn, { mode: "fail" });
    const result = await r.handle.done;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("boom");
  });

  it("stop() 结束进程并标记为已停止", async () => {
    const r = await run(runClaudeTurn, { mode: "hang" });
    await new Promise((res) => setTimeout(res, 300));
    r.handle.stop();
    expect(await r.handle.done).toEqual({ ok: false, stopped: true });
  });
});

describe("Codex 适配", () => {
  it("把 exec --json 事件映射成对话条目，并记下 thread id", async () => {
    const r = await run(runCodexTurn);
    const result = await r.handle.done;
    expect(result).toEqual({ ok: true, stopped: false });
    expect(r.sessions[0]).toBe("01a19596-de76-78e2-b8b9-773cb4fa4e95");

    const list = [...r.items.values()];
    // 配置告警是提示而非错误；reasoning 不展示
    expect(list[0]).toMatchObject({ kind: "system", level: "info" });
    expect(list[1]).toMatchObject({ kind: "tool", title: "运行命令", status: "done" });
    expect(list[2]).toMatchObject({ kind: "assistant", text: "hello" });
    expect(list).toHaveLength(3);

    const call = r.call();
    expect(call.stdin).toBe("做一个官网");
    expect(call.args.slice(0, 1)).toEqual(["exec"]);
    expect(call.args).toContain('sandbox_mode="workspace-write"');
    expect(call.args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(call.args.at(-1)).toBe("-");
  });

  it("有会话 id 时用 exec resume 续接", async () => {
    const r = await run(runCodexTurn, { sessionId: "thread-9" });
    await r.handle.done;
    expect(r.call().args.slice(0, 3)).toEqual(["exec", "resume", "thread-9"]);
  });
});
