import React, { useEffect, useState } from "react";
import Spinner from "./components/Spinner.jsx";
import "./App.css";

/* ── validators ─────────────────────────────────────────────── */
const REPO_RE   = /^git@[^:]+:[A-Za-z0-9._/-]+\.git$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

/* ── tiny helpers ───────────────────────────────────────────── */
const copy = (txt, onDone) =>
  navigator.clipboard?.writeText(txt).then(onDone);

/* ───────────────────────────────────────────────────────────── */

export default function App() {
  /* global state ------------------------------------------------ */
  const [domain, setDomain] = useState("");
  const [repo,   setRepo]   = useState("");

  const [apps, setApps]     = useState([]);          // [{ name, icon, … }]
  const [sel,  setSel]      = useState(new Set());   // selected app names
  const [open, setOpen]     = useState(new Set());   // info panels open

  const [keys,    setKeys]    = useState(null);      // { publicKey, privateKey }
  const [scripts, setScripts] = useState([]);        // ["00-init.sh", …]
  const [token,   setToken]   = useState("");

  const [step,    setStep]    = useState(0);

  /* loaders */
  const [busyZip,     setBusyZip]     = useState(false);
  const [busyKey,     setBusyKey]     = useState(false);
  const [busyScripts, setBusyScripts] = useState(false);

  /* toast */
  const [msg, setMsg] = useState("");

  /* fetch app list once ---------------------------------------- */
  useEffect(() => {
    fetch("/api/apps").then(r => r.json()).then(setApps);
  }, []);

  /* derived ---------------------------------------------------- */
  const domainOK   = DOMAIN_RE.test(domain.trim());
  const repoOK     = REPO_RE.test(repo.trim());
  const appsChosen = sel.size > 0;
  const canZip     = domainOK && repoOK && appsChosen;

  /* backend helpers ------------------------------------------- */
  const fetchKeyPair = () => {
    setBusyKey(true);
    fetch("/api/ssh-keygen")
      .then(r => r.json())
      .then(setKeys)
      .finally(() => setBusyKey(false));
  };

  const fetchScripts = () => {
    setBusyScripts(true);
    fetch("/api/scripts")
      .then(r => r.json())
      .then(setScripts)
      .finally(() => setBusyScripts(false));
  };

  async function copyScript(name) {
    const txt = await fetch(`/scripts/${name}`).then(r => r.text());
    copy(txt, () => toast("Script copied"));
  }
  function copyOneLiner(name) {
    const url = `${window.location.origin}/scripts/${name}`;
    copy(`curl -fsSL "${url}" | sudo bash`, () => toast("One-liner copied"));
  }
  const toast = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2000); };

  /* ZIP builder ------------------------------------------------ */
  async function buildZip() {
    setBusyZip(true);
    const blob = await fetch("/api/build", {
      method : "POST",
      headers: { "Content-Type":"application/json" },
      body   : JSON.stringify({
        selected:[...sel],
        repo   : repo.trim(),
        domain : domain.trim().toLowerCase()
      })
    }).then(r => r.blob());

    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {
      href: url,
      download: `${domain || "appforge"}.zip`
    }).click();
    URL.revokeObjectURL(url);
    setBusyZip(false);
  }

  /* selection toggles ----------------------------------------- */
  const toggleSel  = n => { const s=new Set(sel);  s.has(n)?s.delete(n):s.add(n); setSel(s); };
  const toggleOpen = n => { const s=new Set(open); s.has(n)?s.delete(n):s.add(n); setOpen(s); };

  /* ── STEP RENDERER (switch keeps DOM identity) ─────────────── */
  function renderStep() {
    switch (step) {
      /* 0 ─ domain -------------------------------------------- */
      case 0:
        return (
          <>
            <h2>Step 1 – Main domain</h2>
            <input
              className="wizard-input"
              value={domain}
              onChange={e => setDomain(e.target.value.toLowerCase())}
              placeholder="example.com"
            />
            {!domainOK && <p className="error">Enter a valid domain.</p>}
            <button className="btn" disabled={!domainOK} onClick={() => setStep(1)}>
              Next →
            </button>
          </>
        );

      /* 1 ─ repo ---------------------------------------------- */
      case 1:
        return (
          <>
            <h2>Step 2 – Git repository (SSH)</h2>
            <input
              className="wizard-input"
              value={repo}
              onChange={e => setRepo(e.target.value)}
              placeholder="git@gitlab.example.com:group/sub/repo.git"
            />
            {!repoOK && <p className="error">Enter a valid SSH repository URL.</p>}
            <NavButtons nextOK={repoOK} />
          </>
        );

      /* 2 ─ choose apps --------------------------------------- */
      case 2:
        return (
          <>
            <h2>Step 3 – Choose applications</h2>

            <ul className="apps-list">
              {apps.map(a => {
                const hasInfo = a.desc || a.maint || a.home || a.readme;
                const isOpen  = open.has(a.name);
                return (
                  <li key={a.name}>
                    <div className="app-item" data-selected={sel.has(a.name)}
                         onClick={() => toggleSel(a.name)}>
                      <input type="checkbox" readOnly checked={sel.has(a.name)} />
                      {a.icon ? <img src={a.icon} alt="" width={24}/> : <span>📦</span>}
                      <span className="app-name">{a.name}</span>
                      <button className="info-btn" disabled={!hasInfo}
                              onClick={e => { e.stopPropagation(); toggleOpen(a.name); }}>
                        {isOpen ? "▲" : "ℹ️"}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="app-more">
                        {a.desc  && <p>{a.desc}</p>}
                        {a.maint && <p><strong>Maintainers:</strong> {a.maint}</p>}
                        {a.home  && <p><strong>Home:</strong> <a href={a.home} target="_blank" rel="noreferrer">{a.home}</a></p>}
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

            <NavButtons nextOK={appsChosen} />
          </>
        );

      /* 3 ─ zip download -------------------------------------- */
      case 3:
        return (
          <>
            <h2>Step 4 – Download tailored ZIP</h2>
            <button className="btn" disabled={busyZip || !canZip} onClick={buildZip}>
              {busyZip ? <Spinner size={18}/> : "Download ZIP"}
            </button>
            <NavButtons />
          </>
        );

      /* 4 ─ text: create repo --------------------------------- */
      case 4:
        return (
          <>
            <h2>Step 5 – Create the app-of-apps repo</h2>
            <p>Create (or empty) the repository that will host the <code>app-of-apps</code> manifests.</p>
            <NavButtons />
          </>
        );

      /* 5 ─ generate SSH key pair ----------------------------- */
      case 5:
        return (
          <>
            <h2>Step 6 – Generate SSH key pair</h2>
            {!keys ? (
              <button className="btn" onClick={fetchKeyPair} disabled={busyKey}>
                {busyKey ? <Spinner size={18}/> : "Generate keys"}
              </button>
            ) : (
              <>
                <label>Public key</label>
                <pre className="code-block">{keys.publicKey}</pre>
                <button className="btn-secondary" onClick={() => copy(keys.publicKey, () => toast("Copied"))}>Copy</button>

                <label style={{marginTop:"1rem"}}>Private key</label>
                <pre className="code-block">{keys.privateKey}</pre>
                <button className="btn-secondary" onClick={() => copy(keys.privateKey, () => toast("Copied"))}>Copy</button>

                <NavButtons />
              </>
            )}
          </>
        );

      /* 6 ─ install public key -------------------------------- */
      case 6:
        return (
          <>
            <h2>Step 7 – Install the public key</h2>
            <p>Add the public key above as a deploy key (read/write) in the app-of-apps repo.</p>
            <button className="btn-secondary" onClick={() => copy(keys?.publicKey || "", () => toast("Copied"))}>
              Copy public key
            </button>
            <NavButtons />
          </>
        );

      /* 7 ─ SSH onto VMs ------------------------------------- */
      case 7:
        return (
          <>
            <h2>Step 8 – SSH onto the VMs</h2>
            <p>Log into every VM that will join the RKE2 cluster.</p>
            <NavButtons />
          </>
        );

      /* 8 ─ install scripts ----------------------------------- */
      case 8:
        /* auto-fetch once */
        useEffect(() => { if (!scripts.length && !busyScripts) fetchScripts(); }, [scripts, busyScripts]);
        return (
          <>
            <h2>Step 9 – Download install scripts</h2>

            {busyScripts ? <Spinner size={28}/> : (
              <ul className="scripts-list">
                {scripts.map(s => (
                  <li key={s}>
                    <strong>{s}</strong>
                    <a className="btn-secondary" style={{marginLeft:"1rem"}} href={`/scripts/${s}`} download>
                      Download
                    </a>
                    <button className="btn-secondary" onClick={() => copyScript(s)}>Copy script</button>
                    <button className="btn-secondary" onClick={() => copyOneLiner(s)}>Copy one-liner</button>
                  </li>
                ))}
              </ul>
            )}

            <NavButtons />
          </>
        );

      /* 9 ─ token -------------------------------------------- */
      case 9:
        return (
          <>
            <h2>Step 10 – Generate RKE token</h2>
            {!token ? (
              <button className="btn" onClick={() =>
                setToken(crypto.randomUUID?.() || Math.random().toString(36).slice(2,12))}>
                Generate token
              </button>
            ) : (
              <>
                <pre className="code-block">{token}</pre>
                <button className="btn-secondary" onClick={() => copy(token, () => toast("Copied"))}>Copy</button>
                <NavButtons />
              </>
            )}
          </>
        );

      /* 10 ─ text: run scripts -------------------------------- */
      case 10:
        return (
          <>
            <h2>Step 11 – Execute the scripts</h2>
            <p>Run the install scripts on <strong>worker</strong> nodes first, then on the <strong>control-plane</strong> nodes.</p>
            <NavButtons />
          </>
        );

      /* 11 ─ done + overview ---------------------------------- */
      default:
        return (
          <>
            <h2>Step 12 – Finished 🎉</h2>
            <h3>Overview</h3>
            <ul>
              <li><strong>Domain:</strong> {domain}</li>
              <li><strong>Git repo:</strong> {repo}</li>
              <li><strong>Selected apps:</strong> {[...sel].join(", ") || "—"}</li>
              <li><strong>SSH public key:</strong> {keys?.publicKey?.slice(0,40) || "—"}…</li>
              <li><strong>Token:</strong> {token || "—"}</li>
            </ul>
            <button className="btn" onClick={() => setStep(0)}>Start again</button>
          </>
        );
    }
  }

  /* local component: nav buttons (always shows Back) ---------- */
  const NavButtons = ({ nextOK = true }) => (
    <div style={{marginTop:"1rem"}}>
      <button className="btn-secondary" onClick={() => setStep(step-1)}>← Back</button>
      <button className="btn" disabled={!nextOK} onClick={() => setStep(step+1)}>
        Next →
      </button>
    </div>
  );

  /* ── render -------------------------------------------------- */
  return (
    <div className="app-wrapper">
      {/* step pills */}
      <div className="steps-nav">
        {Array.from({length:12}).map((_, i) => (
          <div key={i}
               className={"step-pill "+(i===step?"active":i<step?"completed":"disabled")}
               onClick={() => { if (i <= step) setStep(i); }}>
            {i+1}
          </div>
        ))}
      </div>

      {/* body */}
      <div className="step-content">{renderStep()}</div>

      {/* toast */}
      {msg && <div className="copy-msg">{msg}</div>}
    </div>
  );
}
