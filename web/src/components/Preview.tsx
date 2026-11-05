import { useEffect, useRef, useState } from "react";
import type {
  HostToPicker,
  PickedElement,
  PickerToHost,
  PreviewState,
} from "../../../shared/types.ts";
import { api } from "../api.ts";

interface Props {
  projectId: string;
  preview: PreviewState;
  running: boolean;
  clearToken: number;
  onPick: (el: PickedElement, additive: boolean) => void;
}

type Tab = "landing" | "video";
// 对联合类型逐个去掉 source 字段（普通 Omit 会把联合压扁）
type HostMsg = HostToPicker extends infer T ? (T extends HostToPicker ? Omit<T, "source"> : never) : never;
type Device = "desktop" | "mobile";

export function Preview({ projectId, preview, running, clearToken, onPick }: Props) {
  const [tab, setTab] = useState<Tab>("landing");
  const [device, setDevice] = useState<Device>("desktop");
  const [picking, setPicking] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = preview.status === "ready" && preview.url;

  // iframe 里的框选脚本报 ready 之后才发消息：加载/刷新途中 contentWindow 还是 about:blank，
  // 这时按预览 origin 发 postMessage 会被浏览器拒收并打警告
  const frameReady = useRef(false);
  const post = (msg: HostMsg) => {
    if (!preview.url || !frameReady.current) return;
    frame.current?.contentWindow?.postMessage(
      { source: "launchpage-host", ...msg },
      new URL(preview.url).origin,
    );
  };

  // 预览地址变了或手动刷新：等新文档重新报 ready
  // biome-ignore lint/correctness/useExhaustiveDependencies: 这两个值变化即代表 iframe 换了文档
  useEffect(() => {
    frameReady.current = false;
  }, [preview.url, reloadKey]);

  // 只接受来自当前预览 iframe 的消息
  useEffect(() => {
    if (!preview.url) return;
    const origin = new URL(preview.url).origin;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow) return;
      const d = e.data as PickerToHost;
      if (d?.source !== "launchpage-preview") return;
      if (d.type === "picked") onPick(d.element, !!d.additive);
      if (d.type === "pick-mode-off") setPicking(false);
      if (d.type === "ready") {
        // 每次文档加载（含 vite 整页刷新）都会报 ready：把当前框选状态同步过去
        frameReady.current = true;
        post({ type: "pick-mode", on: picking });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // biome-ignore lint/correctness/useExhaustiveDependencies: post 只依赖 preview.url
  }, [preview.url, picking, onPick]);

  useEffect(() => {
    post({ type: "pick-mode", on: picking });
    // biome-ignore lint/correctness/useExhaustiveDependencies: 只在开关变化时同步
  }, [picking]);

  useEffect(() => {
    if (clearToken > 0) post({ type: "clear" });
    // biome-ignore lint/correctness/useExhaustiveDependencies: 只在清除信号变化时同步
  }, [clearToken]);

  // 焦点在宿主页（比如输入框）时，Esc 到不了 iframe，这里也要能退出框选
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicking(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);

  // 预览不可用时自动退出框选
  useEffect(() => {
    if (!ready) setPicking(false);
  }, [ready]);

  return (
    <section className="preview" aria-label="Preview">
      <div className="preview-bar">
        <div className="tabs" role="tablist" aria-label="Asset type">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "landing"}
            className={`tab${tab === "landing" ? " is-active" : ""}`}
            onClick={() => setTab("landing")}
          >
            Landing Page
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "video"}
            className={`tab${tab === "video" ? " is-active" : ""}`}
            onClick={() => setTab("video")}
          >
            Promo Video <span className="badge">Coming soon</span>
          </button>
        </div>

        {tab === "landing" && (
          <div className="preview-tools">
            <button
              type="button"
              className={`btn btn-tool${picking ? " is-on" : ""}`}
              aria-pressed={picking}
              disabled={!ready}
              onClick={() => setPicking((v) => !v)}
              title="Click or drag to select elements in the preview. Press Esc to exit."
            >
              ⌖ {picking ? "Selecting (Esc to exit)" : "Select"}
            </button>
            <div className="seg" role="group" aria-label="Preview size">
              {(["desktop", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`seg-btn${device === d ? " is-on" : ""}`}
                  aria-pressed={device === d}
                  onClick={() => setDevice(d)}
                >
                  {d === "desktop" ? "Desktop" : "Mobile"}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-tool"
              disabled={!ready}
              onClick={() => setReloadKey((k) => k + 1)}
              aria-label="Refresh preview"
              title="Refresh preview"
            >
              ↻
            </button>
            {ready && (
              <a
                className="btn btn-tool"
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open preview in a new window"
                title="Open in a new window"
              >
                ↗
              </a>
            )}
          </div>
        )}
      </div>

      <div className="preview-body">
        {tab === "video" ? (
          <ComingSoon />
        ) : ready ? (
          <div className={`frame-wrap frame-${device}`}>
            <iframe
              key={reloadKey}
              ref={frame}
              src={preview.url}
              title="Landing Page live preview"
              className="frame"
            />
          </div>
        ) : (
          <PreviewPlaceholder
            preview={preview}
            running={running}
            onRestart={() => api.restartPreview(projectId)}
          />
        )}
      </div>
    </section>
  );
}

function PreviewPlaceholder({
  preview,
  running,
  onRestart,
}: {
  preview: PreviewState;
  running: boolean;
  onRestart: () => void;
}) {
  if (preview.status === "error") {
    return (
      <div className="center-state" role="alert">
        <p>Preview failed to start</p>
        <pre className="error-log">{preview.error}</pre>
        <button type="button" className="btn btn-primary" onClick={onRestart}>
          Restart preview
        </button>
      </div>
    );
  }
  const text =
    preview.status === "installing"
      ? "Installing site dependencies…"
      : preview.status === "starting"
        ? "Starting preview…"
        : running
          ? "Your agent is researching your product and drafting a plan. Your site will appear here when ready."
          : "No site yet. Ask your agent to continue in the chat on the left.";
  return (
    <div className="center-state muted" role="status">
      <div className="placeholder-icon" aria-hidden>
        ▢
      </div>
      <p>{text}</p>
    </div>
  );
}

function ComingSoon() {
  return (
    <div className="center-state">
      <div className="placeholder-icon" aria-hidden>
        ▶
      </div>
      <p>Promo videos are coming soon</p>
      <p className="muted">Create a product promo video from the same product materials and storyboard in a future update.</p>
    </div>
  );
}
