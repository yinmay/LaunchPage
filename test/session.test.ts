// 会话层测试：用替身 Agent 跑两轮，验证历史不被覆盖、会话 id 被保存并用于续接、落盘可恢复。
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { ChatItem } from "../shared/types.ts";

const FAKE_BIN = join(import.meta.dirname, "fake-bin");
let mod: typeof import("../server/session.ts");
let projects: typeof import("../server/projects.ts");

beforeAll(async () => {
  // config.ts 在导入时读取环境变量，所以先设好再动态导入
  process.env.LAUNCHPAGE_HOME = mkdtempSync(join(tmpdir(), "lr-home-"));
  process.env.PATH = `${FAKE_BIN}:${process.env.PATH}`;
  process.env.FAKE_AGENT_MODE = "";
  mod = await import("../server/session.ts");
  projects = await import("../server/projects.ts");
});

async function waitIdle(s: { running: boolean }) {
  for (let i = 0; i < 100 && s.running; i++) await new Promise((r) => setTimeout(r, 50));
  expect(s.running).toBe(false);
}

describe("ProjectSession", () => {
  it("多轮对话不会互相覆盖条目（Agent 的 id 每轮会重新编号）", async () => {
    const p = await projects.createProject({
      name: "Demo",
      agent: "claude",
      materials: { repoPaths: [], urls: [], notes: "一个测试产品" },
    });
    const s = (await mod.ProjectSession.get(p.id))!;

    await s.kickoff();
    await waitIdle(s);
    const log = join(p.dir, "second-call.json");
    process.env.FAKE_AGENT_LOG = log;
    await s.send("再改一下");
    await waitIdle(s);
    delete process.env.FAKE_AGENT_LOG;

    const items = s.snapshot().items;
    const assistants = items.filter((i) => i.kind === "assistant");
    const tools = items.filter((i) => i.kind === "tool");
    expect(assistants).toHaveLength(2);
    expect(tools).toHaveLength(2);
    expect(items.filter((i) => i.kind === "user")).toHaveLength(2);

    // 第一轮拿到的会话 id 被保存，第二轮用它续接
    expect(s.project.sessions.claude).toBe("2a39476b-7d4a-4439-baa8-1fe078838d48");
    const args: string[] = JSON.parse(readFileSync(log, "utf8")).args;
    expect(args[args.indexOf("--resume") + 1]).toBe("2a39476b-7d4a-4439-baa8-1fe078838d48");

    // 落盘后重新读出来是同一份历史
    const reloaded: ChatItem[] = await projects.loadItems(s.project);
    expect(reloaded.map((i) => i.id)).toEqual(items.map((i) => i.id));
  });

  it("上一轮没结束时拒绝新消息", async () => {
    const p = await projects.createProject({
      name: "Busy",
      agent: "claude",
      materials: { repoPaths: [], urls: [], notes: "x" },
    });
    const s = (await mod.ProjectSession.get(p.id))!;
    process.env.FAKE_AGENT_MODE = "hang";
    await s.send("第一条");
    await expect(s.send("第二条")).rejects.toBeInstanceOf(mod.BusyError);
    s.stop();
    await waitIdle(s);
    process.env.FAKE_AGENT_MODE = "";
    expect(s.snapshot().items.at(-1)).toMatchObject({ kind: "system", text: "Turn stopped." });
  });

  it("并发提交时只启动一轮，不会在落盘期间重复启动 Agent", async () => {
    const p = await projects.createProject({ name: "Concurrent", agent: "codex", materials: { repoPaths: [], urls: [], notes: "x" } });
    const s = (await mod.ProjectSession.get(p.id))!;
    process.env.FAKE_AGENT_MODE = "hang";
    const results = await Promise.allSettled([s.send("第一条"), s.send("第二条")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    s.stop();
    await waitIdle(s);
    process.env.FAKE_AGENT_MODE = "";
  });
});
