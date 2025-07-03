import React,{useEffect,useState} from "react";
import "./App.css";

export default function App(){
  const [apps,setApps]     = useState([]);
  const [sel,setSel]       = useState(new Set());
  const [busy,setBusy]     = useState(false);

  useEffect(()=>{ fetch("/api/apps").then(r=>r.json()).then(setApps); },[]);

  async function build(){
    setBusy(true);
    const res = await fetch("/api/build",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({selected:[...sel]})});
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href=url; a.download="appforge.zip"; a.click(); URL.revokeObjectURL(url);
    setBusy(false);
  }

  return (
    <div className="app-wrapper">
      <h1>AppForge</h1>
      <ul className="apps-list">{apps.map(n=> (
        <li key={n}><label><input type="checkbox"
          checked={sel.has(n)} onChange={e=>{const s=new Set(sel);e.target.checked?s.add(n):s.delete(n);setSel(s);}}/> {n}</label></li>
      ))}</ul>
      <button className="btn" disabled={!sel.size||busy} onClick={build}>{busy?"Building…":"Download ZIP"}</button>
    </div>
  );
}