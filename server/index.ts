import { existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import type { AgentKind, CreateProjectInput, SendMessageInput } from "../shared/types.ts";
import { detectAgents } from "./agents/index.ts";
import { captureMaterials } from "./capture.ts";
import { IS_PROD, LANDING_SKILL_DIR, SERVER_PORT } from "./config.ts";
import { killAllChildren } from "./proc.ts";
import { createProject, listProjects, ValidationError } from "./projects.ts";
import { BusyError, ProjectSession } from "./session.ts";

const app = new Hono();

// ---- 安全：Agent 在本机拥有完整权限，API 绝不能被任意网页驱动 ----
// 1) 只认 localhost Host（防 DNS rebinding）；
// 2) 有 Origin 时必须是本机来源（防 CSRF）；
// 3) 写操作必须是 application/json，跨站请求会被迫走 CORS 预检，而我们不回 CORS 头。
const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/;
app.use("/api/*", async (c, next) => {
  const host = c.req.header("host") ?? "";
  const origin = c.req.header("origin");
  if (!LOCAL_HOST.test(host)) return c.json({ error: "forbidden host" }, 403);
  if (origin && !LOCAL_HOST.test(origin.replace(/^https?:\/\//, ""))) {
    return c.json({ error: "forbidden origin" }, 403);
  }
  if (c.req.method !== "GET" && !c.req.header("content-type")?.includes("application/json")) {
    return c.json({ error: "content-type must be application/json" }, 415);
  }
  await next();
});

app.onError((err, c) => {
  if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
  if (err instanceof BusyError) return c.json({ error: err.message }, 409);
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: err.message || "Internal server error" }, 500);
});

app.get("/api/health", (c) =>
  c.json({ ok: true, landingSkill: LANDING_SKILL_DIR, landingSkillFound: existsSync(join(LANDING_SKILL_DIR, "SKILL.md")) }),
);

app.get("/api/agents", async (c) => c.json(await detectAgents()));

app.get("/api/projects", async (c) => c.json(await listProjects()));

app.post("/api/projects", async (c) => {
  const input = await c.req.json<CreateProjectInput>();
  const agents = await detectAgents();
  if (!agents.find((a) => a.kind === input.agent)?.available) {
    throw new ValidationError("Selected agent not found locally. Install it or choose another agent.");
  }
  const project = await createProject(input);
  const session = await ProjectSession.get(project.id);
  await session?.kickoff();
  return c.json(project, 201);
});

async function sessionOr404(id: string) {
  const s = await ProjectSession.get(id);
  if (!s) throw new HTTPException(404, { message: "Project not found" });
  return s;
}

app.get("/api/projects/:id", async (c) => {
  const s = await ProjectSession.get(c.req.param("id"));
  return s ? c.json(s.snapshot()) : c.json({ error: "Project not found" }, 404);
});

app.get("/api/projects/:id/events", async (c) => {
  const s = await ProjectSession.get(c.req.param("id"));
  if (!s) return c.json({ error: "Project not found" }, 404);
  return streamSSE(c, async (stream) => {
    const unsubscribe = s.subscribe((ev) => {
      void stream.writeSSE({ data: JSON.stringify(ev) });
    });
    stream.onAbort(unsubscribe);
    await stream.writeSSE({ data: JSON.stringify({ type: "snapshot", snapshot: s.snapshot() }) });
    // 心跳，防止代理/浏览器把空闲连接掐掉
    while (!stream.aborted) {
      await stream.sleep(15_000);
      await stream.writeSSE({ event: "ping", data: "" });
    }
    unsubscribe();
  });
});

app.post("/api/projects/:id/messages", async (c) => {
  const s = await sessionOr404(c.req.param("id"));
  const body = await c.req.json<SendMessageInput>();
  await s.send(String(body.text ?? ""), Array.isArray(body.picks) ? body.picks.slice(0, 10) : undefined);
  return c.json({ ok: true }, 202);
});

app.post("/api/projects/:id/stop", async (c) => {
  (await sessionOr404(c.req.param("id"))).stop();
  return c.json({ ok: true });
});

app.post("/api/projects/:id/capture", async (c) => {
  const s = await sessionOr404(c.req.param("id"));
  return c.json(await captureMaterials(s.project));
});

app.post("/api/projects/:id/agent", async (c) => {
  const { agent } = await c.req.json<{ agent: AgentKind }>();
  if (agent !== "claude" && agent !== "codex") throw new ValidationError("Unknown agent");
  if (!(await detectAgents()).some((a) => a.kind === agent && a.available)) {
    throw new ValidationError("Selected agent not found locally");
  }
  await (await sessionOr404(c.req.param("id"))).setAgent(agent);
  return c.json({ ok: true });
});

app.post("/api/projects/:id/preview/restart", async (c) => {
  const s = await sessionOr404(c.req.param("id"));
  void s.preview.restart();
  return c.json({ ok: true }, 202);
});

// ---- 生产模式：同一个端口直接提供前端 ----
if (IS_PROD) {
  app.use("/*", serveStatic({ root: "./web/dist" }));
  app.get("*", serveStatic({ path: "./web/dist/index.html" }));
}

const server = serve({ fetch: app.fetch, port: SERVER_PORT, hostname: "127.0.0.1" }, (info) => {
  const url = IS_PROD ? `http://127.0.0.1:${info.port}` : "http://127.0.0.1:4711";
  console.log(`\n  launchPage 已启动 → ${url}\n`);
  if (!existsSync(join(LANDING_SKILL_DIR, "SKILL.md"))) {
    console.warn(`  ⚠ 没找到 Landing Page skill：${LANDING_SKILL_DIR}\n    用 LAUNCHPAGE_LANDING_SKILL=<目录> 指定\n`);
  }
});

const shutdown = async () => {
  await ProjectSession.stopAll();
  killAllChildren();
  server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
