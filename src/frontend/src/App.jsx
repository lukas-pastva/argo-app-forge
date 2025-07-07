// src/frontend/src/App.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
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

/* NEW – identify oauth2-apps */
const isOauth2 = (name = "") => name.toLowerCase().startsWith("oauth2-");

/* NEW – build secret bundle for every oauth2-app ---------------- */
function makeOauth2Secrets(appNames = []) {
  const out = {};
  for (const n of appNames) {
    out[n] = {
      clientId      : "",
      clientSecret  : "",
      cookieSecret  : genToken(),
      redisPassword : genPass(),
    };
  }
  return out;
}

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

/**
 *  NEW: now exports all OAuth2 secrets in ENV vars.
 *
 *  - apps list →  OAUTH2_APPS="oauth2-google oauth2-github"
 *  - each app   →  OAUTH2_GOOGLE_CLIENT_ID=…  (and the other 3 keys)
 */
const oneLinerSecrets = (
  n,
  body,
  priv,
  rancherToken,
  gitRepoUrl,
  installRancher = false,
  oauth2Secrets = {},            // ← NEW
) => {
  const lines = [
    `export GIT_REPO_URL="${gitRepoUrl}"`,
    `export RANCHER_TOKEN="${rancherToken}"`,
    `export ARGOCD_PASS="${priv.argocd}"`,
    `export KEYCLOAK_PASS="${priv.keycloak}"`,
    `export RANCHER_PASS="${priv.rancher}"`,
    `export SSH_PRIVATE_KEY='${priv.ssh.replace(/\n/g, "\\n")}'`,
  ];

  if (installRancher) lines.push(`export INSTALL_RANCHER="true"`);

  /* ── OAuth2 bundle ─────────────────────────────────────────── */
  const apps = Object.keys(oauth2Secrets);
  if (apps.length) {
    lines.push(`export OAUTH2_APPS="${apps.join(" ")}"`);

    for (const name of apps) {
      const env = name.toUpperCase().replace(/-/g, "_");  // oauth2-google → OAUTH2_GOOGLE
      const sec = oauth2Secrets[name] || {};

      lines.push(
        `export OAUTH2_${env}_CLIENT_ID="${sec.clientId}"`,
        `export OAUTH2_${env}_CLIENT_SECRET="${sec.clientSecret}"`,
        `export OAUTH2_${env}_COOKIE_SECRET="${sec.cookieSecret}"`,
        `export OAUTH2_${env}_REDIS_PASSWORD="${sec.redisPassword}"`,
      );
    }
  }

  /* write script → sudo-run */
  lines.push("", oneLiner(n, body));

  /* 🔒 wipe this shell’s history so secrets don’t stay in ~/.bash_history */
  lines.push(
    "",
    "# wipe the interactive shell history (non-sudo user)",
    "unset HISTFILE && history -c || true",
  );

  return lines.join("\n");
};

/* ── Async clipboard button with built-in loader ──────────── */
function AsyncCopyBtn({
  getText,
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
        try {
          const txt = await getText();
          await copyText(txt);
          onCopied?.();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner size={14} /> : children}
    </button>
  );
}

/* ── classic CopyBtn (unchanged) ──────────────────────────── */
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

