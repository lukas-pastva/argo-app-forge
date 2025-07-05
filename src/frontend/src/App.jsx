import React, { useEffect, useState } from "react";
import Spinner from "./components/Spinner.jsx";
import "./App.css";

/* ────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────── */
const REPO_RE   = /^git@[^:]+:[A-Za-z0-9._/-]+\.git$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

const toastDur  = 2000;
const rand      = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
const genToken  = () => rand() + rand();            // 2× for 24-ish chars
const genPass   = () => rand();                     // 12-ish chars

/* ────────────────────────────────────────────────────────────
   Wizard steps (label + description)
   ────────────────────────────────────────────────────────── */
const steps = [
  { label: "Welcome",     desc: "Overview of what AppForge does and how this wizard works." },
  { label: "Domain",      desc: "Pick the main domain that will be substituted into every manifest." },
  { label: "Repo",        desc: "Enter the SSH URL of the Git repository that will host the manifests." },
  { label: "Apps",        desc: "Select the Helm Applications you actually want to deploy." },
  { label: "ZIP",         desc: "Download the tailor-made ZIP containing only the apps you selected." },
  { label: "Create repo", desc: "Create (or empty) the destination Git repository." },
  { label: "Secrets",     desc: "Generate SSH keys, Rancher token and admin passwords for Argo CD, Keycloak and Rancher UI." },
  { label: "Deploy key",  desc: "Install the public key as a deploy key (read/write) in the repo." },
  { label: "SSH VMs",     desc: "Log into each VM that will join the RKE2 cluster." },
  { label: "Scripts",     desc: "Download helper scripts for installing RKE2 and dependencies." },
  { label: "Run scripts", desc: "Execute the install scripts on worker nodes first, then on control-plane nodes." },
  { label: "Finish",      desc: "All done – review the summary or start again." }
];

