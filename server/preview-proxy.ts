// 预览代理：挡在 Agent 生成站点的 vite dev server 前面。
// - HTML 响应里注入框选脚本（不改用户站点的任何代码与配置，任何框架都适用）；
// - WebSocket upgrade 原样透传，所以 vite 的 HMR 照常工作 → Agent 改文件后预览自动刷新；
// - 自己提供 /__launchpage/picker.js。

import { readFileSync } from "node:fs";
import http from "node:http";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

const PICKER_PATH = "/__launchpage/picker.js";
const pickerJs = readFileSync(fileURLToPath(new URL("./picker/picker.js", import.meta.url)), "utf8");
const INJECT = `<script src="${PICKER_PATH}" defer></script>`;

export function createInjectingProxy(targetPort: number): http.Server {
  const target = `127.0.0.1:${targetPort}`;

  const server = http.createServer((req, res) => {
    if (req.url?.startsWith(PICKER_PATH)) {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(pickerJs);
      return;
    }

    // 要求上游不压缩，才能直接改写 HTML
    const headers = { ...req.headers, host: target, "accept-encoding": "identity" };
    const upstream = http.request(
      { host: "127.0.0.1", port: targetPort, method: req.method, path: req.url, headers },
      (up) => {
        const type = String(up.headers["content-type"] ?? "");
        if (!type.includes("text/html")) {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
          return;
        }
        const chunks: Buffer[] = [];
        up.on("data", (c: Buffer) => chunks.push(c));
        up.on("end", () => {
          const html = injectPicker(Buffer.concat(chunks).toString("utf8"));
          const out = { ...up.headers };
          // 改写后的 body 长度变了，并且是一次性发出的：去掉上游的分块/长度/压缩头
          delete out["content-length"];
          delete out["content-encoding"];
          delete out["transfer-encoding"];
          delete out.etag;
          res.writeHead(up.statusCode ?? 200, { ...out, "content-length": Buffer.byteLength(html) });
          res.end(html);
        });
      },
    );
    upstream.on("error", (err) => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Preview is temporarily unavailable: ${err.message}`);
    });
    req.pipe(upstream);
  });

  // 透传 WebSocket（vite HMR）
  server.on("upgrade", (req, socket, head) => {
    const up = connect(targetPort, "127.0.0.1", () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const k = req.rawHeaders[i];
        const v = k.toLowerCase() === "host" ? target : req.rawHeaders[i + 1];
        lines.push(`${k}: ${v}`);
      }
      up.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    const close = () => {
      up.destroy();
      socket.destroy();
    };
    up.on("error", close);
    socket.on("error", close);
  });

  return server;
}

export function injectPicker(html: string): string {
  if (html.includes(PICKER_PATH)) return html;
  if (html.includes("</head>")) return html.replace("</head>", `${INJECT}</head>`);
  if (html.includes("</body>")) return html.replace("</body>", `${INJECT}</body>`);
  return html + INJECT;
}
