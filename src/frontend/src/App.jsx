import React, { useEffect, useState } from "react";
import Spinner     from "./components/Spinner.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
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
  const [pwds,setPwds]       = useState(null);
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

  /* load script list for Steps 9 & 10 */
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

  /* auto-download ZIP -------------------------------------- */
  useEffect(()=>{ if(step===4 && canZip) buildZip();},[step,canZip]);

  /* togglers ------------------------------------------------ */
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

  /* copy whole-script helpers -------------------------------- */
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

  /* renderer ------------------------------------------------ */
  function renderStep(){
    /* …------- SAME AS PREVIOUS VERSION, no changes inside the switch -------… */
    /* To keep the answer concise, the inner switch block is unchanged       */
    /* from the last file I sent and has been omitted for brevity.           */
  }

  /* render -------------------------------------------------- */
  return (
    <div className="app-wrapper">
      {/* night-mode icon */}
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

      <div className="step-content">{renderStep()}</div>

      {msg && <div className="copy-msg">{msg}</div>}
    </div>
  );
}
