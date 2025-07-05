/*  src/frontend/src/App.jsx  */
import React, { useEffect, useState } from "react";
import Spinner     from "./components/Spinner.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import "./App.css";

/* ── regex & helpers ───────────────────────────────────────── */
const REPO_RE   = /^git@[^:]+:[A-Za-z0-9._/-]+\.git$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
const toastDur  = 2000;
const rand  = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
const genToken  = () => rand() + rand();
const genPass   = () => rand();

/* ── steps meta ────────────────────────────────────────────── */
const steps = [
  { label:"Welcome",      desc:"Tiny tour of the whole flow." },
  { label:"Domain",       desc:"Domain injected into manifests." },
  { label:"Repo",         desc:"SSH URL of your Git repo." },
  { label:"Apps",         desc:"Pick the Helm apps you need." },
  { label:"ZIP + Repo",   desc:"Download ZIP, push to repo." },
  { label:"Secrets",      desc:"SSH keys, token & admin passwords." },
  { label:"Deploy key",   desc:"Add the SSH key to the repo." },
  { label:"SSH VMs",      desc:"Log into every RKE2 node." },
  { label:"Scripts",      desc:"Helper install scripts." },
  { label:"Overview",     desc:"Everything in one place." }
];

/* copy helper with fallback --------------------------------- */
async function copyText(txt, onDone){
  try{
    await navigator.clipboard.writeText(txt);
    onDone();
  }catch{
    const ta=document.createElement("textarea");
    ta.value=txt; ta.style.position="fixed"; ta.style.opacity="0";
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand("copy"); onDone(); }catch{}
    document.body.removeChild(ta);
  }
}

