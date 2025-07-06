/*  src/frontend/src/App.jsx  */
import React, { useEffect, useState } from "react";
import Spinner     from "./components/Spinner.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import "./App.css";

/* ── regex & helpers ───────────────────────────────────────── */
const REPO_RE   = /^git@[^:]+:[A-Za-z0-9._/-]+\.git$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
const toastDur  = 2000;
const rand      = () =>
  crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
const genToken  = () => rand() + rand();
const genPass   = () => rand();

/* ── NEW: pick a unique heredoc delimiter ─────────────────── */
function pickDelimiter(body, base = "EOF") {
  if (!body.includes(`\n${base}\n`)) return base;
  while (true) {
    const random = `${base}_${rand().slice(0, 6).toUpperCase()}`;
    if (!body.includes(`\n${random}\n`)) return random;
  }
}

/* ── one-liner helpers (updated) ───────────────────────────── */
const oneLiner = (n, body) => {
  const delim = pickDelimiter(body);
  return [
    `cat <<'${delim}' > ${n}`,
    body.trimEnd(),
    delim,
    `sudo -E bash ${n}`,
  ].join("\n");
};

const oneLinerSecrets = (n, body, priv, rancherToken, gitRepoUrl) =>
  [
    `export GIT_REPO_URL="${gitRepoUrl}"`,          // ⬅️ NEW
    `export RANCHER_TOKEN="${rancherToken}"`,
    `export ARGOCD_PASS="${priv.argocd}"`,
    `export KEYCLOAK_PASS="${priv.keycloak}"`,
    `export RANCHER_PASS="${priv.rancher}"`,
    `export SSH_PRIVATE_KEY='${priv.ssh.replace(/\n/g, "\\n")}'`,
    "",
    oneLiner(n, body),
  ].join("\n");


/* ── steps meta ────────────────────────────────────────────── */
const steps = [
  { label: "Welcome",    desc: "Tiny tour of the whole flow." },
  { label: "Domain",     desc: "Domain injected into manifests." },
  { label: "Repo",       desc: "SSH URL of your Git repo." },
  { label: "Apps",       desc: "Pick the Helm apps you need." },
  { label: "ZIP + Repo", desc: "Download ZIP, push to repo." },
  { label: "Secrets",    desc: "SSH keys, token & admin passwords." },
  { label: "Deploy key", desc: "Add the SSH key to the repo." },
  { label: "SSH VMs",    desc: "Log into every RKE2 node." },
  { label: "Scripts",    desc: "Helper install scripts." },
  { label: "Overview",   desc: "Everything in one place." },
];

/* robust clipboard helper ---------------------------------- */
async function copyText(txt) {
  try {
    await navigator.clipboard.writeText(txt);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {}
    document.body.removeChild(ta);
  }
}

