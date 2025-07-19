// src/frontend/src/App.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import Spinner     from "./components/Spinner.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import "./App.css";

/* ── regex & helpers ───────────────────────────────────────── */
const NAME_RE   = /^[a-z0-9-]{2,}$/i;                             // NEW
const REPO_RE   = /^git@[^:]+:[A-Za-z0-9._/-]+\.git$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
const toastDur  = 2000;

/* random helpers ----------------------------------------------------------- */
const rand        = () =>
  crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
const genPass     = () => rand();                          // 10‑char password
const genCookie   = () => crypto.randomUUID().replace(/-/g, ""); // 32‑char key

/* OAuth2 app detector ------------------------------------------------------ */
const isOauth2 = (n = "") => n.toLowerCase().startsWith("oauth2-");

/* build secret bundle for every OAuth2 app -------------------------------- */
function makeOauth2Secrets(appNames = []) {
  const out = {};
  for (const n of appNames) {
    out[n] = {
      clientId      : "",
      clientSecret  : "",
      cookieSecret  : genCookie(),      // 32 ASCII chars
      redisPassword : genPass(),
    };
  }
  return out;
}

/* heredoc delimiter helper ------------------------------------------------- */
function pickDelimiter(body, base = "EOF") {
  if (!body.includes(`\n${base}\n`)) return base;
  while (true) {
    const rnd = `${base}_${rand().slice(0, 6).toUpperCase()}`;
    if (!body.includes(`\n${rnd}\n`)) return rnd;
  }
}

/* one‑liner scaffolding ---------------------------------------------------- */
const oneLiner = (name, body) => {
  const d = pickDelimiter(body);
  return [`cat <<'${d}' > ${name}`, body.trimEnd(), d, `sudo -E bash ${name}`]
    .join("\n");
};

