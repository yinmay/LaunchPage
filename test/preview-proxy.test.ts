// 预览代理测试：HTML 注入框选脚本、非 HTML 原样透传、WebSocket upgrade 透传（vite HMR 依赖它）。
import http from "node:http";
import type { AddressInfo } from "node:net";
import { connect } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInjectingProxy, injectPicker } from "../server/preview-proxy.ts";

let upstream: http.Server;
let proxy: http.Server;
let base: string;

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    if (req.url === "/app.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end("console.log('</head>')");
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<html><head><title>t</title></head><body>host=${req.headers.host}</body></html>`);
  });
  upstream.on("upgrade", (_req, socket) => {
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
    socket.on("data", (d) => socket.write(d)); // 回声
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  const upPort = (upstream.address() as AddressInfo).port;
  proxy = createInjectingProxy(upPort);
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
});

afterAll(() => {
  proxy.closeAllConnections();
  upstream.closeAllConnections();
  proxy.close();
  upstream.close();
});

describe("预览代理", () => {
  it("在 HTML 的 </head> 前注入框选脚本，且 Host 改写成上游地址", async () => {
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('<script src="/__launchpage/picker.js" defer></script></head>');
    expect(html).toMatch(/host=127\.0\.0\.1:\d+/);
  });

  it("非 HTML 资源原样透传", async () => {
    expect(await (await fetch(`${base}/app.js`)).text()).toBe("console.log('</head>')");
  });

  it("自己提供框选脚本", async () => {
    const res = await fetch(`${base}/__launchpage/picker.js`);
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(await res.text()).toContain("launchpage-preview");
  });

  it("透传 WebSocket upgrade（HMR）", async () => {
    const { port } = new URL(base);
    const echoed = await new Promise<string>((resolve, reject) => {
      const sock = connect(Number(port), "127.0.0.1", () => {
        sock.write(
          "GET /?token=x HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n",
        );
      });
      let buf = "";
      sock.on("data", (d) => {
        buf += d.toString();
        if (buf.includes("101") && !buf.includes("ping")) sock.write("ping");
        if (buf.includes("ping")) {
          sock.destroy();
          resolve(buf);
        }
      });
      sock.on("error", reject);
    });
    expect(echoed).toContain("101 Switching Protocols");
    expect(echoed).toContain("ping");
  });

  it("injectPicker 不重复注入；没有 head 时退到 body", () => {
    const once = injectPicker("<head></head>");
    expect(injectPicker(once)).toBe(once);
    expect(injectPicker("<body>x</body>")).toContain("</script></body>");
  });
});