/* tiny button with built-in spinner ------------------------ */
function CopyBtn({
  text,
  children = "⧉",
  className = "tiny-btn",
  onCopied,
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await copyText(text);
        onCopied?.();
        setTimeout(() => setBusy(false), 2000);
      }}
    >
      {busy ? <Spinner size={14} /> : children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────── */
export default function App() {
  /* state --------------------------------------------------- */
  const [domain, setDomain]   = useState("");
  const [repo, setRepo]       = useState("");
  const [apps, setApps]       = useState([]);
  const [sel, setSel]         = useState(new Set());
  const [open, setOpen]       = useState(new Set());

  const [keys, setKeys]       = useState(null);
  const [token, setToken]     = useState("");
  const [pwds, setPwds]       = useState(null);
  const [scripts, setScripts] = useState([]);

  const [step, setStep]       = useState(0);

  const [busyZip, setBusyZip] = useState(false);
  const [busyKey, setBusyKey] = useState(false);
  const [busyScp, setBusyScp] = useState(false);

  const [msg, setMsg]         = useState("");
  const toast = (t) => {
    setMsg(t);
    setTimeout(() => setMsg(""), toastDur);
  };

  /* bootstrap ---------------------------------------------- */
  useEffect(() => {
    fetch("/api/apps")
      .then((r) => r.json())
      .then(setApps);
  }, []);

  /* fetch scripts when entering step 8 ---------------------- */
  useEffect(() => {
    if (step !== 8 || scripts.length || busyScp) return;
    setBusyScp(true);
    fetch("/api/scripts")
      .then((r) => r.json())
      .then(setScripts)
      .finally(() => setBusyScp(false));
  }, [step, scripts.length, busyScp]);

  /* generate secrets on entering step 5 --------------------- */
  useEffect(() => {
    if (step === 5) regenAll();
  }, [step]);

  /* derived ------------------------------------------------- */
  const domainOK   = DOMAIN_RE.test(domain.trim());
  const repoOK     = REPO_RE.test(repo.trim());
  const appsChosen = sel.size > 0;
  const canZip     = domainOK && repoOK && appsChosen;

  /* auto-download ZIP -------------------------------------- */
  useEffect(() => {
    if (step === 4 && canZip) buildZip();
  }, [step, canZip]);

  /* regenerate everything ---------------------------------- */
  function regenAll() {
    setBusyKey(true);
    fetch("/api/ssh-keygen")
      .then((r) => r.json())
      .then(setKeys)
      .finally(() => setBusyKey(false));

    setToken(genToken());
    setPwds({
      argocd: genPass(),
      keycloak: genPass(),
      rancher: genPass(),
      ssh: "",
    });
  }

  /* ZIP builder -------------------------------------------- */
  async function buildZip() {
    if (busyZip) return;
    setBusyZip(true);
    const blob = await fetch("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selected: [...sel],
        repo: repo.trim(),
        domain: domain.trim().toLowerCase(),
      }),
    }).then((r) => r.blob());

    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {
      href: url,
      download: `${domain || "appforge"}.zip`,
    }).click();
    URL.revokeObjectURL(url);
    setBusyZip(false);
  }

  /* script helpers ----------------------------------------- */
  const getFile      = (n) => fetch(`/scripts/${n}`).then((r) => r.text());
  const copyFile     = async (n) => {
    await copyText(await getFile(n));
    toast("Copied file!");
  };
  const copyPlain    = async (n) => {
    await copyText(oneLiner(n, await getFile(n)));
    toast("Copied one-liner!");
  };
  const copySecretLn = async (n) => {
    const body = await getFile(n);
    const txt = oneLinerSecrets(
      n,
      body,
      { ...pwds, ssh: keys?.privateKey || "" },
      token,
      repo.trim()
    );
    await copyText(txt);
    toast("Copied secrets one-liner!");
  };

  /* selection helpers -------------------------------------- */
  const toggleSel = (n) => {
    const s = new Set(sel);
    s.has(n) ? s.delete(n) : s.add(n);
    setSel(s);
  };
  const toggleOpen = (n) => {
    const s = new Set(open);
    s.has(n) ? s.delete(n) : s.add(n);
    setOpen(s);
  };
  const selectAll   = () => setSel(new Set(apps.map((a) => a.name)));
  const unselectAll = () => setSel(new Set());

  /* nav ---------------------------------------------------- */
  const Nav = ({ next = true }) => (
    <div style={{ marginTop: "1rem" }}>
      <button className="btn-secondary" onClick={() => setStep(step - 1)}>
        ← Back
      </button>
      {next && (
        <button className="btn" onClick={() => setStep(step + 1)}>
          Next →
        </button>
      )}
    </div>
  );

  /* intro one-liner --------------------------------------- */
  const Intro = ({ i }) => <p className="intro">{steps[i].desc}</p>;

  /* renderer ----------------------------------------------- */
  function renderStep() {
    switch (step) {
      /* 0 ─ Welcome --------------------------------------- */
      case 0:
        return (
          <>
            <h2>Welcome to AppForge 🚀</h2>
            <Intro i={0} />
            <ol style={{ margin: "1rem 0 1.5rem 1.2rem" }}>
              {steps.slice(1).map((s, i) => (
                <li key={i}>
                  {s.label} – {s.desc}
                </li>
              ))}
            </ol>
            <button className="btn" onClick={() => setStep(1)}>
              Start →
            </button>
          </>
        );

      /* 1 ─ Domain ---------------------------------------- */
      case 1:
        return (
          <>
            <h2>Step 1 – Main domain</h2>
            <Intro i={1} />
            <input
              className="wizard-input"
              value={domain}
              onChange={(e) => setDomain(e.target.value.toLowerCase())}
              placeholder="example.com"
            />
            {!domainOK && <p className="error">Enter a valid domain.</p>}
            <button
              className="btn"
              disabled={!domainOK}
              onClick={() => setStep(2)}
            >
              Next →
            </button>
          </>
        );

      /* 2 ─ Repo ------------------------------------------ */
      case 2:
        return (
          <>
            <h2>Step 2 – Git repository (SSH)</h2>
            <Intro i={2} />
            <input
              className="wizard-input"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="git@host:group/repo.git"
            />
            {!repoOK && (
              <p className="error">Enter a valid SSH repository URL.</p>
            )}
            <Nav next={repoOK} />
          </>
        );

      /* 3 ─ Apps ------------------------------------------ */
      case 3:
        return (
          <>
            <h2>Step 3 – Choose applications</h2>
            <Intro i={3} />
            <div className="apps-actions">
              <button className="btn-secondary" onClick={selectAll}>
                Select all
              </button>
              <button className="btn-secondary" onClick={unselectAll}>
                Un-select all
              </button>
            </div>
            <ul className="apps-list">
              {apps.map((a) => {
                const hasInfo =
                  a.desc || a.maint || a.home || a.readme;
                const opened = open.has(a.name);
                return (
                  <li key={a.name}>
                    <div
                      className="app-item"
                      data-selected={sel.has(a.name)}
                      onClick={() => toggleSel(a.name)}
                    >
                      <input
                        type="checkbox"
                        readOnly
                        checked={sel.has(a.name)}
                      />
                      {a.icon ? (
                        <img src={a.icon} alt="" width={24} height={24} />
                      ) : (
                        "📦"
                      )}
                      <span className="app-name">{a.name}</span>
                      <button
                        className="info-btn"
                        disabled={!hasInfo}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleOpen(a.name);
                        }}
                      >
                        {opened ? "▲" : "ℹ️"}
                      </button>
                    </div>
                    {opened && (
                      <div className="app-more">
                        {a.desc && <p>{a.desc}</p>}
                        {a.maint && (
                          <p>
                            <strong>Maintainers:</strong> {a.maint}
                          </p>
                        )}
                        {a.home && (
                          <p>
                            <strong>Home:</strong>{" "}
                            <a
                              href={a.home}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {a.home}
                            </a>
                          </p>
                        )}
                        {a.readme && (
                          <details>
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
            <Nav next={appsChosen} />
          </>
        );

      /* 4 ─ ZIP + Repo ------------------------------------ */
      case 4:
        return (
          <>
            <h2>Step 4 – Download ZIP &amp; push</h2>
            <Intro i={4} />
            <p>
              1.&nbsp;<strong>Download ZIP</strong> (auto-starts).<br />
              2.&nbsp;Create / empty the repository&nbsp;
              <code>{repo || "(repo)"}</code> and push the extracted files
              to the <code>main</code> branch.
            </p>
            <button
              className="btn"
              disabled={busyZip || !canZip}
              onClick={buildZip}
            >
              {busyZip ? <Spinner size={18} /> : "Download ZIP"}
            </button>
            <Nav />
          </>
        );

      /* 5 ─ Secrets --------------------------------------- */
      case 5:
        return (
          <>
            <h2>Step 5 – Secrets</h2>
            <Intro i={5} />
            {!keys || !pwds || busyKey ? (
              <Spinner size={32} />
            ) : (
              <>
                {/* SSH public */}
                <label>SSH public key</label>
                <div className="key-wrap">
                  <pre className="key-block pub">{keys.publicKey}</pre>
                  <CopyBtn
                    text={keys.publicKey}
                    className="action-btn key-copy"
                    onCopied={() => toast("Copied!")}
                  />
                </div>

                {/* SSH private */}
                <label style={{ marginTop: "1rem" }}>SSH private key</label>
                <div className="key-wrap">
                  <pre className="key-block priv">{keys.privateKey}</pre>
                  <CopyBtn
                    text={keys.privateKey}
                    className="action-btn key-copy"
                    onCopied={() => toast("Copied!")}
                  />
                </div>

                {/* token */}
                <label style={{ marginTop: "1rem" }}>Rancher join token</label>
                <div className="key-wrap">
                  <pre className="key-block pub">{token}</pre>
                  <CopyBtn
                    text={token}
                    className="action-btn key-copy"
                    onCopied={() => toast("Copied!")}
                  />
                </div>

                {/* passwords */}
                <label style={{ marginTop: "1rem" }}>Admin passwords</label>
                <ul className="summary-list" style={{ marginTop: ".3rem" }}>
                  <li>
                    Argo CD:&nbsp;{pwds.argocd}&nbsp;
                    <CopyBtn
                      text={pwds.argocd}
                      onCopied={() => toast("Copied!")}
                    />
                  </li>
                  <li>
                    Keycloak:&nbsp;{pwds.keycloak}&nbsp;
                    <CopyBtn
                      text={pwds.keycloak}
                      onCopied={() => toast("Copied!")}
                    />
                  </li>
                  <li>
                    Rancher:&nbsp;{pwds.rancher}&nbsp;
                    <CopyBtn
                      text={pwds.rancher}
                      onCopied={() => toast("Copied!")}
                    />
                  </li>
                </ul>

                <button className="btn-secondary" onClick={regenAll}>
                  Regenerate all secrets
                </button>
                <Nav />
              </>
            )}
          </>
        );

      /* 6 ─ Deploy key ------------------------------------ */
      case 6:
        return (
          <>
            <h2>Step 6 – Deploy key</h2>
            <Intro i={6} />
            <p>
              Add the SSH public key above as a deploy&nbsp;key
              (<em>read&nbsp;/ write</em>) in&nbsp;
              <code>{repo || "(repo)"} </code>.
            </p>
            {keys && (
              <CopyBtn
                text={keys.publicKey}
                className="action-btn key-copy"
                onCopied={() => toast("Copied!")}
              />
            )}
            <Nav />
          </>
        );

      /* 7 ─ SSH VMs --------------------------------------- */
      case 7:
        return (
          <>
            <h2>Step 7 – SSH onto the VMs</h2>
            <Intro i={7} />
            <p>
              Log into <strong>every</strong> VM that should join the RKE2
              cluster and make sure you run the downloaded scripts (next
              step).
            </p>
            <Nav />
          </>
        );

      /* 8 ─ Scripts --------------------------------------- */
      case 8:
        return (
          <>
            <h2>Step 8 – Helper scripts</h2>
            <Intro i={8} />
            {busyScp ? (
              <Spinner size={28} />
            ) : (
              <table className="scripts-table">
                <tbody>
                  {scripts.map((s) => {
                    const box = {
                      display: "flex",
                      gap: ".5rem",
                      flexWrap: "wrap",
                    };
                    return (
                      <tr key={s}>
                        <td>
                          <code>{s}</code>
                        </td>
                        <td style={box}>
                          <a
                            className="tiny-btn"
                            href={`/scripts/${s}`}
                            download
                          >
                            Download
                          </a>
                          <button
                            className="tiny-btn"
                            onClick={() => copyFile(s)}
                          >
                            ⧉ File
                          </button>
                          <button
                            className="tiny-btn"
                            onClick={() => copyPlain(s)}
                          >
                            ⧉ One-liner
                          </button>
                          <button
                            className="tiny-btn"
                            onClick={() => copySecretLn(s)}
                          >
                            ⧉ One-liner&nbsp;+&nbsp;secrets
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <Nav />
          </>
        );

      /* 9 ─ Overview -------------------------------------- */
      default:
        return (
          <>
            <h2>Step 9 – Overview 🎉</h2>
            <Intro i={9} />
            {/* dark-hover fix */}
            <style>{`
              [data-theme='dark'] .summary-table tr:hover{
                background:#1f242a !important;
              }
            `}</style>
            <table className="summary-table">
              <tbody>
                <tr>
                  <th>Domain</th>
                  <td>{domain}</td>
                  <td>
                    <CopyBtn text={domain} onCopied={() => toast("Copied!")} />
                  </td>
                </tr>
                <tr>
                  <th>Git repo</th>
                  <td>{repo}</td>
                  <td>
                    <CopyBtn text={repo} onCopied={() => toast("Copied!")} />
                  </td>
                </tr>
                <tr>
                  <th>Apps</th>
                  <td colSpan={2}>
                    {[...sel].join(", ") || "—"}
                  </td>
                </tr>
                <tr>
                  <th>Rancher token</th>
                  <td>{token}</td>
                  <td>
                    <CopyBtn text={token} onCopied={() => toast("Copied!")} />
                  </td>
                </tr>
                <tr>
                  <th>SSH public key</th>
                  <td style={{ wordBreak: "break-all" }}>
                    {keys?.publicKey || "—"}
                  </td>
                  <td>
                    {keys && (
                      <CopyBtn
                        text={keys.publicKey}
                        onCopied={() => toast("Copied!")}
                      />
                    )}
                  </td>
                </tr>
                <tr>
                  <th>SSH private key</th>
                  <td style={{ wordBreak: "break-all" }}>
                    {keys?.privateKey || "—"}
                  </td>
                  <td>
                    {keys && (
                      <CopyBtn
                        text={keys.privateKey}
                        onCopied={() => toast("Copied!")}
                      />
                    )}
                  </td>
                </tr>
                <tr>
                  <th>Passwords</th>
                  <td colSpan={2}>
                    Argo&nbsp;CD: {pwds?.argocd || "—"} · Keycloak:{" "}
                    {pwds?.keycloak || "—"} · Rancher:{" "}
                    {pwds?.rancher || "—"}
                  </td>
                </tr>
              </tbody>
            </table>
            <button
              className="btn"
              style={{ marginTop: "1.2rem" }}
              onClick={() => setStep(0)}
            >
              Start again
            </button>
          </>
        );
    }
  }

  /* render ------------------------------------------------- */
  return (
    <div className="app-wrapper">
      <ThemeToggle />

      {/* pill tracker */}
      <div className="steps-nav">
        {steps.map((s, i) => (
          <div
            key={i}
            className={
              "step-pill " +
              (i === step ? "active" : i < step ? "completed" : "disabled")
            }
            title={s.desc}
            onClick={() => {
              if (i <= step) setStep(i);
            }}
          >
            <span className="num">{i + 1}</span>
            <span className="lbl">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="step-content">{renderStep()}</div>

      {msg && <div className="copy-msg">{msg}</div>}
    </div>
  );
}
