import React, { useEffect, useState } from "react";
import "./App.css";

const namesSet = (arr) => new Set(arr.map((a) => a.name));
const reValid  = /^[a-z0-9.=]+$/;

export default function App() {
  const [apps, setApps] = useState([]);          // full meta from backend
  const [sel , setSel ] = useState(new Set());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [tried,setTried]= useState(false);
  const [open , setOpen] = useState(new Set());  // info toggles

  /* fetch once */
  useEffect(()=>{
    fetch("/api/apps").then(r=>r.json()).then(setApps);
    fetch("/api/defaults").then(r=>r.json()).then(d=>setName((d.name||"").toLowerCase()));
  },[]);

  /* validation */
  const valid  = !!name.trim() && reValid.test(name.trim());
  const errMsg = !tried ? "" :
                 !name.trim() ? "Name is required." :
                 "Only lower-case letters, digits, '.' and '=' allowed.";

  /* helpers */
  const toggleSel  = n => { const s=new Set(sel); s.has(n)?s.delete(n):s.add(n); setSel(s); };
  const toggleInfo = n => { const s=new Set(open); s.has(n)?s.delete(n):s.add(n); setOpen(s); };

  /* build */
  async function build(){
    setTried(true);
    if(!valid) return;
    setBusy(true);
    const res=await fetch("/api/build",{
      method:"POST",headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ selected:[...sel], name })
    });
    const blob=await res.blob();
    const url =URL.createObjectURL(blob);
    Object.assign(document.createElement("a"),{ href:url, download:"appforge.zip" }).click();
    URL.revokeObjectURL(url);
    setBusy(false);
  }

  /* help modal */
  const Help = ()=>(
    <div className="modal-overlay" onClick={()=>setHelp(false)}>
      <div className="modal-dialog help" onClick={e=>e.stopPropagation()}>
        <button className="modal-close" onClick={()=>setHelp(false)}>×</button>
        <h2>Help 📘</h2>
        <p><strong>AppForge</strong> trims your company’s GitOps repo so it contains
          only the components you pick. You can then push the ZIP as a fresh
          <em>app-of-apps</em> for a new&nbsp;RKE2 cluster.</p>
        <ol style={{lineHeight:"1.55",margin:"1rem 0 0 1.3rem"}}>
          <li>Select the Applications you need.</li>
          <li>Provide a unique <em>Name</em> (used for hostnames &amp; tokens).</li>
          <li>Download the ready-to-push ZIP.</li>
        </ol>
      </div>
    </div>
  );

  return (
    <div className="app-wrapper">
      {help && <Help/>}
      <button className="help-btn" onClick={()=>setHelp(true)}>ℹ️ Help</button>

      <h1>AppForge</h1>
      <p className="intro">
        This tool prepares a minimal <strong>app-of-apps</strong> repository for
        onboarding new <strong>RKE2</strong> clusters.
      </p>

      {/* name + download row */}
      <div style={{display:"flex",alignItems:"flex-end",gap:"1.3rem"}}>
        <div style={{flex:1}}>
          <label>Name</label>
          <input value={name} onChange={e=>setName(e.target.value.toLowerCase())}
                 style={{width:"100%",padding:".55rem .9rem",fontSize:"1rem"}}/>
          {errMsg && <div className="error">{errMsg}</div>}
        </div>
        <button className="btn" disabled={busy||!sel.size} onClick={build}>
          {busy?"Building…":"Download ZIP"}
        </button>
      </div>

      {/* bulk buttons */}
      <div className="apps-actions">
        <button className="btn" onClick={()=>setSel(namesSet(apps))}>Select all</button>
        <button className="btn-secondary" onClick={()=>setSel(new Set())}>Deselect</button>
      </div>

      <p className="apps-header">
        Please select which apps you want to install on the&nbsp;RKE2&nbsp;cluster:
      </p>

      {/* grid */}
      <ul className="apps-list">
        {apps.map(a=>{
          const infoOpen=open.has(a.name);
          return (
            <li key={a.name}>
              {/* tile */}
              <div className="app-item" onClick={()=>toggleSel(a.name)}>
                <input type="checkbox" checked={sel.has(a.name)} readOnly/>
                {a.icon ? <img src={a.icon} alt=""/> : <span style={{fontSize:"1.1rem"}}>📦</span>}
                <span className="name">{a.name}</span>
                {(a.desc||a.maint||a.home||a.readme) && (
                  <button
                    className="more-btn"
                    onClick={e=>{e.stopPropagation();toggleInfo(a.name);}}>
                    {infoOpen?"Hide":"Info"}
                  </button>
                )}
              </div>

              {/* expanded details */}
              {infoOpen && (
                <div className="app-more">
                  {a.desc && <p style={{margin:0}}>{a.desc}</p>}
                  {a.maint && <p style={{margin:".3rem 0 0",fontSize:".8rem"}}>
                    <strong>Maintainers:</strong> {a.maint}
                  </p>}
                  {a.home && <p style={{margin:".3rem 0 0",fontSize:".8rem"}}>
                    <strong>Home:</strong> <a href={a.home} target="_blank" rel="noreferrer">{a.home}</a>
                  </p>}
                  {a.readme && (
                    <details style={{marginTop:".5rem"}}>
                      <summary style={{cursor:"pointer"}}>README preview</summary>
                      <pre style={{whiteSpace:"pre-wrap",marginTop:".4rem"}}>{a.readme}</pre>
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
