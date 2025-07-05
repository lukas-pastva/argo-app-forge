import React, { useEffect, useState } from "react";
import "./App.css";

/* ── validators ────────────────────────────────────────────────
   Accepts any nested path ending in .git, e.g.
   git@gitlab.devops-cloud.io:group/sub/open/argocd.git          */
const REPO_RE   = /^git@[^:]+:[A-Za-z0-9._/-]+\.git$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

/* ── helpers ────────────────────────────────────────────────── */
const copy = (txt) =>
  navigator.clipboard?.writeText(txt).then(() => alert("Copied!"));

/* ───────────────────────────────────────────────────────────── */

export default function App() {
  const [domain,  setDomain]  = useState("");
  const [repo,    setRepo]    = useState("");
  const [apps,    setApps]    = useState([]);      // [{name,icon,…}]
  const [sel,     setSel]     = useState(new Set());
  const [keys,    setKeys]    = useState(null);    // { publicKey, privateKey }
  const [scripts, setScripts] = useState([]);      // ["setup.sh", …]
  const [token,   setToken]   = useState("");
  const [step,    setStep]    = useState(0);
  const [busyZip, setBusyZip] = useState(false);

  /* fetch app list once ---------------------------------------- */
  useEffect(() => {
    fetch("/api/apps").then((r) => r.json()).then(setApps);
  }, []);

  /* derived ---------------------------------------------------- */
  const domainOK   = DOMAIN_RE.test(domain.trim());
  const repoOK     = REPO_RE.test(repo.trim());
  const appsChosen = sel.size > 0;
  const canZip     = domainOK && repoOK && appsChosen;

  /* zip helper ------------------------------------------------- */
  async function buildZip() {
    setBusyZip(true);
    const res = await fetch("/api/build", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        selected: [...sel],
        repo   : repo.trim(),
        domain : domain.trim().toLowerCase(),
      }),
    });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {
      href: url,
      download: `${domain || "appforge"}.zip`,
    }).click();
    URL.revokeObjectURL(url);
    setBusyZip(false);
  }

  /* backend helpers ------------------------------------------- */
  async function fetchKeyPair() {
    try {
      const kp = await fetch("/api/ssh-keygen").then((r) => r.json());
      setKeys(kp);
    } catch {
      alert("Backend could not generate SSH keys – see server logs.");
    }
  }
  async function fetchScripts() {
    try {
      const list = await fetch("/api/scripts").then((r) => r.json());
      setScripts(list);
    } catch {
      alert("Could not list scripts directory (check backend).");
    }
  }

  /* checkbox toggle ------------------------------------------- */
  const toggleSel = (n) => {
    const s = new Set(sel);
    s.has(n) ? s.delete(n) : s.add(n);
    setSel(s);
  };

  /* ── WIZARD steps (array of tiny components) ───────────────── */
  const steps = [
    /* 0 ─ domain ---------------------------------------------- */
    () => (
      <>
        <h2>Step 1 – Main domain</h2>
        <input
          className="wizard-input"
          value={domain}
          onChange={(e) => setDomain(e.target.value.toLowerCase())}
          placeholder="example.com"
        />
        {!domainOK && <p className="error">Enter a valid domain.</p>}
        <button className="btn"
                disabled={!domainOK}
                onClick={() => setStep(1)}>Next →</button>
      </>
    ),

    /* 1 ─ repo ------------------------------------------------- */
    () => (
      <>
        <h2>Step 2 – Git repository (SSH)</h2>
        <input
          className="wizard-input"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="git@gitlab.example.com:group/sub/repo.git"
        />
        {!repoOK && (
          <p className="error">Enter a valid SSH repository URL.</p>
        )}
        <button className="btn-secondary" onClick={() => setStep(0)}>← Back</button>
        <button className="btn"
                disabled={!repoOK}
                onClick={() => setStep(2)}>Next →</button>
      </>
    ),

    /* 2 ─ apps ------------------------------------------------- */
    () => (
      <>
        <h2>Step 3 – Choose applications</h2>
        <ul className="apps-list">
          {apps.map((a) => (
            <li key={a.name}
                className="app-item"
                data-selected={sel.has(a.name)}
                onClick={() => toggleSel(a.name)}>
              <input type="checkbox" readOnly checked={sel.has(a.name)} />
              {a.icon
                ? <img src={a.icon} alt="" width={24} height={24} />
                : <span>📦</span>}
              <span className="app-name">{a.name}</span>
            </li>
          ))}
        </ul>
        <button className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
        <button className="btn"
                disabled={!appsChosen}
                onClick={() => setStep(3)}>Next →</button>
      </>
    ),

    /* 3 ─ download zip ---------------------------------------- */
    () => (
      <>
        <h2>Step 4 – Download tailored ZIP</h2>
        <button className="btn"
                disabled={busyZip || !canZip}
                onClick={buildZip}>
          {busyZip ? "Building…" : "Download ZIP"}
        </button>
        <div style={{ marginTop: "1rem" }}>
          <button className="btn-secondary" onClick={() => setStep(2)}>← Back</button>
          <button className="btn" onClick={() => setStep(4)}>Next →</button>
        </div>
      </>
    ),

    /* 4 ─ text-only ------------------------------------------- */
    () => (
      <>
        <h2>Step 5 – Create the app-of-apps repo</h2>
        <p>
          In your Git provider, create (or empty) the repository that will hold
          the <code>app-of-apps</code> manifest.
        </p>
        <button className="btn" onClick={() => setStep(5)}>Next →</button>
      </>
    ),

    /* 5 ─ SSH key pair ---------------------------------------- */
    () => (
      <>
        <h2>Step 6 – Generate SSH key pair</h2>
        {!keys ? (
          <button className="btn" onClick={fetchKeyPair}>Generate keys</button>
        ) : (
          <>
            <label>Public key</label>
            <pre className="code-block">{keys.publicKey}</pre>
            <button className="btn-secondary"
                    onClick={() => copy(keys.publicKey)}>Copy</button>

            <label style={{ marginTop: "1rem" }}>Private key</label>
            <pre className="code-block">{keys.privateKey}</pre>
            <button className="btn-secondary"
                    onClick={() => copy(keys.privateKey)}>Copy</button>

            <button className="btn"
                    style={{ marginTop: "1rem" }}
                    onClick={() => setStep(6)}>Next →</button>
          </>
        )}
      </>
    ),

    /* 6 ─ text-only copy pub key ------------------------------ */
    () => (
      <>
        <h2>Step 7 – Install the public key</h2>
        <p>
          Add the <strong>public key</strong> above as a deploy key (read/write)
          in the app-of-apps repository.
        </p>
        <button className="btn-secondary"
                onClick={() => copy(keys?.publicKey || "")}>Copy public key</button>
        <button className="btn" style={{ marginLeft: "1rem" }}
                onClick={() => setStep(7)}>Next →</button>
      </>
    ),

    /* 7 ─ SSH onto VMs (text) --------------------------------- */
    () => (
      <>
        <h2>Step 8 – SSH onto the VMs</h2>
        <p>Log into every VM that will join the RKE2 cluster.</p>
        <button className="btn" onClick={() => setStep(8)}>Next →</button>
      </>
    ),

    /* 8 ─ scripts --------------------------------------------- */
    () => (
      <>
        <h2>Step 9 – Download install scripts</h2>
        {!scripts.length ? (
          <button className="btn" onClick={fetchScripts}>Fetch scripts list</button>
        ) : (
          <ul className="scripts-list">
            {scripts.map((s) => (
              <li key={s}>
                <a href={`/scripts/${s}`} download>{s}</a>
              </li>
            ))}
          </ul>
        )}
        <button className="btn" style={{ marginTop: "1rem" }}
                onClick={() => setStep(9)}>Next →</button>
      </>
    ),

    /* 9 ─ RKE token ------------------------------------------- */
    () => (
      <>
        <h2>Step 10 – Generate RKE token</h2>
        {!token ? (
          <button className="btn"
                  onClick={() =>
                    setToken(crypto.randomUUID?.() ||
                             Math.random().toString(36).slice(2, 12))}>
            Generate token
          </button>
        ) : (
          <>
            <pre className="code-block">{token}</pre>
            <button className="btn-secondary" onClick={() => copy(token)}>Copy</button>
            <button className="btn" style={{ marginLeft: "1rem" }}
                    onClick={() => setStep(10)}>Next →</button>
          </>
        )}
      </>
    ),

    /* 10 ─ execute scripts (text) ------------------------------ */
    () => (
      <>
        <h2>Step 11 – Execute the scripts</h2>
        <p>
          Run the install scripts on <strong>worker</strong> nodes first, then on the
          <strong> control-plane</strong> nodes.
        </p>
        <button className="btn" onClick={() => setStep(11)}>Next →</button>
      </>
    ),

    /* 11 ─ done ------------------------------------------------ */
    () => (
      <>
        <h2>Step 12 – Finished 🎉</h2>
        <p>Your cluster should soon appear in Argo CD and start syncing workloads.</p>
        <button className="btn" onClick={() => setStep(0)}>Start again</button>
      </>
    ),
  ];

  const Current = steps[step];

  /* ── render ───────────────────────────────────────────────── */
  return (
    <div className="app-wrapper">
      {/* pills --------------------------------------------------- */}
      <div className="steps-nav">
        {steps.map((_, i) => (
          <div key={i}
               className={
                 "step-pill " +
                 (i === step ? "active" : i < step ? "completed" : "disabled")
               }
               onClick={() => { if (i <= step) setStep(i); }}>
            {i + 1}
          </div>
        ))}
      </div>

      {/* body ---------------------------------------------------- */}
      <div className="step-content">
        <Current />
      </div>
    </div>
  );
}
