import React, { useEffect, useState } from "react";
import "./App.css";

/* ── validators ─────────────────────────────────────────────── */
const REPO_RE   = /^git@[^:]+:[^/]+\/[^/]+\.git$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

/* ── tiny helpers ───────────────────────────────────────────── */
const copy = (txt) =>
  navigator.clipboard?.writeText(txt).then(() => alert("Copied!"));

const genKeyPair = () => {
  /* NOTE: placeholder – replace with real backend call if needed */
  const rand = () =>
    btoa(crypto.getRandomValues(new Uint32Array(8)).join(""));
  return {
    publicKey:  `ssh-rsa ${rand()} user@appforge`,
    privateKey: `-----BEGIN PRIVATE KEY-----\n${rand()}\n-----END PRIVATE KEY-----`,
  };
};

/* ───────────────────────────────────────────────────────────── */

export default function App() {
  /* shared state ------------------------------------------------ */
  const [domain,   setDomain]   = useState("");
  const [repo,     setRepo]     = useState("");
  const [apps,     setApps]     = useState([]);          // [{name,icon,desc…}]
  const [sel,      setSel]      = useState(new Set());   // Set of selected names
  const [keys,     setKeys]     = useState(null);        // { publicKey, privateKey }
  const [scripts,  setScripts]  = useState([]);          // ["00-init.sh", …]
  const [token,    setToken]    = useState("");          // random RKE token
  const [step,     setStep]     = useState(0);           // wizard index
  const [busyZip,  setBusyZip]  = useState(false);

  /* fetch app list once ----------------------------------------- */
  useEffect(() => {
    fetch("/api/apps").then((r) => r.json()).then(setApps);
  }, []);

  /* derived booleans -------------------------------------------- */
  const domainOK    = DOMAIN_RE.test(domain.trim());
  const repoOK      = REPO_RE.test(repo.trim());
  const appsChosen  = sel.size > 0;
  const canDownload = domainOK && repoOK && appsChosen;

  /* zip helper --------------------------------------------------- */
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

  /* fetch install-script list (Step 9) --------------------------- */
  async function getScripts() {
    try {
      const list = await fetch("/api/scripts").then((r) => r.json());
      setScripts(list);
    } catch {
      alert("Could not fetch scripts list (check backend).");
    }
  }

  /* simple copy-toggle helper for <li> apps ---------------------- */
  const toggleSel = (n) => {
    const s = new Set(sel);
    s.has(n) ? s.delete(n) : s.add(n);
    setSel(s);
  };

  /* ─── WIZARD STEPS – each returns JSX ───────────────────────── */
  const steps = [
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
        <button className="btn" disabled={!domainOK} onClick={() => setStep(1)}>
          Next →
        </button>
      </>
    ),

    () => (
      <>
        <h2>Step 2 – Git repository&nbsp;(SSH)</h2>
        <input
          className="wizard-input"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="git@github.com:org/repo.git"
        />
        {!repoOK && (
          <p className="error">Enter a valid SSH repository URL.</p>
        )}
        <button className="btn-secondary" onClick={() => setStep(0)}>
          ← Back
        </button>
        <button className="btn" disabled={!repoOK} onClick={() => setStep(2)}>
          Next →
        </button>
      </>
    ),

    () => (
      <>
        <h2>Step 3 – Choose applications</h2>
        <p>Select the apps you want installed:</p>
        <ul className="apps-list">
          {apps.map((a) => (
            <li
              key={a.name}
              className="app-item"
              data-selected={sel.has(a.name)}
              onClick={() => toggleSel(a.name)}
            >
              <input type="checkbox" readOnly checked={sel.has(a.name)} />
              {a.icon ? (
                <img src={a.icon} alt="" width={24} height={24} />
              ) : (
                <span>📦</span>
              )}
              <span className="app-name">{a.name}</span>
            </li>
          ))}
        </ul>
        <button className="btn-secondary" onClick={() => setStep(1)}>
          ← Back
        </button>
        <button
          className="btn"
          disabled={!appsChosen}
          onClick={() => setStep(3)}
        >
          Next →
        </button>
      </>
    ),

    () => (
      <>
        <h2>Step 4 – Download tailored ZIP</h2>
        <button
          className="btn"
          disabled={busyZip || !canDownload}
          onClick={buildZip}
        >
          {busyZip ? "Building…" : "Download ZIP"}
        </button>
        <div style={{ marginTop: "1rem" }}>
          <button className="btn-secondary" onClick={() => setStep(2)}>
            ← Back
          </button>
          <button className="btn" onClick={() => setStep(4)}>
            Next →
          </button>
        </div>
      </>
    ),

    () => (
      <>
        <h2>Step 5 – Create the app-of-apps GitOps repo</h2>
        <p>
          In your Git provider, create (or empty) a repository that will hold
          the <code>app-of-apps</code> manifest.
        </p>
        <button className="btn" onClick={() => setStep(5 + 1)}>
          Next →
        </button>
      </>
    ),

    () => (
      <>
        <h2>Step 6 – Generate SSH key pair</h2>
        {!keys ? (
          <button className="btn" onClick={() => setKeys(genKeyPair())}>
            Generate keys
          </button>
        ) : (
          <>
            <label>Public key</label>
            <pre className="code-block">{keys.publicKey}</pre>
            <button
              className="btn-secondary"
              onClick={() => copy(keys.publicKey)}
            >
              Copy
            </button>

            <label style={{ marginTop: "1rem" }}>Private key</label>
            <pre className="code-block">{keys.privateKey}</pre>
            <button
              className="btn-secondary"
              onClick={() => copy(keys.privateKey)}
            >
              Copy
            </button>

            <button
              className="btn"
              style={{ marginTop: "1rem" }}
              onClick={() => setStep(6 + 1)}
            >
              Next →
            </button>
          </>
        )}
      </>
    ),

    () => (
      <>
        <h2>Step 7 – Install the public key in the repo</h2>
        <p>
          Add the <strong>public key</strong> above as a deploy key (read/write)
          to the <em>app-of-apps</em> repository.
        </p>
        <button
          className="btn-secondary"
          onClick={() => copy(keys?.publicKey || "")}
        >
          Copy public key
        </button>
        <button
          className="btn"
          style={{ marginLeft: "1rem" }}
          onClick={() => setStep(7 + 1)}
        >
          Next →
        </button>
      </>
    ),

    () => (
      <>
        <h2>Step 8 – SSH onto the VMs</h2>
        <p>Log into every VM that will join the cluster.</p>
        <button className="btn" onClick={() => setStep(8 + 1)}>
          Next →
        </button>
      </>
    ),

    () => (
      <>
        <h2>Step 9 – Download install scripts</h2>
        {!scripts.length ? (
          <button className="btn" onClick={getScripts}>
            Fetch scripts list
          </button>
        ) : (
          <ul className="scripts-list">
            {scripts.map((s) => (
              <li key={s}>
                <a href={`/scripts/${s}`} download>
                  {s}
                </a>
              </li>
            ))}
          </ul>
        )}
        <button
          className="btn"
          style={{ marginTop: "1rem" }}
          onClick={() => setStep(9 + 1)}
        >
          Next →
        </button>
      </>
    ),

    () => (
      <>
        <h2>Step 10 – Generate RKE token</h2>
        {!token ? (
          <button
            className="btn"
            onClick={() =>
              setToken(
                crypto.randomUUID?.() ||
                  Math.random().toString(36).slice(2, 12),
              )
            }
          >
            Generate token
          </button>
        ) : (
          <>
            <pre className="code-block">{token}</pre>
            <button className="btn-secondary" onClick={() => copy(token)}>
              Copy token
            </button>
            <button
              className="btn"
              style={{ marginLeft: "1rem" }}
              onClick={() => setStep(10 + 1)}
            >
              Next →
            </button>
          </>
        )}
      </>
    ),

    () => (
      <>
        <h2>Step 11 – Execute the scripts</h2>
        <p>
          Run the install scripts on <strong>worker</strong> nodes first, then
          on the <strong>control-plane</strong> nodes.
        </p>
        <button className="btn" onClick={() => setStep(11 + 1)}>
          Next →
        </button>
      </>
    ),

    () => (
      <>
        <h2>Step 12 – Finished 🎉</h2>
        <p>
          Your cluster should now come online and start syncing applications via
          Argo CD.
        </p>
        <button className="btn" onClick={() => setStep(0)}>
          Start again
        </button>
      </>
    ),
  ];

  const Current = steps[step];

  /* ─── render ────────────────────────────────────────────────── */
  return (
    <div className="app-wrapper">
      {/* step pills ------------------------------------------------ */}
      <div className="steps-nav">
        {steps.map((_, i) => (
          <div
            key={i}
            className={
              "step-pill " +
              (i === step
                ? "active"
                : i < step
                ? "completed"
                : "disabled")
            }
            onClick={() => {
              if (i <= step) setStep(i);
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* body ----------------------------------------------------- */}
      <div className="step-content">
        <Current />
      </div>
    </div>
  );
}
