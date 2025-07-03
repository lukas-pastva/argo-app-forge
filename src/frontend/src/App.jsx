import React, { useEffect, useState } from "react";
import "./App.css";

/* simple helper for selecting / deselecting all */
const allNames = (arr) => new Set(arr.map((a) => a.name));

export default function App() {
  const [apps, setApps]   = useState([]);          // [{name,icon,desc?}]
  const [sel , setSel ]   = useState(new Set());
  const [name, setName]   = useState("");          // replacement token
  const [busy, setBusy]   = useState(false);
  const [showHelp, setH ] = useState(false);
  const [tried, setTry  ] = useState(false);       // form attempted?

  /* ── fetch list + default name on mount ────────────────────── */
  useEffect(() => {
    fetch("/api/apps").then(r => r.json()).then(setApps);
    fetch("/api/defaults").then(r => r.json()).then(d => setName(d.name || ""));
  }, []);

  /* ── helpers ──────────────────────────────────────────────── */
  const error = tried && !name.trim();

  function toggle(item) {
    const next = new Set(sel);
    next.has(item) ? next.delete(item) : next.add(item);
    setSel(next);
  }

  async function build() {
    setTry(true);
    if (!name.trim()) return;

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

  /* ── modal component ───────────────────────────────────────── */
  function HelpModal() {
    return (
      <div className="modal-overlay" onClick={() => setH(false)}>
        <div className="modal-dialog help" onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={() => setH(false)}>×</button>
          <h2>Help &nbsp;📘</h2>
          <p>
            <strong>AppForge</strong> packages exactly the selection you make
            below into a ready-to-apply GitOps repository:
          </p>
          <ul style={{ margin: ".8rem 0 1.4rem 1.2rem", lineHeight: "1.6" }}>
            <li>clones the upstream Argo CD <em>app-of-apps</em> repo</li>
            <li>keeps only the Applications you tick</li>
            <li>replaces every occurrence of the token with the <em>Name</em> you enter</li>
            <li>streams the result as a single ZIP archive</li>
          </ul>
          <p>
            Use it when rolling out a **new RKE2 cluster** – you’ll get a trimmed
            repo that can be pushed to your Git server or used as a one-off
            payload for <code>argocd app create …</code>
          </p>
        </div>
      </div>
    );
  }

  /* ── render ───────────────────────────────────────────────── */
  return (
    <div className="app-wrapper">
      {/* floating controls */}
      <button className="help-btn" onClick={() => setH(true)}>ℹ️ Help</button>

      {/* heading + intro */}
      <h1>AppForge</h1>
      <p className="intro">
        This tool streamlines onboarding of **new RKE2 clusters**. Choose the
        components you want and generate a pre-filled&nbsp;
        <em>app-of-apps</em> GitOps repository in seconds.
      </p>

      {/* Name field + Download button */}
      <div style={{ display:"flex",alignItems:"flex-end",gap:"1.2rem" }}>
        <div style={{ flex:1 }}>
          <label>Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value.toLowerCase())}
            style={{ width:"100%",padding:".55rem .9rem",fontSize:"1rem" }}
          />
          {error && <div className="error">Name is required.</div>}
        </div>
        <button
          className="btn"
          disabled={busy || !sel.size}
          onClick={build}
          style={{ whiteSpace:"nowrap" }}
        >
          {busy ? "Building…" : "Download ZIP"}
        </button>
      </div>

      {/* bulk-select helpers */}
      <div className="apps-actions">
        <button className="btn" onClick={() => setSel(allNames(apps))}>
          Select all
        </button>
        <button className="btn-secondary" onClick={() => setSel(new Set())}>
          Deselect all
        </button>
      </div>

      {/* explanatory subtitle */}
      <p className="apps-header">
        Please select which apps you want to be installed on the&nbsp;RKE2 cluster:
      </p>

      {/* app grid */}
      <ul className="apps-list">
        {apps.map(app => (
          <li
            key={app.name}
            className="app-item"
            onClick={() => toggle(app.name)}
            title={app.desc || app.name}
          >
            <input
              type="checkbox"
              checked={sel.has(app.name)}
              readOnly
            />
            {app.icon
              ? <img src={app.icon} alt="" />
              : <span style={{ fontSize:"1.1rem" }}>📦</span>}
            <span className="name">{app.name}</span>
          </li>
        ))}
      </ul>

      {showHelp && <HelpModal />}
    </div>
  );
}
