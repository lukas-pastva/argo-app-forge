import React, { useEffect, useState } from "react";
import "./App.css";

export default function App() {
  const [apps, setApps] = useState([]);          // [{name,icon}]
  const [sel , setSel ] = useState(new Set());
  const [name, setName] = useState("");          // replacement token
  const [busy, setBusy] = useState(false);

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
      <h1>AppForge</h1>

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
    </div>
  );
}
