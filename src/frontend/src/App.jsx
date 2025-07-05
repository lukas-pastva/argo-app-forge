import React, { useEffect, useState } from "react";
import Spinner from "./components/Spinner.jsx";
import "./App.css";

/* ── tiny helpers ───────────────────────────────────────────── */
const REPO_RE   = /^git@[^:]+:[A-Za-z0-9._/-]+\.git$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
const toastDur  = 2000;
const rand      = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
const genToken  = () => rand() + rand();
const genPass   = () => rand();

/* ── steps meta ─────────────────────────────────────────────── */
const steps = [
  { label:"Welcome",     desc:"Quick tour of what AppForge will do." },
  { label:"Domain",      desc:"Domain name substituted into manifests." },
  { label:"Repo",        desc:"SSH URL of your Git repo with manifests." },
  { label:"Apps",        desc:"Pick only the Helm apps you need." },
  { label:"ZIP",         desc:"Download a trimmed, token-replaced ZIP." },
  { label:"Create repo", desc:"Create (or empty) that Git repository." },
  { label:"Secrets",     desc:"Generate SSH keys, Rancher token, admin passwords." },
  { label:"Deploy key",  desc:"Add the public key above as a repo deploy key." },
  { label:"SSH VMs",     desc:"SSH onto each VM that will join the RKE2 cluster." },
  { label:"Scripts",     desc:"Download helper install scripts." },
  { label:"Run scripts", desc:"Run scripts with an all-in-one inline command." }
];

