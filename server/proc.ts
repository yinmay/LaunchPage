import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, delimiter } from "node:path";

// Keep CLI children on the Node version running this service (GUI shells may expose an older node).
process.env.PATH = `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`;

/**
 * 以独立进程组启动子进程，这样停止时能连同它派生的孙进程一起结束
 * （Agent 跑的 pnpm / vite / playwright 都会再派生进程）。
 */
export function spawnGroup(
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv },
): ChildProcess {
  const child = spawn(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  });
  live.add(child);
  child.once("exit", () => live.delete(child));
  child.once("error", () => live.delete(child));
  return child;
}

export function killGroup(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

const live = new Set<ChildProcess>();

/** 服务退出时把所有子进程组一起带走，避免留下孤儿 vite / agent 进程 */
export function killAllChildren(): void {
  for (const child of live) killGroup(child, "SIGTERM");
}

/** 让操作系统分配一个空闲端口 */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

export function execText(cmd: string, args: string[], timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

/** 逐行读取子进程输出（JSONL 事件流） */
export function onLines(stream: NodeJS.ReadableStream, cb: (line: string) => void): void {
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buf += chunk;
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) cb(line);
      nl = buf.indexOf("\n");
    }
  });
  stream.on("end", () => {
    if (buf.trim()) cb(buf.trim());
  });
}
