import React, { useEffect, useState } from "react";
import "./App.css";

/* allowed characters for NAME input */
const NAME_RE = /^[a-z0-9.=]+$/;

/* ------------------------------------------------------------------ */
/*  Help modal – right-side pane                                      */
/* ------------------------------------------------------------------ */
function HelpModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog help" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <h2 style={{ marginTop: 0, marginBottom: ".8rem",
                     display: "flex", alignItems: "center", gap: ".6rem" }}>
          🚀 AppForge onboarding guide
        </h2>

        <p style={{ marginBottom: "1.5rem", lineHeight: 1.6 }}>
          AppForge speeds up <strong>RKE2 cluster onboarding</strong> by
          producing a trimmed, token-replaced&nbsp;
          <em>app-of-apps</em> Git repository – ready for Argo CD – in seconds.
        </p>

        <ol style={{ marginLeft: "1.1rem", lineHeight: 1.75, fontSize: ".97rem" }}>
          <li>🔑 <strong>Name</strong>: enter a lowercase token (e.g.&nbsp;
              <code>staging.eu</code>). It becomes the replacement string and
              the root folder inside the ZIP.</li>
          <li>📦 <strong>Select apps</strong>: tick the Helm Applications to
              ship with the cluster. Use the <em>Select all</em>/<em>Clear all</em>
              shortcuts for speed.</li>
          <li>🛠 <strong>Download ZIP</strong>: AppForge clones your GitOps
              repo, prunes unselected apps, performs token replacement and
              bundles the result under <code>&lt;name&gt;/</code>.</li>
          <li>🚚 <strong>Commit & deploy</strong>: push the folder to Git and
              let Argo CD bootstrap the cluster.</li>
        </ol>

        <p style={{ marginTop: "1.2rem", fontSize: ".92rem",
                    color: "var(--text-light)" }}>
          💡  Everything runs in an isolated container; no Kubernetes
          credentials ever leave the environment.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */
export default function App() {
  const [apps, setApps]   = useState([]);          // [{name,icon,desc}]
  const [sel , setSel ]   = useState(new Set());   // selected names
  const [name, setName]   = useState("");          // replacement token
  const [busy, setBusy]   = useState(false);
  const [showHelp, setH ] = useState(false);
  const [err , setErr ]   = useState("");

  /* fetch list + default name on mount */
  useEffect(() => {
    fetch("/api/apps").then(r => r.json()).then(setApps);
    fetch("/api/defaults").then(r => r.json()).then(d => setName(d.name || ""));
  }, []);

  /* validate name ------------------------------------------------ */
  function validate(v) {
    if (!v.trim()) return "Name is required.";
    if (!NAME_RE.test(v)) return "Lowercase letters, digits, '.' or '=' only.";
    return "";
  }
  useEffect(() => setErr(validate(name)), [name]);

  /* helpers ------------------------------------------------------ */
  const toggle = (n) => {
    const s = new Set(sel);
    s.has(n) ? s.delete(n) : s.add(n);
    setSel(s);
  };
  const selectAll   = () => setSel(new Set(apps.map(a => a.name)));
  const clearAll    = () => setSel(new Set());
  const canBuild    = !busy && sel.size && !err;

  /* build ZIP ---------------------------------------------------- */
  async function build() {
    setBusy(true);
    const res  = await fetch("/api/build", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ selected: [...sel], name })
    });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "appforge.zip"; a.click();
    URL.revokeObjectURL(url);
    setBusy(false);
  }

  /* render ------------------------------------------------------- */
  return (
    <div className="app-wrapper">
      {/* floating UI icons */}
      <button className="help-btn" onClick={() => setH(true)} title="Help">❔</button>

      <h1 style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
        ⚡ AppForge
      </h1>

      <p className="intro">
        🏗️ Use this portal to generate an <em>app-of-apps</em> repo for new
        RKE2 clusters in one click.
      </p>

      {/* ---- name input ---- */}
      <label style={{ fontWeight: 600, display: "block", marginBottom: ".4rem" }}>
        Name 🔑
      </label>
      <input
        value={name}
        onChange={e => { const v = e.target.value.toLowerCase(); setName(v); setErr(validate(v)); }}
        style={{ width: "100%", padding: ".55rem .8rem", fontSize: "1rem", marginBottom: ".35rem" }}
      />
      {err && <div className="error">{err}</div>}

      {/* ---- bulk select actions ---- */}
      <div className="apps-actions">
        <button className="btn-secondary" onClick={selectAll}>Select all</button>
        <button className="btn-secondary" onClick={clearAll}>Clear all</button>
      </div>

      {/* ---- app selector ---- */}
      <ul className="apps-list" style={{ marginBottom: "1.6rem" }}>
        {apps.map(app => (
          <li key={app.name}>
            <div
              className="app-item"
              title={app.desc || ""}
              onClick={() => toggle(app.name)}
            >
              <input
                type="checkbox"
                checked={sel.has(app.name)}
                readOnly
              />
              {app.icon
                ? <img src={app.icon} alt="" />
                : <span style={{ fontSize: "1.1rem" }}>📦</span>}
              {app.name}
            </div>
          </li>
        ))}
      </ul>

      {/* ---- build button ---- */}
      <button className="btn" disabled={!canBuild} onClick={build}>
        {busy ? "Building…" : "Download ZIP"}
      </button>

      {showHelp && <HelpModal onClose={() => setH(false)} />}
    </div>
  );
}
