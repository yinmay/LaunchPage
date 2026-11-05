import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentKind, ChatItem, PickedElement, ProjectSnapshot } from "../../../shared/types.ts";

interface Props {
  snap: ProjectSnapshot;
  picks: PickedElement[];
  onRemovePick: (index: number) => void;
  onSend: (text: string) => Promise<void>;
  onStop: () => void;
  onSwitchAgent: (agent: AgentKind) => Promise<unknown>;
}

const AGENT_LABEL: Record<AgentKind, string> = { claude: "Claude Code", codex: "Codex" };

export function Chat({ snap, picks, onRemovePick, onSend, onStop, onSwitchAgent }: Props) {
  const { project, items, running } = snap;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // 用户停在底部时才跟随新消息滚动，往上翻看历史时不打扰
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [items, running]);

  const send = async () => {
    const t = text.trim();
    if (!t || running || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(t);
      setText("");
      stickToBottom.current = true;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <section className="chat" aria-label="Chat with your agent">
      <div className="chat-head">
        <h2 className="chat-title" title={project.name}>
          {project.name}
        </h2>
        <label className="agent-switch">
          <span className="sr-only">Current agent</span>
          <select
            value={project.agent}
            disabled={running}
            onChange={(e) =>
              onSwitchAgent(e.target.value as AgentKind).catch((err: Error) => setError(err.message))
            }
          >
            <option value="claude">Claude Code</option>
            <option value="codex">Codex</option>
          </select>
        </label>
      </div>

      <details className="project-context">
        <summary>Product materials and output</summary>
        <div>
          {project.materials.repoPaths.map((path) => <p key={path}><strong>Reference folder</strong><code>{path}</code></p>)}
          {project.materials.urls.map((url) => <p key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></p>)}
          {project.materials.notes && <p className="context-notes">{project.materials.notes}</p>}
          <p><strong>Landing Page source</strong><code>{project.dir}/site</code></p>
        </div>
      </details>

      <div
        className="chat-list"
        ref={listRef}
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {items.map((item) => (
          <ChatRow key={item.id} item={item} />
        ))}
        {running && (
          <div className="working" role="status">
            <span className="dot-pulse" aria-hidden />
            {AGENT_LABEL[project.agent]} is working…
          </div>
        )}
      </div>

      <div className="composer">
        {picks.length > 0 && (
          <ul className="pick-chips" aria-label="Selected elements">
            {picks.map((p, i) => (
              <li key={`${p.selector}-${i}`} className="pick-chip" title={p.selector}>
                <span className="pick-tag">{p.tag}</span>
                <span className="pick-text">{p.text || p.selector}</span>
                <button
                  type="button"
                  className="pick-remove"
                  aria-label={`Remove selected element ${p.text || p.tag}`}
                  onClick={() => onRemovePick(i)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        )}
        <label htmlFor="composer-input" className="sr-only">
          Message your agent
        </label>
        <textarea
          id="composer-input"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            picks.length
              ? "Describe how to change your selection…"
              : running
                ? "Your agent is working. Send a message when it finishes."
                : "Answer your agent or describe what to change"
          }
        />
        <div className="composer-bar">
          <span className="hint">Enter to send · Shift+Enter for a new line</span>
          {running ? (
            <button type="button" className="btn btn-danger" onClick={onStop}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={send}
              disabled={!text.trim() || sending}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function ChatRow({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case "user":
      return (
        <div className="msg msg-user">
          {item.picks && item.picks.length > 0 && (
            <div className="msg-picks">Selected {item.picks.length} elements</div>
          )}
          <div className="msg-text">{item.text}</div>
        </div>
      );
    case "assistant":
      return (
        <div className="msg msg-assistant markdown">
          <Markdown remarkPlugins={[remarkGfm]}>{item.text}</Markdown>
        </div>
      );
    case "tool":
      return (
        <details className={`tool tool-${item.status}`}>
          <summary>
            <span className="tool-icon" aria-label={TOOL_STATUS[item.status]}>
              {item.status === "running" ? "◌" : item.status === "done" ? "✓" : "!"}
            </span>
            <span className="tool-title">{item.title}</span>
            {/* 真实 Agent 几乎都用 Bash 干活，只写「运行命令」看不出在干什么：附上一行摘要 */}
            {item.detail && <span className="tool-peek">{item.detail.split("\n")[0]}</span>}
          </summary>
          {item.detail && <pre className="tool-detail">{item.detail}</pre>}
        </details>
      );
    case "system":
      return (
        <div className={`sys sys-${item.level}`} role={item.level === "error" ? "alert" : undefined}>
          {item.text}
        </div>
      );
  }
}

const TOOL_STATUS = { running: "In progress", done: "Done", error: "Error" } as const;
