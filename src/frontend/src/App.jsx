import React, { useEffect, useState } from "react";
import "./App.css";

/* ── validators ─────────────────────────────────────────────── */
const REPO_RE = /^git@[^:]+:[A-Za-z0-9._/-]+\.git$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

export default function App() {
  /* ── state ───────────────────────────────────────────────── */
  const [domain, setDomain]   = useState("");
  const [repo,   setRepo]     = useState("");
  const [apps,   setApps]     = useState([]);          // [{name,icon,desc…}]
  const [sel,    setSel]      = useState(new Set());   // chosen app names
  const [open,   setOpen]     = useState(new Set());   // info-panes open
  const [keys,   setKeys]     = useState(null);
  const [scripts,setScripts]  = useState([]);
  const [token,  setToken]    = useState("");
  const [step,   setStep]     = useState(0);
  const [busyZip,setBusyZip]  = useState(false);
  const [copied, setCopied]   = useState("");          // tiny toast

  /* ── helpers ─────────────────────────────────────────────── */
  const copy = (txt, msg = "Copied") =>
    navigator.clipboard?.writeText(txt).then(() => {
      setCopied(msg);
      setTimeout(() => setCopied(""), 2000);
    });

  const toggleSel  = (n) => { const s=new Set(sel); s.has(n)?s.delete(n):s.add(n); setSel(s); };
  const toggleOpen = (n) => { const s=new Set(open); s.has(n)?s.delete(n):s.add(n); setOpen(s); };

  /* ── fetch app list once ─────────────────────────────────── */
  useEffect(() => { fetch("/api/apps").then(r=>r.json()).then(setApps); }, []);

  /* ── derived ─────────────────────────────────────────────── */
  const domainOK   = DOMAIN_RE.test(domain.trim());
  const repoOK     = REPO_RE.test(repo.trim());
  const appsChosen = sel.size > 0;
  const canZip     = domainOK && repoOK && appsChosen;

  /* ── ZIP builder ─────────────────────────────────────────── */
  async function buildZip() {
    setBusyZip(true);
    const blob = await fetch("/api/build", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        selected:[...sel],
        repo:repo.trim(),
        domain:domain.trim().toLowerCase()
      })
    }).then(r=>r.blob());
    Object.assign(document.createElement("a"),{
      href:URL.createObjectURL(blob),
      download:`${domain||"appforge"}.zip`
    }).click();
    setBusyZip(false);
  }

  /* ── backend helpers ─────────────────────────────────────── */
  const fetchKeyPair = () => fetch("/api/ssh-keygen").then(r=>r.json()).then(setKeys);
  const fetchScripts = () => fetch("/api/scripts").then(r=>r.json()).then(setScripts);

  async function copyScript(name){
    const txt = await fetch(`/scripts/${name}`).then(r=>r.text());
    copy(txt, "Script copied");
  }
  function copyOneLiner(name){
    const url = `${window.location.origin}/scripts/${name}`;
    copy(`curl -fsSL "${url}" | sudo bash`, "One-liner copied");
  }

  /* ── WIZARD steps ────────────────────────────────────────── */
  const steps = [

    /* 0 ─ domain */
    () => (
      <>
        <h2>Step 1 – Main domain</h2>
        <input className="wizard-input" value={domain}
               onChange={e=>setDomain(e.target.value.toLowerCase())}
               placeholder="example.com" />
        {!domainOK && <p className="error">Enter a valid domain.</p>}
        <button className="btn" disabled={!domainOK} onClick={()=>setStep(1)}>Next →</button>
      </>
    ),

    /* 1 ─ repo */
    () => (
      <>
        <h2>Step 2 – Git repository (SSH)</h2>
        <input className="wizard-input" value={repo}
               onChange={e=>setRepo(e.target.value)}
               placeholder="git@gitlab…:group/sub/repo.git" />
        {!repoOK && <p className="error">Enter a valid SSH repository URL.</p>}
        <button className="btn-secondary" onClick={()=>setStep(0)}>← Back</button>
        <button className="btn" disabled={!repoOK} onClick={()=>setStep(2)}>Next →</button>
      </>
    ),

    /* 2 ─ choose apps (info-pane restored) */
    () => (
      <>
        <h2>Step 3 – Choose applications</h2>

        <ul className="apps-list">
          {apps.map(a=>{
            const hasInfo = a.desc||a.maint||a.home||a.readme;
            const isOpen  = open.has(a.name);
            return (
              <li key={a.name}>
                <div className="app-item" data-selected={sel.has(a.name)}
                     onClick={()=>toggleSel(a.name)}>
                  <input type="checkbox" readOnly checked={sel.has(a.name)}/>
                  {a.icon ? <img src={a.icon} alt="" width={24}/> : <span>📦</span>}
                  <span className="app-name">{a.name}</span>

                  <button className="info-btn" disabled={!hasInfo}
                          onClick={e=>{e.stopPropagation();toggleOpen(a.name);}}>
                    {isOpen ? "▲" : "ℹ️"}
                  </button>
                </div>

                {isOpen && (
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

        <div style={{marginTop:"1rem"}}>
          <button className="btn-secondary" onClick={()=>setStep(1)}>← Back</button>
          <button className="btn" disabled={!appsChosen} onClick={()=>setStep(3)}>Next →</button>
        </div>
      </>
    ),

    /* 3 ─ download zip */
    () => (
      <>
        <h2>Step 4 – Download tailored ZIP</h2>
        <button className="btn" disabled={busyZip||!canZip} onClick={buildZip}>
          {busyZip?"Building…" :"Download ZIP"}
        </button>
        <div style={{marginTop:"1rem"}}>
          <button className="btn-secondary" onClick={()=>setStep(2)}>← Back</button>
          <button className="btn" onClick={()=>setStep(4)}>Next →</button>
        </div>
      </>
    ),

    /* 4 ─ create repo (text-only) */
    () => (
      <>
        <h2>Step 5 – Create the app-of-apps repo</h2>
        <p>In your Git provider, create (or empty) the repository that will hold the <code>app-of-apps</code> manifest.</p>
        <button className="btn" onClick={()=>setStep(5)}>Next →</button>
      </>
    ),

    /* 5 ─ generate SSH keys */
    () => (
      <>
        <h2>Step 6 – Generate SSH key pair</h2>
        {!keys ? (
          <button className="btn" onClick={fetchKeyPair}>Generate keys</button>
        ):(
          <>
            <label>Public key</label>
            <pre className="code-block">{keys.publicKey}</pre>
            <button className="btn-secondary" onClick={()=>copy(keys.publicKey)}>Copy</button>

            <label style={{marginTop:"1rem"}}>Private key</label>
            <pre className="code-block">{keys.privateKey}</pre>
            <button className="btn-secondary" onClick={()=>copy(keys.privateKey)}>Copy</button>

            <button className="btn" style={{marginTop:"1rem"}} onClick={()=>setStep(6)}>Next →</button>
          </>
        )}
      </>
    ),

    /* 6 ─ install pub key (text) */
    () => (
      <>
        <h2>Step 7 – Install the public key</h2>
        <p>Add the public key above as a deploy key (read/write) in the app-of-apps repo.</p>
        <button className="btn-secondary" onClick={()=>copy(keys?.publicKey||"")}>Copy public key</button>
        <button className="btn" style={{marginLeft:"1.2rem"}} onClick={()=>setStep(7)}>Next →</button>
      </>
    ),

    /* 7 ─ SSH to VMs (text) */
    () => (
      <>
        <h2>Step 8 – SSH onto the VMs</h2>
        <p>Log into every VM that will join the RKE2 cluster.</p>
        <button className="btn" onClick={()=>setStep(8)}>Next →</button>
      </>
    ),

    /* 8 ─ scripts list (3 buttons each) */
    () => (
      <>
        <h2>Step 9 – Download install scripts</h2>
        {!scripts.length ? (
          <button className="btn" onClick={fetchScripts}>Fetch list</button>
        ):(
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
        <button className="btn" style={{marginTop:"1rem"}} onClick={()=>setStep(9)}>Next →</button>
      </>
    ),

    /* 9 ─ RKE token */
    () => (
      <>
        <h2>Step 10 – Generate RKE token</h2>
        {!token ? (
          <button className="btn" onClick={()=>setToken(crypto.randomUUID?.()||Math.random().toString(36).slice(2,12))}>
            Generate token
          </button>
        ):(
          <>
            <pre className="code-block">{token}</pre>
            <button className="btn-secondary" onClick={()=>copy(token)}>Copy</button>
            <button className="btn" style={{marginLeft:"1.2rem"}} onClick={()=>setStep(10)}>Next →</button>
          </>
        )}
      </>
    ),

    /* 10 ─ run scripts (text) */
    () => (
      <>
        <h2>Step 11 – Execute the scripts</h2>
        <p>Run the install scripts on <strong>worker</strong> nodes first, then on the <strong>control-plane</strong> nodes.</p>
        <button className="btn" onClick={()=>setStep(11)}>Next →</button>
      </>
    ),

    /* 11 ─ done */
    () => (
      <>
        <h2>Step 12 – Finished 🎉</h2>
        <p>Your cluster should soon appear in Argo CD and start syncing workloads.</p>
        <button className="btn" onClick={()=>setStep(0)}>Start again</button>
      </>
    ),
  ];

  const Current = steps[step];

  /* ── render ───────────────────────────────────────────────── */
  return (
    <div className="app-wrapper">
      {/* step pills */}
      <div className="steps-nav">
        {steps.map((_,i)=>(
          <div key={i}
               className={"step-pill "+(i===step?"active":i<step?"completed":"disabled")}
               onClick={()=>{ if(i<=step) setStep(i); }}>
            {i+1}
          </div>
        ))}
      </div>

      <div className="step-content"><Current/></div>
      {copied && <div className="copy-msg">{copied}</div>}
    </div>
  );
}
