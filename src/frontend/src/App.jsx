import React, { useEffect, useState } from "react";
import Spinner from "./components/Spinner.jsx";
import "./App.css";

const REPO_RE   = /^git@[^:]+:[A-Za-z0-9._/-]+\.git$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

const copy = (txt, ok) =>
  navigator.clipboard?.writeText(txt).then(ok);
const toastMs = 2000;

/* ─────────────────────────────────────────────────────────── */

export default function App() {
  const [domain, setDomain]   = useState("");
  const [repo,   setRepo]     = useState("");
  const [apps,   setApps]     = useState([]);
  const [sel,    setSel]      = useState(new Set());
  const [open,   setOpen]     = useState(new Set());

  const [keys,    setKeys]    = useState(null);
  const [scripts, setScripts] = useState([]);
  const [token,   setToken]   = useState("");
  const [step,    setStep]    = useState(0);

  const [busyZip,     setBusyZip]     = useState(false);
  const [busyKey,     setBusyKey]     = useState(false);
  const [busyScripts, setBusyScripts] = useState(false);

  const [msg, setMsg] = useState("");

  /* first-load -------------------------------------------------- */
  useEffect(() => { fetch("/api/apps").then(r=>r.json()).then(setApps); }, []);
  useEffect(() => {
    if (step===8 && !scripts.length && !busyScripts) fetchScripts();
  }, [step, scripts.length, busyScripts]);

  /* derived ---------------------------------------------------- */
  const domainOK   = DOMAIN_RE.test(domain.trim());
  const repoOK     = REPO_RE.test(repo.trim());
  const appsChosen = sel.size>0;
  const canZip     = domainOK && repoOK && appsChosen;

  /* backend helpers ------------------------------------------- */
  const fetchKeyPair = () => {
    setBusyKey(true);
    fetch("/api/ssh-keygen").then(r=>r.json()).then(setKeys).finally(()=>setBusyKey(false));
  };
  const fetchScripts = () => {
    setBusyScripts(true);
    fetch("/api/scripts").then(r=>r.json()).then(setScripts).finally(()=>setBusyScripts(false));
  };

  async function copyScript(name){
    const txt = await fetch(`/scripts/${name}`).then(r=>r.text());
    copy(txt, ()=>toast("Script copied"));
  }
  function copyOneLiner(name){
    const url = `${location.origin}/scripts/${name}`;
    copy(`curl -fsSL "${url}" | sudo bash`, ()=>toast("One-liner copied"));
  }
  const toast = t => { setMsg(t); setTimeout(()=>setMsg(""), toastMs); };

  /* ZIP builder ------------------------------------------------ */
  async function buildZip(){
    setBusyZip(true);
    const blob = await fetch("/api/build",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({selected:[...sel],repo:repo.trim(),domain:domain.trim().toLowerCase()})
    }).then(r=>r.blob());
    const url=URL.createObjectURL(blob);
    Object.assign(document.createElement("a"),{href:url,download:`${domain||"appforge"}.zip`}).click();
    URL.revokeObjectURL(url);
    setBusyZip(false);
  }

  const toggleSel  = n=>{const s=new Set(sel) ;s.has(n)?s.delete(n):s.add(n);setSel(s);};
  const toggleOpen = n=>{const s=new Set(open);s.has(n)?s.delete(n):s.add(n);setOpen(s);};

  /* ── step renderer ─────────────────────────────────────────── */
  function renderStep(){
    switch(step){
      /* 0 domain ------------------------------------------------ */
      case 0: return (
        <>
          <h2>Step 1 – Main domain</h2>
          <input className="wizard-input" value={domain}
                 onChange={e=>setDomain(e.target.value.toLowerCase())}
                 placeholder="example.com" />
          {!domainOK && <p className="error">Enter a valid domain.</p>}
          <button className="btn" disabled={!domainOK} onClick={()=>setStep(1)}>Next →</button>
        </>
      );

      /* 1 repo -------------------------------------------------- */
      case 1: return (
        <>
          <h2>Step 2 – Git repository (SSH)</h2>
          <input className="wizard-input" value={repo}
                 onChange={e=>setRepo(e.target.value)}
                 placeholder="git@gitlab.example.com:group/repo.git" />
          {!repoOK && <p className="error">Enter a valid SSH repository URL.</p>}
          <Nav nextOK={repoOK}/>
        </>
      );

      /* 2 choose apps ------------------------------------------ */
      case 2: return (
        <>
          <h2>Step 3 – Choose applications</h2>
          <ul className="apps-list">
            {apps.map(a=>{
              const info=a.desc||a.maint||a.home||a.readme;
              const isOpen=open.has(a.name);
              return(
                <li key={a.name}>
                  <div className="app-item" data-selected={sel.has(a.name)}
                       onClick={()=>toggleSel(a.name)}>
                    <input type="checkbox" readOnly checked={sel.has(a.name)}/>
                    {a.icon? <img src={a.icon} alt="" width={24}/> : "📦"}
                    <span className="app-name">{a.name}</span>
                    <button className="info-btn" disabled={!info}
                            onClick={e=>{e.stopPropagation();toggleOpen(a.name);}}>
                      {isOpen?"▲":"ℹ️"}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="app-more">
                      {a.desc  && <p>{a.desc}</p>}
                      {a.maint && <p><strong>Maintainers:</strong> {a.maint}</p>}
                      {a.home  && <p><strong>Home:</strong> <a href={a.home} target="_blank" rel="noreferrer">{a.home}</a></p>}
                      {a.readme&&(<details><summary>README preview</summary><pre>{a.readme}</pre></details>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <Nav nextOK={appsChosen}/>
        </>
      );

      /* 3 download zip ----------------------------------------- */
      case 3: return (
        <>
          <h2>Step 4 – Download tailored ZIP</h2>
          <button className="btn" disabled={busyZip||!canZip} onClick={buildZip}>
            {busyZip? <Spinner size={18}/> : "Download ZIP"}
          </button>
          <Nav/>
        </>
      );

      /* 4 create repo text ------------------------------------- */
      case 4: return (
        <>
          <h2>Step 5 – Create the app-of-apps repo</h2>
          <p>Create (or empty) the repository that will host the <code>app-of-apps</code> manifests.</p>
          <Nav/>
        </>
      );

      /* 5 generate SSH keys ------------------------------------ */
      case 5: return (
        <>
          <h2>Step 6 – Generate SSH key pair</h2>
          {!keys ? (
            <button className="btn" onClick={fetchKeyPair} disabled={busyKey}>
              {busyKey? <Spinner size={18}/> : "Generate keys"}
            </button>
          ):(
            <>
              <label>Public key</label>
              <pre className="key-block pub">{keys.publicKey}</pre>
              <button className="btn-secondary key-copy"
                      onClick={()=>copy(keys.publicKey,()=>toast("Copied"))}>Copy</button>

              <label style={{marginTop:"1rem"}}>Private key</label>
              <pre className="key-block priv">{keys.privateKey}</pre>
              <button className="btn-secondary key-copy"
                      onClick={()=>copy(keys.privateKey,()=>toast("Copied"))}>Copy</button>

              <Nav/>
            </>
          )}
        </>
      );

      /* 6 install pub key -------------------------------------- */
      case 6: return (
        <>
          <h2>Step 7 – Install the public key</h2>
          <p>Add the public key above as a deploy key (read/write) in the app-of-apps repo.</p>
          <button className="btn-secondary"
                  onClick={()=>copy(keys?.publicKey||"",()=>toast("Copied"))}>Copy public key</button>
          <Nav/>
        </>
      );

      /* 7 ssh onto vms ---------------------------------------- */
      case 7: return (
        <>
          <h2>Step 8 – SSH onto the VMs</h2>
          <p>Log into every VM that will join the RKE2 cluster.</p>
          <Nav/>
        </>
      );

      /* 8 scripts ---------------------------------------------- */
      case 8: return (
        <>
          <h2>Step 9 – Download install scripts</h2>
          {busyScripts? <Spinner size={28}/> : (
            <ul className="scripts-list">
              {scripts.map(s=>(
                <li key={s}>
                  <strong>{s}</strong>
                  <a className="btn-secondary" style={{marginLeft:"1rem"}} href={`/scripts/${s}`} download>Download</a>
                  <button className="btn-secondary" onClick={()=>copyScript(s)}>Copy script</button>
                  <button className="btn-secondary" onClick={()=>copyOneLiner(s)}>Copy one-liner</button>
                </li>
              ))}
            </ul>
          )}
          <Nav/>
        </>
      );

      /* 9 token ------------------------------------------------- */
      case 9: return (
        <>
          <h2>Step 10 – Generate RKE token</h2>
          {!token?(
            <button className="btn" onClick={()=>setToken(crypto.randomUUID?.()||Math.random().toString(36).slice(2,12))}>
              Generate token
            </button>
          ):(
            <>
              <pre className="key-block pub">{token}</pre>
              <button className="btn-secondary key-copy"
                      onClick={()=>copy(token,()=>toast("Copied"))}>Copy</button>
              <Nav/>
            </>
          )}
        </>
      );

      /* 10 run scripts ----------------------------------------- */
      case 10: return (
        <>
          <h2>Step 11 – Execute the scripts</h2>
          <p>Run the install scripts on <strong>worker</strong> nodes first, then on the <strong>control-plane</strong> nodes.</p>
          <Nav/>
        </>
      );

      /* 11 overview -------------------------------------------- */
      default:
        const copyBtn = (val)=>(
          <button className="btn-secondary summary-copy" onClick={()=>copy(val,()=>toast("Copied"))}>⧉</button>
        );
        return (
          <>
            <h2>Step 12 – Finished 🎉</h2>
            <h3>Overview</h3>
            <ul className="summary-list">
              <li><strong>Domain:</strong> {domain}{copyBtn(domain)}</li>
              <li><strong>Git repo:</strong> {repo}{copyBtn(repo)}</li>
              <li><strong>Apps:</strong> {[...sel].join(", ") || "—"}</li>
              <li><strong>SSH public key:</strong><br/>
                  <code style={{wordBreak:"break-all"}}>{keys?.publicKey||"—"}</code>
                  {keys && copyBtn(keys.publicKey)}
              </li>
              <li><strong>Token:</strong> {token||"—"}{token && copyBtn(token)}</li>
            </ul>
            <button className="btn" onClick={()=>setStep(0)}>Start again</button>
          </>
        );
    }
  }

  /* nav buttons component ------------------------------------- */
  const Nav = ({nextOK=true})=>(
    <div style={{marginTop:"1rem"}}>
      <button className="btn-secondary" onClick={()=>setStep(step-1)}>← Back</button>
      <button className="btn" disabled={!nextOK} onClick={()=>setStep(step+1)}>Next →</button>
    </div>
  );

  /* render ----------------------------------------------------- */
  return (
    <div className="app-wrapper">
      <div className="steps-nav">
        {Array.from({length:12}).map((_,i)=>(
          <div key={i} className={"step-pill "+(i===step?"active":i<step?"completed":"disabled")}
               onClick={()=>{if(i<=step)setStep(i);}}>{i+1}</div>
        ))}
      </div>

      <div className="step-content">{renderStep()}</div>
      {msg && <div className="copy-msg">{msg}</div>}
    </div>
  );
}
