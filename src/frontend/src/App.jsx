import React, { useEffect, useState } from "react";
import Spinner from "./components/Spinner.jsx";
import "./App.css";

/* ── helpers ─────────────────────────────────────────────────── */
const REPO_RE   = /^git@[^:]+:[A-Za-z0-9._/-]+\.git$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
const stepsLbl  = [
  "Domain","Repo","Apps","ZIP","Create repo","SSH keys","Deploy key",
  "SSH VMs","Scripts","RKE token","Run scripts","Finish"
];
const copy      = (txt, ok) => navigator.clipboard?.writeText(txt).then(ok);
const toastDur  = 2000;
const genToken  = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2,12);

/* ────────────────────────────────────────────────────────────── */

export default function App() {
  /* ── state --------------------------------------------------- */
  const [domain,setDomain]   = useState("");
  const [repo,setRepo]       = useState("");
  const [apps,setApps]       = useState([]);
  const [sel,setSel]         = useState(new Set());
  const [open,setOpen]       = useState(new Set());

  const [keys,setKeys]       = useState(null);
  const [scripts,setScripts] = useState([]);
  const [token,setToken]     = useState("");

  const [step,setStep]       = useState(0);
  const [busyZip,setBusyZip] = useState(false);
  const [busyKey,setBusyKey] = useState(false);
  const [busyScp,setBusyScp] = useState(false);

  const [msg,setMsg]         = useState("");

  /* ── bootstrap ---------------------------------------------- */
  useEffect(()=>{ fetch("/api/apps").then(r=>r.json()).then(setApps); },[]);
  useEffect(()=>{
    if(step===8 && !scripts.length && !busyScp){
      setBusyScp(true);
      fetch("/api/scripts").then(r=>r.json()).then(setScripts)
                           .finally(()=>setBusyScp(false));
    }
  },[step,busyScp,scripts.length]);
  useEffect(()=>{ if(step===9 && !token) setToken(genToken()); },[step,token]);

  /* ── derived ------------------------------------------------- */
  const domainOK   = DOMAIN_RE.test(domain.trim());
  const repoOK     = REPO_RE.test(repo.trim());
  const appsChosen = sel.size>0;
  const canZip     = domainOK && repoOK && appsChosen;

  /* ── tiny helpers ------------------------------------------- */
  const toast      = t => { setMsg(t); setTimeout(()=>setMsg(""),toastDur); };
  const toggleSel  = n=>{const s=new Set(sel); s.has(n)?s.delete(n):s.add(n); setSel(s);};
  const toggleOpen = n=>{const s=new Set(open);s.has(n)?s.delete(n):s.add(n); setOpen(s);};

  async function buildZip(){
    setBusyZip(true);
    const blob = await fetch("/api/build",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        selected:[...sel],
        repo:repo.trim(),
        domain:domain.trim().toLowerCase()
      })
    }).then(r=>r.blob());
    const link = Object.assign(document.createElement("a"),{
      href:URL.createObjectURL(blob),
      download:`${domain||"appforge"}.zip`
    });
    link.click(); URL.revokeObjectURL(link.href);
    setBusyZip(false);
  }
  const fetchKeyPair = ()=>{
    setBusyKey(true);
    fetch("/api/ssh-keygen").then(r=>r.json()).then(setKeys)
                            .finally(()=>setBusyKey(false));
  };
  const copyScript = async n=>{
    const txt = await fetch(`/scripts/${n}`).then(r=>r.text());
    copy(txt,()=>toast("Script copied"));
  };
  const oneLiner = n => `curl -fsSL "${location.origin}/scripts/${n}" | sudo bash`;

  /* ── UI fragments ------------------------------------------- */
  const Nav = ({ok=true})=>(
    <div style={{marginTop:"1rem"}}>
      <button className="btn-secondary" onClick={()=>setStep(step-1)}>← Back</button>
      <button className="btn" disabled={!ok} onClick={()=>setStep(step+1)}>Next →</button>
    </div>
  );
  const copyBtn = (val,cls="btn-secondary")=>(
    <button className={cls} onClick={()=>copy(val,()=>toast("Copied"))}>⧉</button>
  );

  /* ── step renderer ------------------------------------------ */
  function renderStep(){
    switch(step){
      /* 0 – DOMAIN */
      case 0: return <>
        <h2>Step 1 – Main domain</h2>
        <input className="wizard-input" value={domain}
               onChange={e=>setDomain(e.target.value.toLowerCase())}
               placeholder="example.com"/>
        {!domainOK && <p className="error">Enter a valid domain.</p>}
        <button className="btn" disabled={!domainOK} onClick={()=>setStep(1)}>Next →</button>
      </>;

      /* 1 – REPO */
      case 1: return <>
        <h2>Step 2 – Git repository (SSH)</h2>
        <input className="wizard-input" value={repo}
               onChange={e=>setRepo(e.target.value)}
               placeholder="git@gitlab.example.com:group/repo.git"/>
        {!repoOK && <p className="error">Enter a valid SSH repository URL.</p>}
        <Nav ok={repoOK}/>
      </>;

      /* 2 – APPS */
      case 2: return <>
        <h2>Step 3 – Choose applications</h2>
        <ul className="apps-list">
          {apps.map(a=>{
            const info   = a.desc||a.maint||a.home||a.readme;
            const opened = open.has(a.name);
            return (
              <li key={a.name}>
                <div className="app-item" data-selected={sel.has(a.name)}
                     onClick={()=>toggleSel(a.name)}>
                  <input type="checkbox" readOnly checked={sel.has(a.name)}/>
                  {a.icon? <img src={a.icon} alt="" width={24} height={24}/> : "📦"}
                  <span className="app-name">{a.name}</span>
                  <button className="info-btn" disabled={!info}
                          onClick={e=>{e.stopPropagation();toggleOpen(a.name);}}>
                    {opened?"▲":"ℹ️"}
                  </button>
                </div>
                {opened && (
                  <div className="app-more">
                    {a.desc   && <p>{a.desc}</p>}
                    {a.maint  && <p><strong>Maintainers:</strong> {a.maint}</p>}
                    {a.home   && <p><strong>Home:</strong> <a href={a.home} target="_blank" rel="noreferrer">{a.home}</a></p>}
                    {a.readme && <details><summary>README preview</summary><pre>{a.readme}</pre></details>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <Nav ok={appsChosen}/>
      </>;

      /* 3 – ZIP */
      case 3: return <>
        <h2>Step 4 – Download tailored ZIP</h2>
        <button className="btn" disabled={busyZip||!canZip} onClick={buildZip}>
          {busyZip ? <Spinner size={18}/> : "Download ZIP"}
        </button>
        <Nav/>
      </>;

      /* 4 – CREATE REPO */
      case 4: return <>
        <h2>Step 5 – Create the app-of-apps repo</h2>
        <p>Create (or empty) the repository that will hold the <code>app-of-apps</code> manifests.</p>
        <Nav/>
      </>;

      /* 5 – SSH KEYS */
      case 5: return <>
        <h2>Step 6 – Generate SSH key pair</h2>
        {!keys
          ? <button className="btn" onClick={fetchKeyPair} disabled={busyKey}>
              {busyKey ? <Spinner size={18}/> : "Generate keys"}
            </button>
          : <>
              <label>Public key</label>
              <div className="key-wrap">
                <pre className="key-block pub">{keys.publicKey}</pre>
                <button className="btn-secondary key-copy"
                        onClick={()=>copy(keys.publicKey,()=>toast("Copied"))}>⧉</button>
              </div>

              <label style={{marginTop:"1rem"}}>Private key</label>
              <div className="key-wrap">
                <pre className="key-block priv">{keys.privateKey}</pre>
                <button className="btn-secondary key-copy"
                        onClick={()=>copy(keys.privateKey,()=>toast("Copied"))}>⧉</button>
              </div>
              <Nav/>
            </>
        }
      </>;

      /* 6 – DEPLOY KEY */
      case 6: return <>
        <h2>Step 7 – Install the public key</h2>
        <p>Add the public key above as a deploy key (read/write) in the app-of-apps repo.</p>
        {copyBtn(keys?.publicKey||"","btn")}
        <Nav/>
      </>;

      /* 7 – SSH VMs */
      case 7: return <>
        <h2>Step 8 – SSH onto the VMs</h2>
        <p>Log into every VM that will join the RKE2 cluster.</p>
        <Nav/>
      </>;

      /* 8 – SCRIPTS */
      case 8: return <>
        <h2>Step 9 – Download install scripts</h2>
        {busyScp
          ? <Spinner size={28}/>
          : <table className="scripts-table">
              <tbody>
                {scripts.map(s=>(
                  <tr key={s}>
                    <td><code>{s}</code></td>
                    <td className="no-wrap">
                      <a className="tiny-btn" href={`/scripts/${s}`} download>Download</a>
                      <button className="tiny-btn" onClick={()=>copyScript(s)}>Copy</button>
                      <button className="tiny-btn" onClick={()=>copy(oneLiner(s),()=>toast("Copied"))}>One-liner</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
        <Nav/>
      </>;

      /* 9 – RKE TOKEN */
      case 9: return <>
        <h2>Step 10 – RKE token</h2>
        <div className="key-wrap">
          <pre className="key-block pub">{token}</pre>
          <button className="btn-secondary key-copy"
                  onClick={()=>copy(token,()=>toast("Copied"))}>⧉</button>
        </div>
        <button className="btn-secondary" onClick={()=>setToken(genToken())}>Regenerate</button>
        <Nav/>
      </>;

      /* 10 – RUN SCRIPTS */
      case 10: return <>
        <h2>Step 11 – Execute the scripts</h2>
        <p>Run the install scripts on <strong>worker</strong> nodes first, then on the <strong>control-plane</strong> nodes.</p>
        <Nav/>
      </>;

      /* 11 – FINISH */
      default: return <>
        <h2>Step 12 – Finished 🎉</h2>
        <h3>Overview</h3>
        <table className="summary-table">
          <tbody>
            <tr><th>Domain</th>       <td>{domain}</td>                                     <td>{copyBtn(domain,"tiny-btn")}</td></tr>
            <tr><th>Git repo</th>     <td>{repo}</td>                                       <td>{copyBtn(repo,"tiny-btn")}</td></tr>
            <tr><th>Apps</th>         <td colSpan={2}>{[...sel].join(", ")||"—"}</td></tr>
            <tr><th>SSH public key</th><td style={{wordBreak:"break-all"}}>{keys?.publicKey||"—"}</td>
                                         <td>{keys && copyBtn(keys.publicKey,"tiny-btn")}</td></tr>
            <tr><th>RKE token</th>    <td>{token||"—"}</td>                                <td>{token && copyBtn(token,"tiny-btn")}</td></tr>
          </tbody>
        </table>
        <button className="btn" onClick={()=>setStep(0)}>Start again</button>
      </>;
    }
  }

  /* ── render -------------------------------------------------- */
  return (
    <div className="app-wrapper">
      <div className="steps-nav">
        {stepsLbl.map((lbl,i)=>(
          <div key={i}
               className={"step-pill "+(i===step?"active":i<step?"completed":"disabled")}
               onClick={()=>{if(i<=step)setStep(i);}}>
            <span className="num">{i+1}</span>
            <span className="lbl">{lbl}</span>
          </div>
        ))}
      </div>

      <div className="step-content">{renderStep()}</div>
      {msg && <div className="copy-msg">{msg}</div>}
    </div>
  );
}
