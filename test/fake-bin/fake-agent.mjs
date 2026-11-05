#!/usr/bin/env node
// 测试替身：回放 fixtures 里真实录制的事件流，并把收到的参数和 stdin 记下来供断言。
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
const name = process.env.FAKE_AGENT_NAME ?? basename(process.argv[1]);
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (stdin += c));
process.stdin.on("end", () => {
  if (process.env.FAKE_AGENT_LOG) {
    writeFileSync(process.env.FAKE_AGENT_LOG, JSON.stringify({ args: process.argv.slice(2), stdin, cwd: process.cwd() }));
  }
  if (process.env.FAKE_AGENT_MODE === "hang") return setInterval(() => {}, 1000);
  if (process.env.FAKE_AGENT_MODE === "fail") {
    process.stderr.write("boom: something broke\n");
    process.exit(3);
  }
  process.stdout.write(readFileSync(join(import.meta.dirname, "..", "fixtures", `${name}.jsonl`), "utf8"));
});