/* ─────────────────────────────────────────────────────────── */
export default function App(){

  /* state --------------------------------------------------- */
  const [domain,setDomain]     = useState("");
  const [repo,setRepo]         = useState("");
  const [apps,setApps]         = useState([]);
  const [sel,setSel]           = useState(new Set());
  const [open,setOpen]         = useState(new Set());

  const [keys,setKeys]         = useState(null);
  const [token,setToken]       = useState("");
  const [pwds,setPwds]         = useState(null);
  const [scripts,setScripts]   = useState([]);

  const [step,setStep]         = useState(0);

  const [busyZip,setBusyZip]   = useState(false);
  const [busyKey,setBusyKey]   = useState(false);
  const [busyScp,setBusyScp]   = useState(false);

  const [msg,setMsg] = useState("");
  const toast = t => { setMsg(t); setTimeout(()=>setMsg(""),toastDur); };
  const copyBtn = (txt,cls="tiny-btn") =>
    <button className={cls} onClick={()=>copyText(txt,()=>toast("Copied!"))}>⧉</button>;

  /* one-liner helpers -------------------------------------- */
  const oneLiner = (n,body)=>[
    `cat <<"EOF" > ${n}`, body.trimEnd(), "EOF", `sudo bash ${n}`
  ].join("\n");
  const oneLinerSecrets = (n,body)=>[
    `export ARGOCD_PASS="${pwds?.argocd??""}"`,
    `export KEYCLOAK_PASS="${pwds?.keycloak??""}"`,
    `export RANCHER_PASS="${pwds?.rancher??""}"`,
    `export SSH_PUBLIC="${keys?.publicKey??""}"`,
    "",
    oneLiner(n,body)
  ].join("\n");

  /* bootstrap ---------------------------------------------- */
  useEffect(()=>{ fetch("/api/apps").then(r=>r.json()).then(setApps); },[]);

  /* scripts pre-fetch -------------------------------------- */
  useEffect(()=>{
    if(step!==8||scripts.length||busyScp) return;
    setBusyScp(true);
    fetch("/api/scripts").then(r=>r.json()).then(setScripts).finally(()=>setBusyScp(false));
  },[step,scripts.length,busyScp]);

  /* generate secrets on entering Step 5 -------------------- */
  useEffect(()=>{
    if(step!==5) return;
    regenAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[step]);

  /* simple derived values ---------------------------------- */
  const domainOK   = DOMAIN_RE.test(domain.trim());
  const repoOK     = REPO_RE.test(repo.trim());
  const appsChosen = sel.size>0;
  const canZip     = domainOK && repoOK && appsChosen;

  /* auto-download ZIP -------------------------------------- */
  useEffect(()=>{ if(step===4 && canZip) buildZip(); },[step,canZip]);

  /* selection helpers -------------------------------------- */
  const toggleSel  = n=>{ const s=new Set(sel); s.has(n)?s.delete(n):s.add(n); setSel(s); };
  const toggleOpen = n=>{ const s=new Set(open); s.has(n)?s.delete(n):s.add(n); setOpen(s); };
  const selectAll  = ()=>setSel(new Set(apps.map(a=>a.name)));
  const unselectAll= ()=>setSel(new Set());

  /* regenerate everything ---------------------------------- */
  function regenAll(){
    setBusyKey(true);
    fetch("/api/ssh-keygen").then(r=>r.json()).then(setKeys).finally(()=>setBusyKey(false));
    setToken(genToken());
    setPwds({argocd:genPass(),keycloak:genPass(),rancher:genPass()});
  }

  /* ZIP builder -------------------------------------------- */
  async function buildZip(){
    if(busyZip) return;
    setBusyZip(true);
    const blob = await fetch("/api/build",{
      method:"POST",
      headers:{ "Content-Type":"application/json"},
      body:JSON.stringify({selected:[...sel],repo:repo.trim(),domain:domain.trim().toLowerCase()})
    }).then(r=>r.blob());
    const url=URL.createObjectURL(blob);
    Object.assign(document.createElement("a"),{href:url,download:`${domain||"appforge"}.zip`}).click();
    URL.revokeObjectURL(url); setBusyZip(false);
  }

  /* copy helpers for scripts ------------------------------- */
  const getFile = n => fetch(`/scripts/${n}`).then(r=>r.text());
  const copyScriptFile   = async n => copyText(await getFile(n),     ()=>toast("Copied!"));
  const copyPlainLiner   = async n => copyText(oneLiner(n, await getFile(n)),     ()=>toast("Copied!"));
  const copySecretLiner  = async n => copyText(oneLinerSecrets(n, await getFile(n)), ()=>toast("Copied!"));

  /* step intro snippet ------------------------------------- */
  const Intro = ({i})=><p className="intro">{steps[i].desc}</p>;

  /* nav ---------------------------------------------------- */
  const Nav = ({next=true})=>(
    <div style={{marginTop:"1rem"}}>
      <button className="btn-secondary" onClick={()=>setStep(step-1)}>← Back</button>
      {next && <button className="btn" onClick={()=>setStep(step+1)}>Next →</button>}
    </div>
  );

  /* renderer ----------------------------------------------- */
  function renderStep(){
    switch(step){

      case 0: return <>
        <h2>Welcome to AppForge 🚀</h2><Intro i={0}/>
        <ol style={{margin:"1rem 0 1.5rem 1.2rem"}}>
          {steps.slice(1).map((s,i)=><li key={i}>{s.label} – {s.desc}</li>)}
        </ol>
        <button className="btn" onClick={()=>setStep(1)}>Start →</button>
      </>;

      case 1: return <>
        <h2>Step 1 – Main domain</h2><Intro i={1}/>
        <input className="wizard-input" value={domain}
               onChange={e=>setDomain(e.target.value.toLowerCase())}
               placeholder="example.com"/>
        {!domainOK && <p className="error">Enter a valid domain.</p>}
        <button className="btn" disabled={!domainOK} onClick={()=>setStep(2)}>Next →</button>
      </>;

      case 2: return <>
        <h2>Step 2 – Git repository (SSH)</h2><Intro i={2}/>
        <input className="wizard-input" value={repo}
               onChange={e=>setRepo(e.target.value)}
               placeholder="git@host:group/repo.git"/>
        {!repoOK && <p className="error">Enter a valid SSH repository URL.</p>}
        <Nav next={repoOK}/>
      </>;

      case 3: return <>
        <h2>Step 3 – Choose applications</h2><Intro i={3}/>
        <div className="apps-actions">
          <button className="btn-secondary" onClick={selectAll}>Select all</button>
          <button className="btn-secondary" onClick={unselectAll}>Un-select all</button>
        </div>
        <ul className="apps-list">
          {apps.map(a=>{
            const hasInfo=a.desc||a.maint||a.home||a.readme;
            const opened=open.has(a.name);
            return(
              <li key={a.name}>
                <div className="app-item" data-selected={sel.has(a.name)}
                     onClick={()=>toggleSel(a.name)}>
                  <input type="checkbox" readOnly checked={sel.has(a.name)}/>
                  {a.icon?<img src={a.icon} alt="" width={24} height={24}/>:"📦"}
                  <span className="app-name">{a.name}</span>
                  <button className="info-btn" disabled={!hasInfo}
                          onClick={e=>{e.stopPropagation();toggleOpen(a.name);}}>
                    {opened?"▲":"ℹ️"}
                  </button>
                </div>
                {opened&&(
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
        <Nav next={appsChosen}/>
      </>;

      case 4: return <>
        <h2>Step 4 – Download ZIP & push</h2><Intro i={4}/>
        <p>
          1.&nbsp;<strong>Download ZIP</strong> (auto-starts).<br/>
          2.&nbsp;Create or empty the repository&nbsp;<code>{repo||"(repo)"}</code> and<br/>
          &nbsp;&nbsp;&nbsp; push the extracted files to the <code>main</code> branch.
        </p>
        <button className="btn" disabled={busyZip||!canZip} onClick={buildZip}>
          {busyZip?<Spinner size={18}/>:"Download ZIP"}
        </button>
        <Nav/>
      </>;

      case 5: return <>
        <h2>Step 5 – Secrets</h2><Intro i={5}/>
        {(!keys||!pwds||busyKey)
          ? <Spinner size={32}/>
          : <>
              <label>SSH public key</label>
              <div className="key-wrap">
                <pre className="key-block pub" style={{background:"var(--card)"}}>{keys.publicKey}</pre>
                {copyBtn(keys.publicKey,"action-btn key-copy")}
              </div>
              <label style={{marginTop:"1rem"}}>SSH private key</label>
              <div className="key-wrap">
                <pre className="key-block priv" style={{background:"var(--card)"}}>{keys.privateKey}</pre>
                {copyBtn(keys.privateKey,"action-btn key-copy")}
              </div>
              <label style={{marginTop:"1rem"}}>Rancher join token</label>
              <div className="key-wrap">
                <pre className="key-block pub" style={{background:"var(--card)"}}>{token}</pre>
                {copyBtn(token,"action-btn key-copy")}
              </div>
              <label style={{marginTop:"1rem"}}>Admin passwords</label>
              <ul className="summary-list" style={{marginTop:".3rem"}}>
                <li>Argo CD: {pwds.argocd} {copyBtn(pwds.argocd)}</li>
                <li>Keycloak: {pwds.keycloak} {copyBtn(pwds.keycloak)}</li>
                <li>Rancher: {pwds.rancher} {copyBtn(pwds.rancher)}</li>
              </ul>
              <button className="btn-secondary" onClick={regenAll}>Regenerate all secrets</button>
              <Nav/>
            </>
        }
      </>;

      case 6: return <>
        <h2>Step 6 – Install the public key</h2><Intro i={6}/>
        <p>Add the public key as a deploy key (read/write) in&nbsp;<code>{repo||"(repo)"}</code>.</p>
        {keys && copyBtn(keys.publicKey,"action-btn key-copy")}
        <Nav/>
      </>;

      case 7: return <>
        <h2>Step 7 – SSH onto the VMs</h2><Intro i={7}/>
        <p>Log into every VM that will join the RKE2 cluster.</p>
        <Nav/>
      </>;

      case 8: return <>
        <h2>Step 8 – Helper scripts</h2><Intro i={8}/>
        {busyScp
          ? <Spinner size={28}/>
          : <table className="scripts-table">
              <tbody>
                {scripts.map(s=>{
                  const btnsStyle={display:"flex",gap:".5rem",flexWrap:"wrap"};
                  return(
                    <tr key={s}>
                      <td><code>{s}</code></td>
                      <td style={btnsStyle}>
                        <a className="tiny-btn"  href={`/scripts/${s}`} download>Download</a>
                        <button className="tiny-btn" onClick={()=>copyScriptFile(s)}>Copy file</button>
                        <button className="tiny-btn" onClick={()=>copyPlainLiner(s)}>One-liner</button>
                        <button className="tiny-btn" onClick={()=>copySecretLiner(s)}>One-liner + secrets</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>}
        <Nav/>
      </>;

      default: return <>
        <h2>Step 9 – Overview 🎉</h2><Intro i={9}/>
        <table className="summary-table">
          <tbody>
            <tr><th>Domain</th>        <td>{domain}</td><td>{copyBtn(domain)}</td></tr>
            <tr><th>Git repo</th>      <td>{repo}</td>  <td>{copyBtn(repo)}</td></tr>
            <tr><th>Apps</th>          <td colSpan={2}>{[...sel].join(", ")||"—"}</td></tr>
            <tr><th>Rancher token</th> <td>{token}</td><td>{copyBtn(token)}</td></tr>
            <tr><th>SSH public key</th><td style={{wordBreak:"break-all"}}>{keys?.publicKey||"—"}</td>
                                        <td>{keys&&copyBtn(keys.publicKey)}</td></tr>
            <tr><th>SSH private key</th><td style={{wordBreak:"break-all"}}>{keys?.privateKey||"—"}</td>
                                        <td>{keys&&copyBtn(keys.privateKey)}</td></tr>
            <tr><th>Passwords</th><td colSpan={2}>
              Argo CD: {pwds?.argocd||"—"} · Keycloak: {pwds?.keycloak||"—"} · Rancher: {pwds?.rancher||"—"}
            </td></tr>
          </tbody>
        </table>
        <button className="btn" style={{marginTop:"1.2rem"}} onClick={()=>setStep(0)}>Start again</button>
      </>;
    }
  }

  /* render ------------------------------------------------- */
  return(
    <div className="app-wrapper">
      <ThemeToggle/>

      <div className="steps-nav">
        {steps.map((s,i)=>
          <div key={i}
               className={"step-pill "+(i===step?"active":i<step?"completed":"disabled")}
               title={s.desc}
               onClick={()=>{if(i<=step)setStep(i);}}>
            <span className="num">{i+1}</span>
            <span className="lbl">{s.label}</span>
          </div>
        )}
      </div>

      <div className="step-content">{renderStep()}</div>

      {msg && <div className="copy-msg">{msg}</div>}
    </div>
  );
}
