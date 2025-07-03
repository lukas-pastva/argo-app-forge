import React, { useEffect, useState } from "react";
import "./App.css";

/* simple modal for detailed help ------------------------------- */
function HelpModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        style={{ width: "64vw", maxWidth: 700 }}
        onClick={e => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 style={{ marginTop: 0 }}>How to use AppForge</h2>
        <ol style={{ margin: "0 0 1rem 1.25rem", padding: 0, lineHeight: 1.6 }}>
          <li>Enter a unique <strong>Name</strong> – this becomes
              the replacement token <em>and</em> the top-level folder name
              inside the resulting ZIP.</li>
          <li>Select the Helm <strong>Applications</strong> you want to keep.</li>
          <li>Click <em>Download ZIP</em>.  
              The backend clones your GitOps repo, removes everything else,
              performs the token replacement, bundles the tailored repo inside
              a folder named after your input, and streams it back.</li>
          <li>Unzip and commit / push as you like – no credentials from
              AppForge ever reach your cluster.</li>
        </ol>
        <p style={{ fontSize: ".9rem", color: "var(--text-light)" }}>
          Need more? Check the README in the project root for environment
          variables and developer tips.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [apps, setApps]   = useState([]);      // [{name,icon}]
  const [sel , setSel ]   = useState(new Set());
  const [name, setName]   = useState("");      // replacement token
  const [busy, setBusy]   = useState(false);
  const [showHelp, setH ] = useState(false);

  /* load list + default name on mount */
  useEffect(() => {
    fetch("/api/apps").then(r => r.json()).then(setApps);
    fetch("/api/defaults").then(r => r.json()).then(d => setName(d.name || ""));
  }, []);

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
    a.href = url;
    a.download = "appforge.zip";
    a.click();
    URL.revokeObjectURL(url);
    setBusy(false);
  }

  return (
    <div className="app-wrapper">
      {/* floating buttons */}
      <button className="help-btn" onClick={() => setH(true)} title="Help">❔</button>

      <h1>AppForge</h1>
      <p className="intro">
        Pick the apps you need, type a replacement&nbsp;name, then download your
        trimmed GitOps repo as a ready-to-install ZIP.
      </p>

      {/* replacement name input */}
      <label style={{ fontWeight: 600, display: "block", marginBottom: ".4rem" }}>
        Name
      </label>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        style={{
          width: "100%", padding: ".55rem .8rem", fontSize: "1rem",
          marginBottom: "1.5rem"
        }}
      />

      {/* app selector */}
      <ul className="apps-list">
        {apps.map(app => (
          <li key={app.name}>
            <label style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
              <input
                type="checkbox"
                checked={sel.has(app.name)}
                onChange={e => {
                  const s = new Set(sel);
                  e.target.checked ? s.add(app.name) : s.delete(app.name);
                  setSel(s);
                }}
              />
              {app.icon
                ? <img src={app.icon} alt="" style={{ width: 22, height: 22, borderRadius: 4 }} />
                : <span style={{ fontSize: "1.1rem" }}>📦</span>}
              {app.name}
            </label>
          </li>
        ))}
      </ul>

      <button
        className="btn"
        disabled={!sel.size || busy || !name.trim()}
        onClick={build}
      >
        {busy ? "Building…" : "Download ZIP"}
      </button>

      {showHelp && <HelpModal onClose={() => setH(false)} />}
    </div>
  );
}