/* one‑liner + secrets (UPDATED – bucketName param) ------------------------- */
const oneLinerSecrets = (
  name,
  body,
  priv,
  rancherToken,
  gitRepoUrl,
  installRancher = false,
  oauth2Secrets = {},
  selectedApps = [],
  s3 = { id: "", key: "", url: "" },
  bucketName = ""                                 // ← NEW
) => {
  const lines = [
    `export GIT_REPO_URL="${gitRepoUrl}"`,
    `export RANCHER_TOKEN="${rancherToken}"`,
    `export ARGOCD_PASS="${priv.argocd}"`,
    `export KEYCLOAK_PASS="${priv.keycloak}"`,
    `export RANCHER_PASS="${priv.rancher}"`,
    `export GRAFANA_PASS="${priv.grafana}"`,
    `export SSH_PRIVATE_KEY='${priv.ssh.replace(/\n/g, "\\n")}'`,
    `export SELECTED_APPS="${selectedApps.join(" ")}"`,
  ];
  if (installRancher) lines.push(`export INSTALL_RANCHER="true"`);

  /* OAuth2 bundle --------------------------------------------------------- */
  const apps = Object.keys(oauth2Secrets);
  if (apps.length) {
    lines.push(`export OAUTH2_APPS="${apps.join(" ")}"`);
    for (const n of apps) {
      const env = n.toUpperCase().replace(/-/g, "_");
      const s   = oauth2Secrets[n] || {};
      lines.push(
        `export ${env}_CLIENT_ID="${s.clientId}"`,
        `export ${env}_CLIENT_SECRET="${s.clientSecret}"`,
        `export ${env}_COOKIE_SECRET="${s.cookieSecret}"`,
        `export ${env}_REDIS_PASSWORD="${s.redisPassword}"`
      );
    }
  }

  /* S‑3 bundle — only if Loki / Thanos / Tempo selected ------------------- */
  const needsS3 = selectedApps.some(a =>
    ["loki", "thanos", "tempo"].includes(a.toLowerCase())
  );
  if (needsS3) {
    lines.push(
      `export S3_ACCESS_KEY_ID="${s3.id}"`,
      `export S3_SECRET_ACCESS_KEY="${s3.key}"`,
      `export S3_ENDPOINT="${s3.url}"`
    );
    if (bucketName) lines.push(`export S3_BUCKET="${bucketName}"`); // NEW
  }

  /* embed script, wipe history, done ------------------------------------- */
  lines.push("", oneLiner(name, body), "", "unset HISTFILE && history -c || true");
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

/* ── steps meta (UPDATED) ─────────────────────────────────── */
const steps = [
  { label: "Welcome",    desc: "Tiny tour of the whole flow." },
  { label: "Details",    desc: "Name, main domain & Git repo." },
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
  const [proj,   setProj]      = useState("");  // ← NEW Name
  const [domain, setDomain]    = useState("");
  const [repo,   setRepo]      = useState("");

  const [apps, setApps]       = useState([]);  // backend includes {namespace}
  const [sel, setSel]         = useState(new Set());
  const [open, setOpen]       = useState(new Set());

  const [keys, setKeys]       = useState(null);
  const [token, setToken]     = useState("");
  const [pwds, setPwds]       = useState(null);

  const [oauth2Secrets, setOauth2Secrets] = useState({});

  /* NEW – S‑3 block */
  const emptyS3   = { id:"", key:"", url:"" };
  const [s3, setS3] = useState(emptyS3);

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

  /* fetch scripts when entering step 7 ---------------------- */
  useEffect(() => {
    if (step !== 7 || scripts.length || busyScp) return;
    setBusyScp(true);
    fetch("/api/scripts")
      .then((r) => r.json())
      .then(setScripts)
      .finally(() => setBusyScp(false));
  }, [step, scripts.length, busyScp]);

  /* 🔄 generate secrets when first landing on Step 4 --------- */
  useEffect(() => {
    if (step === 4 && !keys) regenAll();
  }, [step, keys]);

  /* derived ------------------------------------------------- */
  const nameOK     = NAME_RE.test(proj.trim());
  const domainOK   = DOMAIN_RE.test(domain.trim());
  const repoOK     = REPO_RE.test(repo.trim());
  const appsChosen = sel.size > 0;
  const canZip     = domainOK && repoOK && appsChosen;

  /* S‑3 credentials required? */
  const s3Required   = [...sel].some(n =>
                       ["loki","thanos","tempo"].includes(n.toLowerCase()));
  const s3Missing    = s3Required &&
                       (!s3.id.trim() || !s3.key.trim() || !s3.url.trim());

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
      (step === 1) ? (nameOK && domainOK && repoOK) :
      (step === 2) ? appsChosen :
      (step === 3) ? true :
      (step === 4) ? (!oauth2ClientMiss && !s3Missing) :
      /* steps 5‑7 have no extra validation */ true;

    if (!allowed) return;
    if (step < steps.length - 1) setStep(step + 1);
  }, [step, nameOK, domainOK, repoOK, appsChosen, oauth2ClientMiss, s3Missing]);

  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Enter") return;
      if (document.querySelector(".modal-overlay")) return;
      const el = document.activeElement;
      if (
        el &&
        (el.tagName === "TEXTAREA" ||
          (el.getAttribute("role") === "textbox" && el.contentEditable === "true"))
      ) {
        return;
      }
      e.preventDefault();
      advanceIfAllowed();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [advanceIfAllowed]);

  /* auto-download ZIP -------------------------------------- */
  useEffect(() => {
    if (step === 3 && canZip) buildZip();
  }, [step, canZip]);

  /* regenerate everything ---------------------------------- */
  function regenAll() {
    setBusyKey(true);
    fetch("/api/ssh-keygen")
      .then((r) => r.json())
      .then(setKeys)
      .finally(() => setBusyKey(false));

    setToken(rand());
    setPwds({
      argocd: genPass(),
      keycloak: genPass(),
      rancher: genPass(),
      grafana : genPass(),
      ssh: "",
    });

    /* wipe any previous S‑3 creds when regenerating everything */
    setS3(emptyS3);

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

  /* ──────────────────────────────────────────────────────────
     RENDER HELPERS – App card + grouped layout (Step 2)
  ────────────────────────────────────────────────────────── */

  function AppCard({ a }) {
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
  }

  function renderGroupedApps() {
    /* preserve original YAML ordering:
       we reduce across `apps` in array order and push onto an ordered list */
    const order = [];
    const groups = {};
    for (const a of apps) {
      const ns = a.namespace || "default";
      if (!groups[ns]) {
        groups[ns] = [];
        order.push(ns);
      }
      groups[ns].push(a);
    }

    return order.map((ns) => {
      const arr = groups[ns];
      /* highlight group border if ANY app within is selected */
      const anySel = arr.some((a) => sel.has(a.name));
      return (
        <div
          key={ns}
          className="apps-ns-group"
          data-selected={anySel}
        >
          <h3>
            {ns}
            <span className="apps-ns-count">
              ({arr.length}{arr.length === 1 ? " app" : " apps"})
            </span>
          </h3>
          <ul className="apps-list">
            {arr.map((a) => (
              <AppCard key={a.name} a={a} />
            ))}
          </ul>
        </div>
      );
    });
  }

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

      /* 1 ─ Details (Name + Domain + Repo) */ case 1:
        return (
          <>
            <h2>Step 1 – Project details</h2>
            <Intro i={1} />
            <label>Name (bucket)</label>
            <input
              className="wizard-input"
              value={proj}
              onChange={(e) => setProj(e.target.value.toLowerCase())}
              placeholder="myproject"
            />
            {!nameOK && <p className="error">Lower‑case letters, digits & “‑”.</p>}

            <label style={{ marginTop: ".8rem" }}>Main domain</label>
            <input
              className="wizard-input"
              value={domain}
              onChange={(e) => setDomain(e.target.value.toLowerCase())}
              placeholder="example.com"
            />
            {!domainOK && <p className="error">Enter a valid domain.</p>}

            <label style={{ marginTop: ".8rem" }}>Git repo (SSH)</label>
            <input
              className="wizard-input"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="git@host:group/repo.git"
            />
            {!repoOK && <p className="error">Enter a valid SSH repository URL.</p>}

            <button
              className="btn"
              disabled={!(nameOK && domainOK && repoOK)}
              onClick={() => setStep(2)}
            >
              Next →
            </button>
          </>
        );

      /* 2 ─ Apps */ case 2:
        return (
          <>
            <h2>Step 2 – Choose applications</h2>
            <Intro i={2} />
            <div className="apps-actions">
              <button className="btn-secondary" onClick={selectAll}>
                Select all
              </button>
              <button className="btn-secondary" onClick={unselectAll}>
                Un-select all
              </button>
            </div>

            {/* grouped layout */}
            {renderGroupedApps()}

            <Nav next={appsChosen} />
          </>
        );

      /* 3 ─ ZIP + Repo */ case 3:
        return (
          <>
            <h2>Step 3 – Download ZIP &amp; push</h2>
            <Intro i={3} />
            <p>
              1.&nbsp;<strong>Download ZIP</strong> (auto‑starts).<br />
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

      /* 4 ─ Secrets */ case 4:
        return (
          <>
            <h2>Step 4 – Secrets</h2>
            <Intro i={4} />
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
                  <li>
                    Grafana:&nbsp;{pwds.grafana}&nbsp;
                    <CopyBtn
                      text={pwds.grafana}
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

                {/* NEW – S‑3 credentials for Loki / Thanos / Tempo */}
                {s3Required && (
                  <>
                    <h3 style={{ marginTop: "2rem" }}>
                      Object‑storage credentials
                    </h3>
                    <input
                      className="wizard-input"
                      placeholder="S3_ACCESS_KEY_ID"
                      value={s3.id}
                      onChange={e => setS3({ ...s3, id: e.target.value })}
                    />
                    <input
                      className="wizard-input"
                      placeholder="S3_SECRET_ACCESS_KEY"
                      type="password"
                      value={s3.key}
                      onChange={e => setS3({ ...s3, key: e.target.value })}
                    />
                    <input
                      className="wizard-input"
                      placeholder="S3_ENDPOINT  (https://…)"
                      value={s3.url}
                      onChange={e => setS3({ ...s3, url: e.target.value })}
                    />
                    {s3Missing && (
                      <p className="error">
                        Please fill in all three S‑3 fields.
                      </p>
                    )}
                  </>
                )}
                <button className="btn-secondary" onClick={regenAll}>
                  Regenerate all secrets
                </button>
                <Nav next={!oauth2ClientMiss && !s3Missing} />
              </>
            )}
          </>
        );

      /* 5 ─ Deploy key */ case 5:
        /* unchanged – omitted for brevity */
        return (
          <>
            <h2>Step 5 – Deploy key</h2>
            <Intro i={5} />
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

      /* 6 ─ SSH VMs */ case 6:
        /* unchanged – omitted for brevity */
        return (
          <>
            <h2>Step 6 – SSH onto the VMs</h2>
            <Intro i={6} />
            <p>
              Log into <strong>every</strong> VM that should join the RKE2
              cluster and make sure you run the downloaded scripts (next
              step).
            </p>
            <Nav />
          </>
        );

      /* 7 ─ Scripts (UPDATED one-liner call) */ case 7:
        return (
          <>
            <h2>Step 7 – Helper scripts</h2>
            <Intro i={7} />
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
                              oauth2Secrets,
                              [...sel],
                              s3,
                              proj.trim()                      // ← NEW param
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

      /* 8 ─ Overview */ case 8:
        /* unchanged except step index */
        return (
          <>
            <h2>Step 8 – Overview 🎉</h2>
            <Intro i={8} />
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
                 <th>Grafana password</th>
                  <td>{pwds?.grafana || "—"}</td>
                  <td>
                    <CopyBtn
                      text={pwds?.grafana || ""}
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

                {s3Required && (
                  <>
                    <tr>
                      <th>S3_ACCESS_KEY_ID</th>
                      <td>{s3.id}</td>
                      <td><CopyBtn text={s3.id}  className="tiny-btn"
                                   onCopied={()=>toast("Copied!")}/></td>
                    </tr>
                    <tr>
                      <th>S3_SECRET_ACCESS_KEY</th>
                      <td>{s3.key ? "••••••" : "—"}</td>
                      <td><CopyBtn text={s3.key} className="tiny-btn"
                                   onCopied={()=>toast("Copied!")}/></td>
                    </tr>
                    <tr>
                      <th>S3_ENDPOINT</th>
                      <td>{s3.url}</td>
                      <td><CopyBtn text={s3.url} className="tiny-btn"
                                   onCopied={()=>toast("Copied!")}/></td>
                    </tr>
                  </>
                )}

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
