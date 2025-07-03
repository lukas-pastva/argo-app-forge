import React, { useEffect, useState } from "react";
import "./App.css";

/* helper: full set of names */
const namesSet = (arr) => new Set(arr.map((a) => a.name));

export default function App() {
  const [apps, setApps] = useState([]);            // [{name,icon,desc,maint}]
  const [sel , setSel ] = useState(new Set());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [tried, setTry] = useState(false);         // attempted submit?
  const [open, setOpen] = useState(new Set());     // info toggles

  /* ── fetch data once ───────────────────────────────────────── */
  useEffect(() => {
    fetch("/api/apps").then(r => r.json()).then(setApps);
    fetch("/api/defaults")
      .then(r => r.json())
      .then(d => setName((d.name || "").toLowerCase()));
  }, []);

  /* ── validation ───────────────────────────────────────────── */
  const reValid = /^[a-z0-9.=]+$/;
  const valid   = !!name.trim() && reValid.test(name.trim());
  const errMsg  = !tried ? ""
               : !name.trim() ? "Name is required."
               : "Only lower-case letters, digits, '.' and '=' allowed.";

  /* ── selection helpers ────────────────────────────────────── */
  const toggle = (n) => {
    const next = new Set(sel);
    next.has(n) ? next.delete(n) : next.add(n);
    setSel(next);
  };
  const toggleInfo = (n) => {
    const next = new Set(open);
    next.has(n) ? next.delete(n) : next.add(n);
    setOpen(next);
  };

  /* ── build ZIP ────────────────────────────────────────────── */
  async function build() {
    setTry(true);
    if (!valid) return;

    setBusy(true);
    const res = await fetch("/api/build", {
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

  /* ── help modal component ─────────────────────────────────── */
  const Help = () => (
    <div className="modal-overlay" onClick={() => setHelp(false)}>
      <div className="modal-dialog help" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setHelp(false)}>×</button>
        <h2>Help 📘</h2>
        <p>
          <strong>AppForge</strong> prepares a <em>ready-to-push</em> Git repository
          that bootstraps a new&nbsp;RKE2 cluster with just the components you pick:
        </p>
        <ul style={{ margin:".9rem 0 1.5rem 1.3rem",lineHeight:"1.55" }}>
          <li>clones the upstream <code>app-of-apps</code> repo</li>
          <li>keeps only the selected <code>Application</code>s</li>
          <li>copies the referenced <code>charts/external/…</code> versions</li>
          <li>replaces every token with the <em>Name</em> you provide</li>
          <li>streams everything as one ZIP which you can push or unpack</li>
        </ul>
        <p style={{ marginTop:".6rem" }}>
          Typical workflow: generate → push to VCS → point Argo CD at the new repo &
          watch your cluster sync itself within minutes.
        </p>
      </div>
    </div>
  );

  /* ── render ───────────────────────────────────────────────── */
  return (
    <div className="app-wrapper">
      <button className="help-btn" onClick={() => setHelp(true)}>ℹ️ Help</button>

      <h1>AppForge</h1>
      <p className="intro">
        This tool streamlines onboarding of <strong>new RKE2 clusters</strong>.
        Choose the components you need and generate a trimmed&nbsp;
        <em>app-of-apps</em> repository in seconds.
      </p>

      {/* Name + Download */}
      <div style={{ display:"flex",alignItems:"flex-end",gap:"1.2rem" }}>
        <div style={{ flex:1 }}>
          <label>Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value.toLowerCase())}
            style={{ width:"100%",padding:".55rem .9rem",fontSize:"1rem" }}
          />
          {errMsg && <div className="error">{errMsg}</div>}
        </div>
        <button
          className="btn"
          disabled={busy || !sel.size}
          onClick={build}
        >
          {busy ? "Building…" : "Download ZIP"}
        </button>
      </div>

      {/* bulk-select */}
      <div className="apps-actions">
        <button className="btn" onClick={() => setSel(namesSet(apps))}>
          Select all
        </button>
        <button className="btn-secondary" onClick={() => setSel(new Set())}>
          Deselect all
        </button>
      </div>

      <p className="apps-header">
        Please select which apps you want to be installed on the&nbsp;RKE2 cluster:
      </p>

      {/* grid */}
      <ul className="apps-list">
        {apps.map(app => {
          const openInfo = open.has(app.name);
          return (
            <li key={app.name}>
              <div
                className="app-item"
                onClick={() => toggle(app.name)}
              >
                <input type="checkbox" checked={sel.has(app.name)} readOnly />
                {app.icon
                  ? <img src={app.icon} alt="" />
                  : <span style={{ fontSize:"1.1rem" }}>📦</span>}
                <span className="name">{app.name}</span>
                {(app.desc || app.maint) && (
                  <span
                    className="more-btn"
                    onClick={e => { e.stopPropagation(); toggleInfo(app.name); }}
                  >
                    {openInfo ? "Hide" : "More info"}
                  </span>
                )}
              </div>

              {openInfo && (
                <div className="app-more">
                  {app.desc && <p style={{ margin:0 }}>{app.desc}</p>}
                  {app.maint && (
                    <p style={{ margin:".3rem 0 0",fontSize:".8rem" }}>
                      <strong>Maintainers:</strong> {app.maint}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {help && <Help />}
    </div>
  );
}
