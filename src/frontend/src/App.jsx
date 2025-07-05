/*  src/frontend/src/App.jsx  –  full file  */
import React, { useEffect, useState } from "react";
import Spinner     from "./components/Spinner.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import "./App.css";

/* ── helpers & regex ───────────────────────────────────────── */
const REPO_RE   = /^git@[^:]+:[A-Za-z0-9._/-]+\.git$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
const toastDur  = 2000;
const rand      = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
const genToken  = () => rand() + rand();
const genPass   = () => rand();

/* ── step metadata ─────────────────────────────────────────── */
const steps = [
  { label:"Welcome",     desc:"Quick tour of what AppForge will do." },
  { label:"Domain",      desc:"Domain name substituted into manifests." },
  { label:"Repo",        desc:"SSH URL of your Git repo with manifests." },
  { label:"Apps",        desc:"Pick only the Helm apps you need." },
  { label:"ZIP",         desc:"Download a trimmed, token-replaced ZIP." },
  { label:"Create repo", desc:"Create (or empty) that Git repository." },
  { label:"Secrets",     desc:"Generate SSH keys, Rancher token & admin passwords." },
  { label:"Deploy key",  desc:"Add the public SSH key as a repo deploy key." },
  { label:"SSH VMs",     desc:"SSH onto each VM that will join the RKE2 cluster." },
  { label:"Scripts",     desc:"Copy helper install scripts and run them on the nodes." },
  { label:"Overview",    desc:"Everything in one place – copy & save for later." }
];