/* ───────────────────────────────────────────────────────────── */
export default function App() {

  /* state ---------------------------------------------------- */
  const [domain,setDomain]   = useState("");
  const [repo,setRepo]       = useState("");
  const [apps,setApps]       = useState([]);
  const [sel,setSel]         = useState(new Set());
  const [open,setOpen]       = useState(new Set());

  const [keys,setKeys]       = useState(null);
  const [token,setToken]     = useState("");
  const [pwds,setPwds]       = useState(null);      // argocd/keycloak/rancher
  const [scripts,setScripts] = useState([]);

  const [step,setStep]       = useState(0);

  /* loaders */
  const [busyZip,setBusyZip] = useState(false);
  const [busyKey,setBusyKey] = useState(false);
  const [busyScp,setBusyScp] = useState(false);

  /* toasts --------------------------------------------------- */
  const [msg,setMsg] = useState("");
  const toast = t => { setMsg(t); setTimeout(()=>setMsg(""),toastDur);} ;
  const copy  = (txt,cls="action-btn") =>
    navigator.clipboard?.writeText(txt).then(
      ()=>toast(cls.includes("key-copy")?"Copied":"Copied!")
    );
  const copyBtn = (val,cls="action-btn") =>
    <button className={cls} onClick={()=>copy(val,cls)}>⧉</button>;

  /* one-liner helpers --------------------------------------- */
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

  /* bootstrap ----------------------------------------------- */
  useEffect(()=>{ fetch("/api/apps").then(r=>r.json()).then(setApps); },[]);

  /* load script list in Steps 9 & 10 */
  useEffect(()=>{
    if (!(step===9||step===10) || scripts.length || busyScp) return;
    setBusyScp(true);
    fetch("/api/scripts").then(r=>r.json()).then(setScripts).finally(()=>setBusyScp(false));
  },[step,scripts.length,busyScp]);

  /* generate secrets on entering Step 6 */
  useEffect(()=>{
    if (step!==6) return;
    if (!keys && !busyKey){
      setBusyKey(true);
      fetch("/api/ssh-keygen").then(r=>r.json()).then(setKeys).finally(()=>setBusyKey(false));
    }
    if (!token) setToken(genToken());
    if (!pwds)  setPwds({argocd:genPass(),keycloak:genPass(),rancher:genPass()});
  },[step,keys,busyKey,token,pwds]);

  /* validations & derived ----------------------------------- */
  const domainOK   = DOMAIN_RE.test(domain.trim());
  const repoOK     = REPO_RE.test(repo.trim());
  const appsChosen = sel.size>0;
  const canZip     = domainOK && repoOK && appsChosen;

  /* auto-download ZIP --------------------------------------- */
  useEffect(()=>{ if(step===4 && canZip) buildZip();},[step,canZip]);

  /* togglers ------------------------------------------------- */
  const toggleSel  = n=>{ const s=new Set(sel); s.has(n)?s.delete(n):s.add(n); setSel(s); };
  const toggleOpen = n=>{ const s=new Set(open); s.has(n)?s.delete(n):s.add(n); setOpen(s); };

  /* regen keys */
  const regenKeys = ()=>{
    setBusyKey(true);
    fetch("/api/ssh-keygen").then(r=>r.json()).then(setKeys).finally(()=>setBusyKey(false));
  };

  /* build ZIP */
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

  /* copy whole script body helpers -------------------------- */
  const copyScript = async n => copy(await fetch(`/scripts/${n}`).then(r=>r.text()));
  const copyInline = async n =>{
    const body = await fetch(`/scripts/${n}`).then(r=>r.text());
    copy(inlineWithSecrets(n,body));
  };

  /* nav buttons */
  const Nav = ({nextOK=true})=>(
    <div style={{marginTop:"1rem"}}>
      <button className="btn-secondary" onClick={()=>setStep(step-1)}>← Back</button>
      <button className="btn" disabled={!nextOK} onClick={()=>setStep(step+1)}>Next →</button>
    </div>
  );
  const Intro = ({i})=><p className="intro">{steps[i].desc}</p>;

  /* renderer ------------------------------------------------- */
  function renderStep(){
    switch(step){

      /* 0 Welcome ------------------------------------------- */
      case 0: return <>
        <h2>{steps[0].label} to AppForge 🚀</h2>
        <Intro i={0}/>
        <ol style={{margin:"1rem 0 1.5rem 1.2rem"}}>
          {steps.slice(1).map((s,i)=><li key={i}><strong>{s.label}</strong> — {s.desc}</li>)}
        </ol>
        <button className="btn" onClick={()=>setStep(1)}>Start →</button>
      </>;

      /* 1 Domain ------------------------------------------- */
      case 1: return <>
        <h2>Step 1 – {steps[1].label}</h2><Intro i={1}/>
        <input className="wizard-input" value={domain}
               onChange={e=>setDomain(e.target.value.toLowerCase())}
               placeholder="example.com"/>
        {!domainOK && <p className="error">Enter a valid domain.</p>}
        <button className="btn" disabled={!domainOK} onClick={()=>setStep(2)}>Next →</button>
      </>;

      /* 2 Repo --------------------------------------------- */
      case 2: return <>
        <h2>Step 2 – {steps[2].label}</h2><Intro i={2}/>
        <input className="wizard-input" value={repo}
               onChange={e=>setRepo(e.target.value)}
               placeholder="git@host:group/repo.git"/>
        {!repoOK && <p className="error">Enter a valid SSH repository URL.</p>}
        <Nav nextOK={repoOK}/>
      </>;

      /* 3 Apps --------------------------------------------- */
      case 3: return <>
        <h2>Step 3 – {steps[3].label}</h2><Intro i={3}/>
        <ul className="apps-list">
          {apps.map(a=>{
            const opened=open.has(a.name);
            const hasInfo=a.desc||a.maint||a.home||a.readme;
            return(
              <li key={a.name}>
                <div className="app-item" data-selected={sel.has(a.name)}
                     onClick={()=>toggleSel(a.name)}>
                  <input type="checkbox" readOnly checked={sel.has(a.name)}/>
                  {a.icon ? <img src={a.icon} alt="" width={24} height={24}/> : "📦"}
                  <span className="app-name">{a.name}</span>
                  <button className="info-btn" disabled={!hasInfo}
                          onClick={e=>{e.stopPropagation(); toggleOpen(a.name);}}>
                    {opened?"▲":"ℹ️"}
                  </button>
                </div>
                {opened && (
                  <div className="app-more">
                    {a.desc&&<p>{a.desc}</p>}
                    {a.maint&&<p><strong>Maintainers:</strong> {a.maint}</p>}
                    {a.home&&<p><strong>Home:</strong> <a href={a.home} target="_blank" rel="noreferrer">{a.home}</a></p>}
                    {a.readme&&<details><summary>README preview</summary><pre>{a.readme}</pre></details>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <Nav nextOK={appsChosen}/>
      </>;

      /* 4 ZIP ---------------------------------------------- */
      case 4: return <>
        <h2>Step 4 – {steps[4].label}</h2><Intro i={4}/>
        <p>The ZIP download should start automatically. If not, click:</p>
        <button className="btn" disabled={busyZip||!canZip} onClick={buildZip}>
          {busyZip?<Spinner size={18}/>:"Download ZIP"}
        </button>
        <Nav/>
      </>;

      /* 5 Create repo -------------------------------------- */
      case 5: return <>
        <h2>Step 5 – {steps[5].label}</h2><Intro i={5}/>
        <p>Create (or empty) the destination Git repository.</p>
        <Nav/>
      </>;

      /* 6 Secrets ------------------------------------------ */
      case 6: return <>
        <h2>Step 6 – {steps[6].label}</h2><Intro i={6}/>
        {(!keys||!pwds||busyKey) ? <Spinner size={32}/> : <>
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

          <label style={{marginTop:"1.2rem"}}>Rancher bootstrap token</label>
          <div className="key-wrap">
            <pre className="key-block pub">{token}</pre>
            {copyBtn(token,"action-btn key-copy")}
          </div>

          <h3 style={{margin:"1.6rem 0 .6rem"}}>Admin passwords</h3>
          <table className="summary-table"><tbody>
            <tr><th>Argo CD</th> <td>{pwds.argocd}</td><td>{copyBtn(pwds.argocd,"action-btn")}</td></tr>
            <tr><th>Keycloak</th><td>{pwds.keycloak}</td><td>{copyBtn(pwds.keycloak,"action-btn")}</td></tr>
            <tr><th>Rancher</th> <td>{pwds.rancher}</td><td>{copyBtn(pwds.rancher,"action-btn")}</td></tr>
          </tbody></table>

          <button className="btn-secondary" style={{marginTop:".8rem"}} onClick={()=>{
            setToken(genToken()); setPwds({argocd:genPass(),keycloak:genPass(),rancher:genPass()});
          }}>Regenerate all secrets</button>
          <Nav/>
        </>}
      </>;

      /* 7 Deploy key --------------------------------------- */
      case 7: return <>
        <h2>Step 7 – {steps[7].label}</h2><Intro i={7}/>
        <p>Add the public key above as a deploy key (read/write) in the repo.</p>
        {keys && copyBtn(keys.publicKey,"action-btn key-copy")}
        <Nav/>
      </>;

      /* 8 SSH VMs ----------------------------------------- */
      case 8: return <>
        <h2>Step 8 – {steps[8].label}</h2><Intro i={8}/>
        <p>SSH into every VM that will join the RKE2 cluster.</p>
        <Nav/>
      </>;

      /* 9 Scripts download -------------------------------- */
      case 9: return <>
        <h2>Step 9 – {steps[9].label}</h2><Intro i={9}/>
        {busyScp ? <Spinner size={28}/> :
          <table className="scripts-table"><tbody>
            {scripts.map(s=>(
              <tr key={s}>
                <td><code>{s}</code></td>
                <td className="no-wrap">
                  <a href={`/scripts/${s}`} download className="action-btn">Download</a>
                  <button className="action-btn" onClick={()=>copyScript(s)}>One-liner</button>
                  <button className="action-btn" onClick={()=>copyInline(s)}>Inline + secrets</button>
                </td>
              </tr>
            ))}
          </tbody></table>}
        <Nav/>
      </>;

      /* 10 Run scripts ------------------------------------ */
      default: return <>
        <h2>Step 10 – {steps[10].label}</h2><Intro i={10}/>
        {busyScp ? <Spinner size={28}/> :
          <table className="scripts-table"><tbody>
            {scripts.map(s=>(
              <tr key={s}>
                <td><code>{s}</code></td>
                <td className="no-wrap">
                  <button className="action-btn" onClick={()=>copyScript(s)}>One-liner</button>
                  <button className="action-btn" onClick={()=>copyInline(s)}>Inline + secrets</button>
                </td>
              </tr>
            ))}
          </tbody></table>}
        <p style={{marginTop:".9rem"}}>
          Run the “Inline + secrets” block on <strong>workers</strong> first, then on the <strong>control-plane</strong> VMs.
        </p>
        <button className="btn" style={{marginTop:"1.2rem"}} onClick={()=>setStep(0)}>Start again</button>
      </>;
    }
  }

  /* render -------------------------------------------------- */
  return (
    <div className="app-wrapper">
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

      <div className="step-content">{renderStep()}</div>

      {msg && <div className="copy-msg">{msg}</div>}
    </div>
  );
}
