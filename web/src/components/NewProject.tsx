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
    if (!agent) return setError("Select a local agent");
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
        <h1>Turn your product materials into a launch-ready landing page</h1>
        <p className="muted">
          launchPage uses your local Claude Code or Codex to build your page with a live preview on the right.
          Select anything in the preview and tell your agent what to change.
        </p>
      </div>

      {skillMissing && (
        <div className="banner banner-warn" role="alert">
          Landing Page skill not found: <code>{skillMissing}</code>. Set the environment variable 
          <code>LAUNCHPAGE_LANDING_SKILL</code> to the skill directory and restart.
        </div>
      )}

      <form className="card form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="np-name">Product name</label>
          <input
            id="np-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="For example: CanvasAgents"
            maxLength={60}
            required
          />
        </div>

        <fieldset className="field">
          <legend>Choose your agent</legend>
          {agents === null ? (
            <p className="muted">Detecting local agents…</p>
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
                    {a.available ? `Installed · v${a.version}` : "Not found. Install to continue."}
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="field">
          <label htmlFor="np-repos">Repository / reference folders (optional)</label>
          <textarea
            id="np-repos"
            rows={2}
            value={repos}
            onChange={(e) => setRepos(e.target.value)}
            placeholder="/Users/you/workspace/my-product (one local path per line; leave blank if none)"
          />
        </div>

        <div className="field">
          <label htmlFor="np-urls">Product URLs</label>
          <textarea
            id="np-urls"
            rows={2}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder="https://my-product.example.com (one per line; production or staging)"
          />
        </div>

        <div className="field">
          <label htmlFor="np-notes">Additional notes (optional)</label>
          <textarea
            id="np-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key benefits, target audience, reference websites…"
          />
          <p className="hint">Provide at least one repository, URL, or note.</p>
        </div>

        {error && (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        )}

        <div className="form-actions">
          <p className="hint">
            Uses your local agent login. Generated pages and conversations are saved locally.
          </p>
          <button type="submit" className="btn btn-primary" disabled={submitting || !agent}>
            {submitting ? "Creating…" : "Start generating"}
          </button>
        </div>
      </form>
    </div>
  );
}
