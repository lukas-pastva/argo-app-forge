import React, { useEffect, useState } from "react";
import "./App.css";

const VALID_RE = /^[a-z0-9.=]+$/;

/* helper: Set from array of objects -------- */
const toSet = arr => new Set(arr.map(o => o.name));

export default function App() {
  const [apps,   setApps]   = useState([]);          // [{name,icon,desc,maint,home,readme}]
  const [sel,    setSel]    = useState(new Set());   // selected app names
  const [open,   setOpen]   = useState(new Set());   // info-panes open
  const [name,   setName]   = useState("");
  const [tried,  setTried]  = useState(false);
  const [busy,   setBusy]   = useState(false);
  const [help,   setHelp]   = useState(false);

  /* ── fetch data once ───────────────────── */
  useEffect(() => {
    fetch("/api/apps").then(r => r.json()).then(setApps);
    fetch("/api/defaults").then(r => r.json()).then(d => setName((d.name || "").trim().toLowerCase()));
  }, []);

  /* ── validation helpers ────────────────── */
  const valid = !!name && VALID_RE.test(name);
  const err   = tried && !valid
    ? (!name ? "Name is required." : "Only lower-case letters, digits, '.' and '=' allowed.")
    : "";

  /* ── actions ───────────────────────────── */
  const toggleSel  = n => { const s=new Set(sel); s.has(n)?s.delete(n):s.add(n); setSel(s); };
  const toggleOpen = n => { const s=new Set(open); s.has(n)?s.delete(n):s.add(n); setOpen(s); };

  async function build() {
    setTried(true);
    if (!valid || !sel.size) return;
    setBusy(true);
    const res  = await fetch("/api/build", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ selected:[...sel], name })
    });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href:url, download:"appforge.zip" }).click();
    URL.revokeObjectURL(url);
    setBusy(false);
  }

  /* ── help side-pane ────────────────────── */
  const Help = () => (
    <div className="modal-overlay" onClick={() => setHelp(false)}>
      <div className="modal-dialog help" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setHelp(false)}>×</button>
        <h2 style={{marginTop:0}}>Help 📘</h2>
        <p><strong>AppForge</strong> trims your GitOps repo to the exact set of Applications you need for a fresh <strong>RKE2</strong> cluster.</p>
        <ol>
          <li>Select the Applications you want.</li>
          <li>Fill&nbsp;in the unique <em>Name</em> for token replacement.</li>
          <li>Press <em>Download ZIP</em> – you’ll get a ready-to-push <code>app-of-apps</code>.</li>
        </ol>
      </div>
    </div>
  );

  /* ── render ────────────────────────────── */
  return (
    <div className="app-wrapper">
      {help && <Help />}
      <button className="help-btn" onClick={() => setHelp(true)}>Help ℹ️</button>

      <h1>AppForge</h1>
      <p className="intro">
        This wizard creates a tailor-made <strong>app-of-apps</strong> repository for onboarding new&nbsp;RKE2 clusters.
      </p>

      {/* top bar */}
      <div className="top-row">
        <div className="name-field">
          <label>Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value.toLowerCase().trim())}
            placeholder="my-cluster.example.com"
          />
          {err && <div className="error">{err}</div>}
        </div>

        <button
          className="btn download-btn"
          disabled={busy || !sel.size || !valid}
          onClick={build}
        >
          {busy ? "Building…" : "Download ZIP"}
        </button>
      </div>

      {/* bulk-select */}
      <div className="apps-actions">
        <button className="btn" onClick={() => setSel(toSet(apps))} disabled={!apps.length}>
          Select all
        </button>
        <button className="btn-secondary" onClick={() => setSel(new Set())}>
          Deselect
        </button>
      </div>

      <p className="apps-header">Please select which apps you want installed on&nbsp;the&nbsp;cluster:</p>

      {/* grid */}
      <ul className="apps-list">
        {apps.map(a => {
          const info = a.desc || a.maint || a.home || a.readme;
          const isOpen = open.has(a.name);
          return (
            <li key={a.name}>
              <div
                className="app-item"
                data-selected={sel.has(a.name)}
                onClick={() => toggleSel(a.name)}
              >
                <input type="checkbox" checked={sel.has(a.name)} readOnly />

                {a.icon
                  ? <img src={a.icon} alt="" />
                  : <span className="fallback-ico">📦</span>}

                <span className="app-name">{a.name}</span>

                {/* always show button – even if no meta (disabled style) */}
                <button
                  className="info-btn"
                  disabled={!info}
                  onClick={e => { e.stopPropagation(); toggleOpen(a.name); }}
                  title={info ? "Show info" : "No additional info"}
                >
                  {isOpen ? "▲" : "ℹ️"}
                </button>
              </div>

              {isOpen && (
                <div className="app-more">
                  {info
                    ? (
                      <>
                        {a.desc  && <p>{a.desc}</p>}
                        {a.maint && <p><strong>Maintainers:</strong> {a.maint}</p>}
                        {a.home  && <p><strong>Home:</strong> <a href={a.home} target="_blank" rel="noreferrer">{a.home}</a></p>}
                        {a.readme && (
                          <details style={{marginTop:".4rem"}}>
                            <summary>README preview</summary>
                            <pre>{a.readme}</pre>
                          </details>
                        )}
                      </>
                    )
                    : <em style={{color:"var(--text-light)"}}>No metadata found.</em>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