/* ────────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────── */
export default function App() {

  /* ---------------- state ---------------------------------- */
  const [domain,  setDomain]   = useState("");
  const [repo,    setRepo]     = useState("");
  const [apps,    setApps]     = useState([]);          // [{name,icon,…}]
  const [sel,     setSel]      = useState(new Set());
  const [open,    setOpen]     = useState(new Set());

  const [keys,        setKeys]   = useState(null);      // {publicKey,privateKey}
  const [token,       setToken]  = useState("");        // Rancher bootstrap token
  const [passwords,   setPwds]   = useState(null);      // {argocd,keycloak,rancher}
  const [scripts,     setScripts]= useState([]);

  const [step,  setStep]     = useState(0);

  /* loaders */
  const [busyZip, setBusyZip]  = useState(false);
  const [busyKey, setBusyKey]  = useState(false);
  const [busyScp, setBusyScp]  = useState(false);

  /* toast */
  const [msg, setMsg] = useState("");
  const toast = t => { setMsg(t); setTimeout(() => setMsg(""), toastDur); };

  /* copy helper */
  const copy = (txt, cls = "btn-copy") =>
    navigator.clipboard?.writeText(txt).then(
      () => toast(cls.includes("key-copy") ? "Copied" : "Copied!")
    );
  const copyBtn = (val, cls = "btn-copy") =>
    <button className={cls} onClick={() => copy(val, cls)}>⧉</button>;

  /* one-liner helper for scripts */
  const oneLiner = n => [
    `cat <<"EOF" > ${n}`,
    `$(curl -fsSL "${location.origin}/scripts/${n}")`,
    `EOF`,
    `sudo bash ${n}`
  ].join("\n");

  /* ---------------- bootstrap ------------------------------ */
  useEffect(() => { fetch("/api/apps").then(r => r.json()).then(setApps); }, []);

  /* fetch / generate scripts list when entering step 9 */
  useEffect(() => {
    if (step === 9 && !scripts.length && !busyScp) {
      setBusyScp(true);
      fetch("/api/scripts")
        .then(r => r.json())
        .then(setScripts)
        .finally(() => setBusyScp(false));
    }
  }, [step, scripts.length, busyScp]);

  /* generate everything inside the new Secrets step (index 6) */
  useEffect(() => {
    if (step !== 6) return;

    /* SSH key pair */
    if (!keys && !busyKey) {
      setBusyKey(true);
      fetch("/api/ssh-keygen")
        .then(r => r.json())
        .then(setKeys)
        .finally(() => setBusyKey(false));
    }

    /* Rancher token + admin passwords */
    if (!token)   setToken(genToken());
    if (!passwords) {
      setPwds({
        argocd : genPass(),
        keycloak: genPass(),
        rancher : genPass()
      });
    }
  }, [step, keys, busyKey, token, passwords]);

  /* ---------------- derived flags -------------------------- */
  const domainOK   = DOMAIN_RE.test(domain.trim());
  const repoOK     = REPO_RE.test(repo.trim());
  const appsChosen = sel.size > 0;
  const canZip     = domainOK && repoOK && appsChosen;

  /* auto-download ZIP on entering step 4 */
  useEffect(() => { if (step === 4 && canZip) buildZip(); }, [step, canZip]);

  /* ---------------- handlers ------------------------------- */
  const toggleSel  = n => {
    const s = new Set(sel); s.has(n) ? s.delete(n) : s.add(n); setSel(s);
  };
  const toggleOpen = n => {
    const s = new Set(open); s.has(n) ? s.delete(n) : s.add(n); setOpen(s);
  };

  const regenKeys  = () => {
    setBusyKey(true);
    fetch("/api/ssh-keygen")
      .then(r => r.json())
      .then(setKeys)
      .finally(() => setBusyKey(false));
  };

  async function buildZip() {
    if (busyZip) return;
    setBusyZip(true);
    const blob = await fetch("/api/build", {
      method : "POST",
      headers: { "Content-Type":"application/json" },
      body   : JSON.stringify({
        selected:[...sel],
        repo    : repo.trim(),
        domain  : domain.trim().toLowerCase()
      })
    }).then(r => r.blob());

    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {
      href:url, download:`${domain || "appforge"}.zip`
    }).click();
    URL.revokeObjectURL(url);
    setBusyZip(false);
  }

  const copyScript = async n => {
    const txt = await fetch(`/scripts/${n}`).then(r => r.text());
    copy(txt);
  };

  /* ---------------- navigation buttons --------------------- */
  const Nav = ({ nextOK = true }) => (
    <div style={{ marginTop:"1rem" }}>
      <button className="btn-secondary" onClick={() => setStep(step - 1)}>← Back</button>
      <button className="btn" disabled={!nextOK} onClick={() => setStep(step + 1)}>Next →</button>
    </div>
  );

  /* helper to render the little intro under every <h2> */
  const Intro = ({ i }) => <p className="intro">{steps[i].desc}</p>;

  /* ---------------- step renderer -------------------------- */
  function renderStep() {
    switch (step) {
      /* 0 ─ Welcome ---------------------------------------- */
      case 0: return <>
        <h2>{steps[0].label} to AppForge 🚀</h2>
        <p>{steps[0].desc}</p>
        <ol style={{ margin:"1rem 0 1.5rem 1.2rem" }}>
          {steps.slice(1).map((s, i) => (
            <li key={i}><strong>{s.label}</strong> — {s.desc}</li>
          ))}
        </ol>
        <button className="btn" onClick={() => setStep(1)}>Start →</button>
      </>;

      /* 1 ─ Domain ----------------------------------------- */
      case 1: return <>
        <h2>Step 1 – {steps[1].label}</h2><Intro i={1}/>
        <input className="wizard-input" value={domain}
               onChange={e => setDomain(e.target.value.toLowerCase())}
               placeholder="example.com"/>
        {!domainOK && <p className="error">Enter a valid domain.</p>}
        <button className="btn" disabled={!domainOK} onClick={() => setStep(2)}>Next →</button>
      </>;

      /* 2 ─ Repo ------------------------------------------- */
      case 2: return <>
        <h2>Step 2 – {steps[2].label}</h2><Intro i={2}/>
        <input className="wizard-input" value={repo}
               onChange={e => setRepo(e.target.value)}
               placeholder="git@host:group/repo.git"/>
        {!repoOK && <p className="error">Enter a valid SSH repository URL.</p>}
        <Nav nextOK={repoOK}/>
      </>;

      /* 3 ─ Apps ------------------------------------------- */
      case 3: return <>
        <h2>Step 3 – {steps[3].label}</h2><Intro i={3}/>
        <ul className="apps-list">
          {apps.map(a => {
            const opened = open.has(a.name);
            const hasInfo = a.desc || a.maint || a.home || a.readme;
            return (
              <li key={a.name}>
                <div className="app-item" data-selected={sel.has(a.name)}
                     onClick={() => toggleSel(a.name)}>
                  <input type="checkbox" readOnly checked={sel.has(a.name)}/>
                  {a.icon ? <img src={a.icon} alt="" width={24} height={24}/> : "📦"}
                  <span className="app-name">{a.name}</span>
                  <button className="info-btn" disabled={!hasInfo}
                          onClick={e => {e.stopPropagation(); toggleOpen(a.name);}}>
                    {opened ? "▲" : "ℹ️"}
                  </button>
                </div>
                {opened && (
                  <div className="app-more">
                    {a.desc   && <p>{a.desc}</p>}
                    {a.maint  && <p><strong>Maintainers:</strong> {a.maint}</p>}
                    {a.home   && <p><strong>Home:</strong>{" "}
                                   <a href={a.home} target="_blank" rel="noreferrer">{a.home}</a></p>}
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
        <h2>Step 4 – {steps[4].label}</h2><Intro i={4}/>
        <p>The ZIP download should start automatically. If it doesn’t, click the button below.</p>
        <button className="btn" disabled={busyZip || !canZip} onClick={buildZip}>
          {busyZip ? <Spinner size={18}/> : "Download ZIP"}
        </button>
        <Nav/>
      </>;

      /* 5 ─ Create repo ------------------------------------ */
      case 5: return <>
        <h2>Step 5 – {steps[5].label}</h2><Intro i={5}/>
        <p>Create (or empty) the repository that will host the <code>app-of-apps</code> manifests.</p>
        <Nav/>
      </>;

      /* 6 ─ Secrets  (SSH keys + Rancher token + admin pwds) */
      case 6: return <>
        <h2>Step 6 – {steps[6].label}</h2><Intro i={6}/>
        {(!keys || !passwords || busyKey)
          ? <Spinner size={32}/>
          : <>
              {/* SSH keys */}
              <label>SSH public key</label>
              <div className="key-wrap">
                <pre className="key-block pub">{keys.publicKey}</pre>
                {copyBtn(keys.publicKey,"btn-copy key-copy")}
              </div>

              <label style={{marginTop:"1rem"}}>SSH private key</label>
              <div className="key-wrap">
                <pre className="key-block priv">{keys.privateKey}</pre>
                {copyBtn(keys.privateKey,"btn-copy key-copy")}
              </div>

              {/* Rancher token */}
              <label style={{marginTop:"1.2rem"}}>Rancher bootstrap token</label>
              <div className="key-wrap">
                <pre className="key-block pub">{token}</pre>
                {copyBtn(token,"btn-copy key-copy")}
              </div>

              {/* admin passwords */}
              <h3 style={{margin:"1.6rem 0 .6rem"}}>Admin passwords</h3>
              <table className="summary-table">
                <tbody>
                  <tr><th>Argo CD</th>   <td>{passwords.argocd}</td>
                                          <td>{copyBtn(passwords.argocd,"tiny-btn")}</td></tr>
                  <tr><th>Keycloak</th>  <td>{passwords.keycloak}</td>
                                          <td>{copyBtn(passwords.keycloak,"tiny-btn")}</td></tr>
                  <tr><th>Rancher</th>   <td>{passwords.rancher}</td>
                                          <td>{copyBtn(passwords.rancher,"tiny-btn")}</td></tr>
                </tbody>
              </table>

              <button className="btn-secondary" style={{marginTop:".8rem"}} onClick={()=>{
                setToken(genToken());
                setPwds({ argocd:genPass(), keycloak:genPass(), rancher:genPass() });
              }}>Regenerate all secrets</button>

              <Nav/>
            </>
        }
      </>;

      /* 7 ─ Deploy key ------------------------------------- */
      case 7: return <>
        <h2>Step 7 – {steps[7].label}</h2><Intro i={7}/>
        <p>Add the public key above as a deploy key (read/write) in the app-of-apps repo.</p>
        {keys && copyBtn(keys.publicKey,"btn-copy key-copy")}
        <Nav/>
      </>;

      /* 8 ─ SSH VMs ---------------------------------------- */
      case 8: return <>
        <h2>Step 8 – {steps[8].label}</h2><Intro i={8}/>
        <p>Log into every VM that will join the RKE2 cluster.</p>
        <Nav/>
      </>;

      /* 9 ─ Scripts ---------------------------------------- */
      case 9: return <>
        <h2>Step 9 – {steps[9].label}</h2><Intro i={9}/>
        {busyScp
          ? <Spinner size={28}/>
          : <table className="scripts-table">
              <tbody>
                {scripts.map(s => (
                  <tr key={s}>
                    <td><code>{s}</code></td>
                    <td className="no-wrap">
                      <a href={`/scripts/${s}`} download className="tiny-btn">Download</a>
                      <button className="tiny-btn" onClick={()=>copyScript(s)}>Copy</button>
                      <button className="tiny-btn" onClick={()=>copy(oneLiner(s),"tiny-btn")}>One-liner</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
        <Nav/>
      </>;

      /* 10 ─ Run scripts ----------------------------------- */
      case 10: return <>
        <h2>Step 10 – {steps[10].label}</h2><Intro i={10}/>
        <p>Run the install scripts on <strong>worker</strong> nodes first,
           then on the <strong>control-plane</strong> nodes.</p>
        <Nav/>
      </>;

      /* 11 ─ Finish ---------------------------------------- */
      default: return <>
        <h2>Step 11 – {steps[11].label} 🎉</h2><Intro i={11}/>
        <h3>Overview</h3>
        <table className="summary-table">
          <tbody>
            <tr><th>Domain</th>        <td>{domain}</td>
                                        <td>{copyBtn(domain,"tiny-btn")}</td></tr>
            <tr><th>Git repo</th>      <td>{repo}</td>
                                        <td>{copyBtn(repo,"tiny-btn")}</td></tr>
            <tr><th>Apps</th>          <td colSpan={2}>{[...sel].join(", ") || "—"}</td></tr>
            <tr><th>SSH public key</th><td style={{wordBreak:"break-all"}}>{keys?.publicKey || "—"}</td>
                                        <td>{keys && copyBtn(keys.publicKey,"tiny-btn")}</td></tr>
            <tr><th>SSH private key</th><td style={{wordBreak:"break-all"}}>{keys?.privateKey || "—"}</td>
                                        <td>{keys && copyBtn(keys.privateKey,"tiny-btn")}</td></tr>
            <tr><th>Rancher token</th> <td>{token || "—"}</td>
                                        <td>{token && copyBtn(token,"tiny-btn")}</td></tr>
            <tr><th>Argo CD admin</th> <td>{passwords?.argocd || "—"}</td>
                                        <td>{passwords && copyBtn(passwords.argocd,"tiny-btn")}</td></tr>
            <tr><th>Keycloak admin</th><td>{passwords?.keycloak || "—"}</td>
                                        <td>{passwords && copyBtn(passwords.keycloak,"tiny-btn")}</td></tr>
            <tr><th>Rancher admin</th> <td>{passwords?.rancher || "—"}</td>
                                        <td>{passwords && copyBtn(passwords.rancher,"tiny-btn")}</td></tr>
          </tbody>
        </table>
        <button className="btn" style={{marginTop:"1.2rem"}} onClick={()=>setStep(0)}>Start again</button>
      </>;
    }
  }

  /* ---------------- render ---------------------------------- */
  return (
    <div className="app-wrapper">

      {/* step tracker */}
      <div className="steps-nav">
        {steps.map((s, i) => (
          <div key={i}
               className={
                 "step-pill "+
                 (i===step ? "active" : i<step ? "completed" : "disabled")
               }
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
