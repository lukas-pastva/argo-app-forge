import React, { useEffect, useState } from "react";
import "./App.css";

const VALID = /^[a-z0-9.=]+$/;

/* tiny helpers -------------------------------------------------- */
const toSet = arr => new Set(arr.map(o => o.name));

export default function App() {
  const [apps, setApps]   = useState([]);   // [{name,icon,desc,maint,home,readme}]
  const [sel , setSel ]   = useState(new Set());
  const [open, setOpen]   = useState(new Set()); // info toggles
  const [name, setName]   = useState("");
  const [busy, setBusy]   = useState(false);
  const [tried,setTried]  = useState(false);
  const [help, setHelp]   = useState(false);

  /* fetch once on mount */
  useEffect(()=>{
    fetch("/api/apps").then(r=>r.json()).then(setApps);
    fetch("/api/defaults").then(r=>r.json()).then(d=>setName((d.name||"").toLowerCase()));
  },[]);

  /* validation */
  const valid  = !!name && VALID.test(name);
  const errMsg = tried && !valid
    ? (!name ? "Name is required." : "Only lower-case letters, digits, '.' and '=' allowed.")
    : "";

  /* selection helpers */
  const toggleSel  = n => { const s=new Set(sel); s.has(n)?s.delete(n):s.add(n); setSel(s); };
  const toggleInfo = n => { const s=new Set(open); s.has(n)?s.delete(n):s.add(n); setOpen(s); };

  /* main action */
  async function build(){
    setTried(true);
    if(!valid || !sel.size) return;
    setBusy(true);
    const res=await fetch("/api/build",{
      method :"POST",
      headers:{ "Content-Type":"application/json" },
      body   : JSON.stringify({ selected:[...sel], name })
    });
    const blob=await res.blob();
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"),{href:url,download:"appforge.zip"}).click();
    URL.revokeObjectURL(url);
    setBusy(false);
  }

  /* help modal -------------------------------------------------- */
  const Help = ()=>(
    <div className="modal-overlay" onClick={()=>setHelp(false)}>
      <div className="modal-dialog help" onClick={e=>e.stopPropagation()}>
        <button className="modal-close" onClick={()=>setHelp(false)}>×</button>
        <h2>Help&nbsp;📘</h2>
        <p>
          <strong>AppForge</strong> trims your company GitOps repository to the
          exact subset of Applications you need for a brand-new <strong>RKE2</strong> cluster.
        </p>
        <ol>
          <li>Tick the Applications to include.</li>
          <li>Fill&nbsp;in the cluster-specific <em>Name</em>.</li>
          <li>Click <em>Download ZIP</em> &nbsp;→&nbsp; push it as an <code>app-of-apps</code>.</li>
        </ol>
      </div>
    </div>
  );

  return (
    <div className="app-wrapper">
      {help && <Help/>}
      <button className="help-btn" onClick={()=>setHelp(true)}>Help ℹ️</button>

      <h1>AppForge</h1>
      <p className="intro">
        This wizard creates a tailor-made <strong>app-of-apps</strong> repo for onboarding new&nbsp;RKE2 clusters.
      </p>

      {/* top row ─────────────────────────────────────────────── */}
      <div className="top-row">
        <div className="name-field">
          <label>Name</label>
          <input value={name}
                 onChange={e=>setName(e.target.value.toLowerCase())}
                 placeholder="my-cluster.example.com" />
          {errMsg && <div className="error">{errMsg}</div>}
        </div>

        <button className="btn download-btn"
                onClick={build}
                disabled={busy || !sel.size || !valid}>
          {busy ? "Building…" : "Download ZIP"}
        </button>
      </div>

      {/* bulk actions ────────────────────────────────────────── */}
      <div className="apps-actions">
        <button className="btn"
                onClick={()=>setSel(toSet(apps))}
                disabled={!apps.length}>Select all</button>
        <button className="btn-secondary"
                onClick={()=>setSel(new Set())}>Deselect</button>
      </div>

      <p className="apps-header">
        Please select which apps you want installed on the&nbsp;RKE2&nbsp;cluster:
      </p>

      {/* grid ────────────────────────────────────────────────── */}
      <ul className="apps-list">
        {apps.map(a=>{
          const info=a.desc||a.maint||a.home||a.readme;
          const openInfo=open.has(a.name);
          return (
            <li key={a.name}>
              <div className="app-item"
                   onClick={()=>toggleSel(a.name)}
                   data-selected={sel.has(a.name)}>
                <input type="checkbox" checked={sel.has(a.name)} readOnly/>
                {a.icon
                  ? <img src={a.icon} alt=""/>
                  : <span className="fallback-ico">📦</span>}
                <span className="app-name">{a.name}</span>

                {info && (
                  <button className="more-btn"
                          onClick={e=>{ e.stopPropagation(); toggleInfo(a.name); }}>
                    {openInfo ? "▲" : "ℹ️"}
                  </button>
                )}
              </div>

              {openInfo && info && (
                <div className="app-more">
                  {a.desc && <p>{a.desc}</p>}
                  {a.maint && <p><strong>Maintainers:</strong> {a.maint}</p>}
                  {a.home &&  <p><strong>Home:</strong> <a href={a.home} target="_blank" rel="noreferrer">{a.home}</a></p>}
                  {a.readme && (
                    <details style={{marginTop:".4rem"}}>
                      <summary>README preview</summary>
                      <pre>{a.readme}</pre>
                    </details>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
