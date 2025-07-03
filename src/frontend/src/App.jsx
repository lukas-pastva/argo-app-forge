import React, { useEffect, useState } from "react";
import "./App.css";

/* allowed characters: a-z 0-9 . =  (lower-case only) */
const NAME_RE = /^[a-z0-9.=]+$/;

/* simple modal with richer help --------------------------------- */
function HelpModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        style={{ width: "64vw", maxWidth: 720 }}
        onClick={e => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: ".5rem" }}>
          🚀 How AppForge streamlines onboarding
        </h2>
        <p style={{ margin: ".5rem 0 1rem" }}>
          AppForge is a self-service tool for <strong>accelerating RKE2 cluster
          onboarding</strong>.  In just a few clicks you receive a fully-trimmed&nbsp;
          <em>app-of-apps</em> Git repository that’s ready for Argo CD.
        </p>

        <ol style={{ margin: "0 0 1.2rem 1.2rem", lineHeight: 1.6 }}>
          <li>🔑 <strong>Name</strong>: supply a lowercase identifier (e.g.
              <code>staging.eu</code>). It becomes
              <em>•</em> the replacement token, <em>•</em> the top-level folder
              inside the ZIP, and <em>•</em> the cluster name used in manifests.</li>
          <li>📦 <strong>Select apps</strong>: tick only the Helm
              Applications you want to ship with the cluster.</li>
          <li>⚙️ <strong>Generate</strong>: hit <em>Download ZIP</em>.
              AppForge clones your GitOps repo, removes everything else, performs
              token replacement and bundles the result inside
              <code>{`<name>/`}</code>.</li>
          <li>🛠 <strong>Push & deploy</strong>: unzip, commit to your Git
              provider, and let Argo CD bootstrap the new cluster.</li>
        </ol>

        <p style={{ fontSize: ".9rem", color: "var(--text-light)" }}>
          Tip 💡 — No K8s or Docker creds ever leave the container; everything
          happens in an isolated, ephemeral workspace.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [apps, setApps]    = useState([]);     // [{name,icon}]
  const [sel , setSel ]    = useState(new Set());
  const [name, setName]    = useState("");     // replacement token
  const [busy, setBusy]    = useState(false);
  const [showHelp, setH ]  = useState(false);
  const [err , setErr ]    = useState("");     // validation error

  /* load list + default name on mount */
  useEffect(() => {
    fetch("/api/apps").then(r => r.json()).then(setApps);
    fetch("/api/defaults")
      .then(r => r.json())
      .then(d => setName(d.name || ""));
  }, []);

  /* validation -------------------------------------------------- */
  function validate(v) {
    if (!v.trim()) return "Name is required.";
    if (!NAME_RE.test(v)) return "Lowercase letters, digits, '.' or '=' only.";
    return "";
  }

  /* build ZIP --------------------------------------------------- */
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

  /* handle name change ----------------------------------------- */
  function onName(e) {
    const v = e.target.value.toLowerCase();   // force lower
    setName(v);
    setErr(validate(v));
  }

  /* initial validation for default name ------------------------ */
  useEffect(() => setErr(validate(name)), [name]);

  const canBuild = !busy && sel.size && !err;

  /* render ------------------------------------------------------ */
  return (
    <div className="app-wrapper">
      {/* floating help / theme buttons */}
      <button className="help-btn" onClick={() => setH(true)} title="Help">❔</button>

      <h1 style={{ display: "flex", alignItems: "center", gap: ".45rem" }}>
        ⚡ AppForge
      </h1>
      <p className="intro">
        🏗️ This portal is purpose-built for <strong>on-boarding new
        RKE2 clusters</strong>.  It trims an existing GitOps repository to only
        the selected Helm apps and produces an <em>app-of-apps</em> bundle in
        seconds.
      </p>

      {/* replacement name input */}
      <label style={{ fontWeight: 600, display: "block", marginBottom: ".4rem" }}>
        Name&nbsp;🔑
      </label>
      <input
        value={name}
        onChange={onName}
        style={{
          width: "100%", padding: ".55rem .8rem", fontSize: "1rem",
          marginBottom: ".3rem"
        }}
      />
      {err && <div className="error">{err}</div>}

      {/* app selector */}
      <ul className="apps-list" style={{ marginBottom: "1.5rem" }}>
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
        disabled={!canBuild}
        onClick={build}
      >
        {busy ? "Building…" : "Download ZIP"}
      </button>

      {showHelp && <HelpModal onClose={() => setH(false)} />}
    </div>
  );
}