/* ──────────────────────────────────────────────────────────── */
export default function App(){

  /* ── state ──────────────────────────────────────────────── */
  const [domain,setDomain]   = useState("");
  const [repo,setRepo]       = useState("");
  const [apps,setApps]       = useState([]);
  const [sel,setSel]         = useState(new Set());
  const [open,setOpen]       = useState(new Set());

  const [keys,setKeys]       = useState(null);          // { publicKey, privateKey }
  const [token,setToken]     = useState("");            // Rancher join token
  const [pwds,setPwds]       = useState(null);          // { argocd,keycloak,rancher }
  const [scripts,setScripts] = useState([]);

  const [step,setStep]       = useState(0);

  /* loaders */
  const [busyZip,setBusyZip] = useState(false);
  const [busyKey,setBusyKey] = useState(false);
  const [busyScp,setBusyScp] = useState(false);

  /* toast --------------------------------------------------- */
  const [msg,setMsg] = useState("");
  const toast = t => { setMsg(t); setTimeout(()=>setMsg(""),toastDur); };

  const copy = (txt,cls="action-btn") =>
    navigator.clipboard?.writeText(txt).then(
      ()=>toast(cls.includes("key-copy")?"Copied":"Copied!")
    );

  const copyBtn = (val,cls="action-btn") =>
    <button className={cls} onClick={()=>copy(val,cls)}>⧉</button>;

  /* one-liner helpers -------------------------------------- */
  const oneLiner = (n,body) => [
    `cat <<"EOF" > ${n}`,
    body.trimEnd(),
    "EOF",
    `sudo bash ${n}`
  ].join("\n");

  const inlineWithSecrets = (n,body) => [
    `export ARGOCD_PASS="${pwds?.argocd??""}"`,
    `export KEYCLOAK_PASS="${pwds?.keycloak??""}"`,
    `export RANCHER_PASS="${pwds?.rancher??""}"`,
    `export SSH_PUBLIC="${keys?.publicKey??""}"`,
    "",
    "export SSH_PRIVATE=$(cat <<'PK'",
    (keys?.privateKey??"").trimEnd(),
    "PK",
    ")",
    "",
    oneLiner(n,body)
  ].join("\n");

  /* ── bootstrap ─────────────────────────────────────────── */
  useEffect(()=>{ fetch("/api/apps").then(r=>r.json()).then(setApps); },[]);

  /* scripts list pre-fetch (only on step 9) ----------------- */
  useEffect(()=>{
    if (step!==9 || scripts.length || busyScp) return;
    setBusyScp(true);
    fetch("/api/scripts").then(r=>r.json()).then(setScripts).finally(()=>setBusyScp(false));
  },[step,scripts.length,busyScp]);

  /* generate secrets when entering step 6 ------------------- */
  useEffect(()=>{
    if (step!==6) return;
    if (!keys && !busyKey){
      setBusyKey(true);
      fetch("/api/ssh-keygen").then(r=>r.json()).then(setKeys).finally(()=>setBusyKey(false));
    }
    if (!token) setToken(genToken());
    if (!pwds)  setPwds({ argocd:genPass(), keycloak:genPass(), rancher:genPass() });
  },[step,keys,busyKey,token,pwds]);

  /* validations -------------------------------------------- */
  const domainOK   = DOMAIN_RE.test(domain.trim());
  const repoOK     = REPO_RE.test(repo.trim());
  const appsChosen = sel.size>0;
  const canZip     = domainOK && repoOK && appsChosen;

  /* auto-download ZIP on step 4 ----------------------------- */
  useEffect(()=>{ if(step===4 && canZip) buildZip(); },[step,canZip]);

  /* togglers ------------------------------------------------ */
  const toggleSel  = n => { const s=new Set(sel); s.has(n)?s.delete(n):s.add(n); setSel(s); };
  const toggleOpen = n => { const s=new Set(open); s.has(n)?s.delete(n):s.add(n); setOpen(s); };

  const regenKeys = ()=>{
    setBusyKey(true);
    fetch("/api/ssh-keygen").then(r=>r.json()).then(setKeys).finally(()=>setBusyKey(false));
  };

  /* build ZIP ---------------------------------------------- */
  async function buildZip(){
    if (busyZip) return;
    setBusyZip(true);
    const blob = await fetch("/api/build",{
      method:"POST",
      headers:{ "Content-Type":"application/json"},
      body:JSON.stringify({
        selected:[...sel],
        repo:repo.trim(),
        domain:domain.trim().toLowerCase()
      })
    }).then(r=>r.blob());

    const url=URL.createObjectURL(blob);
    Object.assign(document.createElement("a"),{href:url,download:`${domain||"appforge"}.zip`}).click();
    URL.revokeObjectURL(url);
    setBusyZip(false);
  }

  /* helper to copy complete inline script ------------------ */
  const copyInline = async n =>{
    const body = await fetch(`/scripts/${n}`).then(r=>r.text());
    copy(inlineWithSecrets(n,body));
  };

  /* shared intro line -------------------------------------- */
  const Intro = ({i}) => <p className="intro">{steps[i].desc}</p>;

  /* nav buttons -------------------------------------------- */
  const Nav = ({nextOK=true})=>(
    <div style={{marginTop:"1rem"}}>
      <button className="btn-secondary" onClick={()=>setStep(step-1)}>← Back</button>
      <button className="btn" disabled={!nextOK} onClick={()=>setStep(step+1)}>Next →</button>
    </div>
  );

  /* ── STEP RENDERER ─────────────────────────────────────── */
  function renderStep(){
    switch(step){

      /* 0 ─ Welcome ---------------------------------------- */
      case 0: return <>
        <h2>Welcome to AppForge 🚀</h2>
        <Intro i={0}/>
        <ol style={{margin:"1rem 0 1.5rem 1.2rem"}}>
          {steps.slice(1).map((s,i)=><li key={i}>{s.label} – {s.desc}</li>)}
        </ol>
        <button className="btn" onClick={()=>setStep(1)}>Start →</button>
      </>;

      /* 1 ─ Domain ----------------------------------------- */
      case 1: return <>
        <h2>Step 1 – Main domain</h2>
        <Intro i={1}/>
        <input className="wizard-input"
               value={domain}
               onChange={e=>setDomain(e.target.value.toLowerCase())}
               placeholder="example.com"/>
        {!domainOK && <p className="error">Enter a valid domain.</p>}
        <button className="btn" disabled={!domainOK} onClick={()=>setStep(2)}>Next →</button>
      </>;

      /* 2 ─ Repo ------------------------------------------- */
      case 2: return <>
        <h2>Step 2 – Git repository (SSH)</h2>
        <Intro i={2}/>
        <input className="wizard-input"
               value={repo}
               onChange={e=>setRepo(e.target.value)}
               placeholder="git@host:group/repo.git"/>
        {!repoOK && <p className="error">Enter a valid SSH repository URL.</p>}
        <Nav nextOK={repoOK}/>
      </>;

      /* 3 ─ Apps ------------------------------------------- */
      case 3: return <>
        <h2>Step 3 – Choose applications</h2>
        <Intro i={3}/>
        <ul className="apps-list">
          {apps.map(a=>{
            const hasInfo = a.desc||a.maint||a.home||a.readme;
            const opened  = open.has(a.name);
            return (
              <li key={a.name}>
                <div className="app-item" data-selected={sel.has(a.name)}
                     onClick={()=>toggleSel(a.name)}>
                  <input type="checkbox" readOnly checked={sel.has(a.name)}/>
                  {a.icon ? <img src={a.icon} alt="" width={24} height={24}/> : "📦"}
                  <span className="app-name">{a.name}</span>
                  <button className="info-btn" disabled={!hasInfo}
                          onClick={e=>{e.stopPropagation();toggleOpen(a.name);}}>
                    {opened?"▲":"ℹ️"}
                  </button>
                </div>
                {opened && (
                  <div className="app-more">
                    {a.desc   && <p>{a.desc}</p>}
                    {a.maint  && <p><strong>Maintainers:</strong> {a.maint}</p>}
                    {a.home   && <p><strong>Home:</strong> <a href={a.home} target="_blank"
                                   rel="noreferrer">{a.home}</a></p>}
                    {a.readme && <details><summary>README preview</summary><pre>{a.readme}</pre></details>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <Nav nextOK={appsChosen}/>
      </>;

      /* 4 ─ ZIP -------------------------------------------- */
      case 4: return <>
        <h2>Step 4 – Download tailored ZIP</h2>
        <Intro i={4}/>
        <p>The ZIP download should start automatically. If it doesn’t, click the button below.</p>
        <button className="btn" disabled={busyZip||!canZip} onClick={buildZip}>
          {busyZip ? <Spinner size={18}/> : "Download ZIP"}
        </button>
        <Nav/>
      </>;

      /* 5 ─ Create repo ------------------------------------ */
      case 5: return <>
        <h2>Step 5 – Create the app-of-apps repo</h2>
        <Intro i={5}/>
        <p>Create (or empty) the repository that will host the <code>app-of-apps</code> manifests.</p>
        <Nav/>
      </>;

      /* 6 ─ Secrets ---------------------------------------- */
      case 6: return <>
        <h2>Step 6 – Secrets</h2>
        <Intro i={6}/>
        {(!keys||!pwds||busyKey)
          ? <Spinner size={32}/>
          : <>
              <label>SSH public key</label>
              <div className="key-wrap">
                <pre className="key-block pub">{keys.publicKey}</pre>
                {copyBtn(keys.publicKey,"action-btn key-copy")}
              </div>

              <label style={{marginTop:"1rem"}}>SSH private key</label>
              <div className="key-wrap">
                <pre className="key-block priv">{keys.privateKey}</pre>
                {copyBtn(keys.privateKey,"action-btn key-copy")}
              </div>

              <label style={{marginTop:"1rem"}}>Rancher join token</label>
              <div className="key-wrap">
                <pre className="key-block pub">{token}</pre>
                {copyBtn(token,"action-btn key-copy")}
              </div>

              <label style={{marginTop:"1rem"}}>Admin passwords</label>
              <ul className="summary-list" style={{marginTop:".3rem"}}>
                <li>Argo CD admin: <code>{pwds.argocd}</code> {copyBtn(pwds.argocd,"tiny-btn")}</li>
                <li>Keycloak admin: <code>{pwds.keycloak}</code> {copyBtn(pwds.keycloak,"tiny-btn")}</li>
                <li>Rancher UI admin: <code>{pwds.rancher}</code> {copyBtn(pwds.rancher,"tiny-btn")}</li>
              </ul>

              <button className="btn-secondary" onClick={regenKeys}>Regenerate SSH keys</button>
              <Nav/>
            </>
        }
      </>;

      /* 7 ─ Deploy key ------------------------------------- */
      case 7: return <>
        <h2>Step 7 – Install the public key</h2>
        <Intro i={7}/>
        <p>Add the public key above as a <strong>deploy key</strong> (read/write) in the app-of-apps repo.</p>
        {keys && copyBtn(keys.publicKey,"action-btn key-copy")}
        <Nav/>
      </>;

      /* 8 ─ SSH VMs ---------------------------------------- */
      case 8: return <>
        <h2>Step 8 – SSH onto the VMs</h2>
        <Intro i={8}/>
        <p>Log into every VM that will join the RKE2 cluster.</p>
        <Nav/>
      </>;

      /* 9 ─ Scripts ---------------------------------------- */
      case 9: return <>
        <h2>Step 9 – Download install scripts</h2>
        <Intro i={9}/>
        {busyScp
          ? <Spinner size={28}/>
          : <table className="scripts-table">
              <tbody>
                {scripts.map(s=>(
                  <tr key={s}>
                    <td><code>{s}</code></td>
                    <td className="no-wrap">
                      <a   href={`/scripts/${s}`} download className="tiny-btn">Download</a>
                      <button className="tiny-btn" onClick={()=>copyScript(s)}>Copy file</button>
                      <button className="tiny-btn" onClick={()=>copyInline(s)}>One-liner + env vars</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
        <Nav/>
      </>;

      /* 10 ─ Overview -------------------------------------- */
      default: return <>
        <h2>Step 10 – Overview 🎉</h2>
        <Intro i={10}/>
        <table className="summary-table">
          <tbody>
            <tr><th>Domain</th>        <td>{domain}</td> <td>{copyBtn(domain,"tiny-btn")}</td></tr>
            <tr><th>Git repo</th>      <td>{repo}</td>   <td>{copyBtn(repo,"tiny-btn")}</td></tr>
            <tr><th>Apps</th>          <td colSpan={2}>{[...sel].join(", ")||"—"}</td></tr>
            <tr><th>Rancher token</th> <td>{token}</td>  <td>{copyBtn(token,"tiny-btn")}</td></tr>
            <tr><th>SSH public key</th><td style={{wordBreak:"break-all"}}>{keys?.publicKey||"—"}</td>
                                        <td>{keys && copyBtn(keys.publicKey,"tiny-btn")}</td></tr>
            <tr><th>SSH private key</th><td style={{wordBreak:"break-all"}}>{keys?.privateKey||"—"}</td>
                                        <td>{keys && copyBtn(keys.privateKey,"tiny-btn")}</td></tr>
            <tr><th>Passwords</th>     <td colSpan={2}>
                                          Argo CD: {pwds?.argocd||"—"} ·
                                          Keycloak: {pwds?.keycloak||"—"} ·
                                          Rancher: {pwds?.rancher||"—"}
                                        </td></tr>
          </tbody>
        </table>
        <button className="btn" style={{marginTop:"1.2rem"}} onClick={()=>setStep(0)}>
          Start again
        </button>
      </>;
    }
  }

  /* ── main render ───────────────────────────────────────── */
  return (
    <div className="app-wrapper">
      <ThemeToggle/>

      {/* step tracker */}
      <div className="steps-nav">
        {steps.map((s,i)=>(
          <div key={i}
               className={"step-pill "+(i===step?"active":i<step?"completed":"disabled")}
               title={s.desc}
               onClick={()=>{ if(i<=step) setStep(i); }}>
            <span className="num">{i+1}</span>
            <span className="lbl">{s.label}</span>
          </div>
        ))}
      </div>

      {/* current step */}
      <div className="step-content">{renderStep()}</div>

      {/* toast */}
      {msg && <div className="copy-msg">{msg}</div>}
    </div>
  );
}
