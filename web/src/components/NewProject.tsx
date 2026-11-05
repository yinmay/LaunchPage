import { type FormEvent, useEffect, useState } from "react";
import type { AgentInfo, AgentKind, Project } from "../../../shared/types.ts";
import { api } from "../api.ts";

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function NewProject({ onCreated }: { onCreated: (p: Project) => void }) {
  const [agents, setAgents] = useState<AgentInfo[] | null>(null);
  const [skillMissing, setSkillMissing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [agent, setAgent] = useState<AgentKind | null>(null);
  const [repos, setRepos] = useState("");
  const [urls, setUrls] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .agents()
      .then((list) => {
        setAgents(list);
        setAgent((cur) => cur ?? list.find((a) => a.available)?.kind ?? null);
      })
      .catch(() => setAgents([]));
    api
      .health()
      .then((h) => setSkillMissing(h.landingSkillFound ? null : h.landingSkill))
      .catch(() => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!agent) return setError("请选择一个本机 Agent");
    setSubmitting(true);
    setError(null);
    try {
      const p = await api.create({
        name,
        agent,
        materials: { repoPaths: lines(repos), urls: lines(urls), notes },
      });
      onCreated(p);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="new-project">
      <div className="new-hero">
        <h1>把产品资料交给你的 Agent，得到一个首发用的 Landing Page</h1>
        <p className="muted">
          launchPage 调度你本机的 Claude Code 或 Codex 来生成页面，生成过程中右侧实时预览。
          哪里不满意，直接在预览里框选，告诉 Agent 怎么改。
        </p>
      </div>

      {skillMissing && (
        <div className="banner banner-warn" role="alert">
          没有找到 Landing Page skill：<code>{skillMissing}</code>。请用环境变量
          <code>LAUNCHPAGE_LANDING_SKILL</code> 指定 skill 目录后重启。
        </div>
      )}

      <form className="card form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="np-name">产品名</label>
          <input
            id="np-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：CanvasAgents"
            maxLength={60}
            required
          />
        </div>

        <fieldset className="field">
          <legend>用哪个 Agent 来做</legend>
          {agents === null ? (
            <p className="muted">正在检测本机 Agent…</p>
          ) : (
            <div className="agent-grid">
              {agents.map((a) => (
                <label
                  key={a.kind}
                  className={`agent-card${agent === a.kind ? " is-selected" : ""}${a.available ? "" : " is-disabled"}`}
                >
                  <input
                    type="radio"
                    name="agent"
                    value={a.kind}
                    checked={agent === a.kind}
                    disabled={!a.available}
                    onChange={() => setAgent(a.kind)}
                  />
                  <span className="agent-name">{a.label}</span>
                  <span className="agent-meta">
                    {a.available ? `已安装 · v${a.version}` : "未检测到，请先安装"}
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="field">
          <label htmlFor="np-repos">代码库 / 资料目录（可选）</label>
          <textarea
            id="np-repos"
            rows={2}
            value={repos}
            onChange={(e) => setRepos(e.target.value)}
            placeholder="/Users/you/workspace/my-product（每行一个本机路径；没有就留空）"
          />
        </div>

        <div className="field">
          <label htmlFor="np-urls">产品网址</label>
          <textarea
            id="np-urls"
            rows={2}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder="https://my-product.example.com（每行一个，线上或预发布环境都可以）"
          />
        </div>

        <div className="field">
          <label htmlFor="np-notes">补充说明（可选）</label>
          <textarea
            id="np-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="想强调的卖点、目标用户、参考网站……"
          />
          <p className="hint">代码库、网址、补充说明至少填一项。</p>
        </div>

        {error && (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        )}

        <div className="form-actions">
          <p className="hint">
            使用本机 Agent 的登录状态。生成的页面和对话保存在本地。
          </p>
          <button type="submit" className="btn btn-primary" disabled={submitting || !agent}>
            {submitting ? "正在创建…" : "开始生成"}
          </button>
        </div>
      </form>
    </div>
  );
}