/* ── steps meta ───────────────────────────────────────────── */
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

  /* NEW – oauth2 secret bundle */
  const [oauth2Secrets, setOauth2Secrets] = useState({});

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

  /* 🔄 generate secrets when first landing on Step 5 --------- */
  useEffect(() => {
    if (step === 5 && !keys) regenAll();
  }, [step, keys]);

  /* derived ------------------------------------------------- */
  const domainOK   = DOMAIN_RE.test(domain.trim());
  const repoOK     = REPO_RE.test(repo.trim());
  const appsChosen = sel.size > 0;
  const canZip     = domainOK && repoOK && appsChosen;

  /* NEW – oauth2 validation */
  const oauth2Apps         = [...sel].filter(isOauth2);
  const oauth2ClientMiss   = oauth2Apps.some(
    (n) => !oauth2Secrets[n] ||
           !oauth2Secrets[n].clientId.trim() ||
           !oauth2Secrets[n].clientSecret.trim()
  );

  /* ──────────────────────────────────────────────────────────
     NEW ➊ – advance-on-Enter key handler with extra validation
  ────────────────────────────────────────────────────────── */
  const advanceIfAllowed = useCallback(() => {
    const allowed =
      (step === 0) ? true :
      (step === 1) ? domainOK :
      (step === 2) ? repoOK   :
      (step === 3) ? appsChosen :
      (step === 4) ? true :
      (step === 5) ? !oauth2ClientMiss :
      /* steps 6-8 have no extra validation */ true;

    if (!allowed) return;
    if (step < steps.length - 1) setStep(step + 1);
  }, [step, domainOK, repoOK, appsChosen, oauth2ClientMiss]);

  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Enter") return;
      /* ignore if a modal is open (AppDetails, preview dialogs, etc.) */
      if (document.querySelector(".modal-overlay")) return;
      /* ignore multi-line editors (Monaco & textareas) */
      const el = document.activeElement;
      if (
        el &&
        (el.tagName === "TEXTAREA" ||
          (el.getAttribute("role") === "textbox" && el.contentEditable === "true"))
      ) {
        return;
      }
      /* prevent form submission side-effects */
      e.preventDefault();
      advanceIfAllowed();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [advanceIfAllowed]);

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

    /* NEW – oauth2 secrets generation */
    const newOauth2 = makeOauth2Secrets(oauth2Apps);
    setOauth2Secrets(newOauth2);
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
  const getFile = (n) => fetch(`/scripts/${n}`).then((r) => r.text());

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

  /* helper – mutate oauth2 secret field -------------------- */
  function updateOauth2(name, field, val) {
    setOauth2Secrets((prev) => ({
      ...prev,
      [name]: { ...prev[name], [field]: val },
    }));
  }

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
      /* 0 ─ Welcome */ case 0:
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

      /* 1 ─ Domain */ case 1:
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

      /* 2 ─ Repo */ case 2:
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

      /* 3 ─ Apps */ case 3:
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

      /* 4 ─ ZIP + Repo */ case 4:
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

      /* 5 ─ Secrets (UPDATED) */ case 5:
        return (
          <>
            <h2>Step 5 – Secrets</h2>
            <Intro i={5} />
            {!keys || !pwds || busyKey ? (
              <Spinner size={32} />
            ) : (
              <>
                {/* existing secrets --------------------------------------- */}
                <label>SSH public key</label>
                <div className="key-wrap">
                  <pre className="key-block pub">{keys.publicKey}</pre>
                  <CopyBtn
                    text={keys.publicKey}
                    className="action-btn key-copy"
                    onCopied={() => toast("Copied!")}
                  />
                </div>

                <label style={{ marginTop: "1rem" }}>SSH private key</label>
                <div className="key-wrap">
                  <pre className="key-block priv">{keys.privateKey}</pre>
                  <CopyBtn
                    text={keys.privateKey}
                    className="action-btn key-copy"
                    onCopied={() => toast("Copied!")}
                  />
                </div>

                <label style={{ marginTop: "1rem" }}>Rancher join token</label>
                <div className="key-wrap">
                  <pre className="key-block pub">{token}</pre>
                  <CopyBtn
                    text={token}
                    className="action-btn key-copy"
                    onCopied={() => toast("Copied!")}
                  />
                </div>

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

                {/* NEW – oauth2 apps secrets ------------------------------- */}
                {oauth2Apps.length > 0 && (
                  <>
                    <h3 style={{ marginTop: "2rem" }}>OAuth2 application secrets</h3>
                    {oauth2Apps.map((name) => {
                      const sec = oauth2Secrets[name] || {};
                      return (
                        <div key={name} style={{ marginBottom: "1.4rem" }}>
                          <strong>{name}</strong>
                          <div style={{ display: "grid", gap: ".6rem", marginTop: ".6rem" }}>
                            <input
                              className="wizard-input"
                              placeholder="Client ID"
                              value={sec.clientId}
                              onChange={(e) =>
                                updateOauth2(name, "clientId", e.target.value)
                              }
                            />
                            <input
                              className="wizard-input"
                              placeholder="Client secret"
                              type="password"
                              value={sec.clientSecret}
                              onChange={(e) =>
                                updateOauth2(name, "clientSecret", e.target.value)
                              }
                            />
                            <div className="key-wrap">
                              <pre className="key-block pub">
                                {sec.cookieSecret}
                              </pre>
                              <CopyBtn
                                text={sec.cookieSecret}
                                className="action-btn key-copy"
                                onCopied={() => toast("Copied!")}
                              />
                            </div>
                            <div className="key-wrap">
                              <pre className="key-block pub">
                                {sec.redisPassword}
                              </pre>
                              <CopyBtn
                                text={sec.redisPassword}
                                className="action-btn key-copy"
                                onCopied={() => toast("Copied!")}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {oauth2ClientMiss && (
                      <p className="error">
                        Enter Client ID and Client secret for every OAuth2 app.
                      </p>
                    )}
                  </>
                )}

                <button className="btn-secondary" onClick={regenAll}>
                  Regenerate all secrets
                </button>
                <Nav next={!oauth2ClientMiss} />
              </>
            )}
          </>
        );

      /* 6 ─ Deploy key */ case 6:
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

      /* 7 ─ SSH VMs */ case 7:
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

      /* 8 ─ Scripts */ case 8:
        return (
          <>
            <h2>Step 8 – Helper scripts</h2>
            <Intro i={8} />
            {busyScp ? (
              <Spinner size={28} />
            ) : (
              <table className="scripts-table">
                <tbody>
                  {scripts.map((s) => (
                    <tr key={s}>
                      <td>
                        <code>{s}</code>
                      </td>
                      <td style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                        <a className="tiny-btn" href={`/scripts/${s}`} download>
                          Download
                        </a>
                        <AsyncCopyBtn
                          getText={() => getFile(s)}
                          onCopied={() => toast("Copied file!")}
                        >
                          ⧉ File
                        </AsyncCopyBtn>
                        <AsyncCopyBtn
                          getText={async () => oneLiner(s, await getFile(s)) }
                          onCopied={() => toast("Copied one-liner!")}
                        >
                          ⧉ One-liner
                        </AsyncCopyBtn>
                        <AsyncCopyBtn
                          getText={async () => {
                            const body = await getFile(s);
                            const installRancher = [...sel].some((a) =>
                              a.toLowerCase().includes("rancher"),
                            );
                            return oneLinerSecrets(
                              s,
                              body,
                              { ...pwds, ssh: keys?.privateKey || "" },
                              token,
                              repo.trim(),
                              installRancher,
                              oauth2Secrets,             // ← NEW ARG
                            );
                          }}
                          onCopied={() => toast("Copied one-liner + secrets!") }
                        >
                          ⧉ One-liner&nbsp;+&nbsp;secrets
                        </AsyncCopyBtn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Nav />
          </>
        );

      /* 9 ─ Overview (UPDATED) */ case 9:
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
                  <th>Argo CD password</th>
                  <td>{pwds?.argocd || "—"}</td>
                  <td>
                    <CopyBtn
                      text={pwds?.argocd || ""}
                      onCopied={() => toast("Copied!")}
                    />
                  </td>
                </tr>
                <tr>
                  <th>Keycloak password</th>
                  <td>{pwds?.keycloak || "—"}</td>
                  <td>
                    <CopyBtn
                      text={pwds?.keycloak || ""}
                      onCopied={() => toast("Copied!")}
                    />
                  </td>
                </tr>
                <tr>
                  <th>Rancher password</th>
                  <td>{pwds?.rancher || "—"}</td>
                  <td>
                    <CopyBtn
                      text={pwds?.rancher || ""}
                      onCopied={() => toast("Copied!")}
                    />
                  </td>
                </tr>

                <tr>
                  <th>SSH public key</th>
                  <td>
                    <pre className="key-block pub">
                      {keys
                        ? keys.publicKey.split("\n").slice(0, 2).join("\n") + "\n…"
                        : "—"}
                    </pre>
                  </td>
                  <td>
                    {keys && (
                      <CopyBtn
                        text={keys.publicKey}
                        className="tiny-btn"
                        onCopied={() => toast("Copied!")}
                      />
                    )}
                  </td>
                </tr>

                <tr>
                  <th>SSH private key</th>
                  <td>
                    <pre className="key-block priv">
                      {keys
                        ? keys.privateKey.split("\n").slice(0, 2).join("\n") + "\n…"
                        : "—"}
                    </pre>
                  </td>
                  <td>
                    {keys && (
                      <CopyBtn
                        text={keys.privateKey}
                        className="tiny-btn"
                        onCopied={() => toast("Copied!")}
                      />
                    )}
                  </td>
                </tr>

                {/* NEW – oauth2 secrets overview --------------------- */}
                {oauth2Apps.flatMap((name) => {
                  const sec = oauth2Secrets[name] || {};
                  return [
                    ["Client ID", sec.clientId],
                    ["Client secret", sec.clientSecret],
                    ["Cookie secret", sec.cookieSecret],
                    ["Redis password", sec.redisPassword],
                  ].map(([label, val], idx) => (
                    <tr key={`${name}-${idx}`}>
                      <th>{name} – {label}</th>
                      <td>{val || "—"}</td>
                      <td>
                        {val && (
                          <CopyBtn
                            text={val}
                            className="tiny-btn"
                            onCopied={() => toast("Copied!")}
                          />
                        )}
                      </td>
                    </tr>
                  ));
                })}
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

      default:
        return null;
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
