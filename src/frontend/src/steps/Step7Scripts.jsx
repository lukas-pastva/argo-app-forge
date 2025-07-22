// src/frontend/src/steps/Step7Scripts.jsx
//
// ✨ Bug‑fix 2025‑07‑22
// ───────────────────
// • oneLiner() now runs the generated script *and* history‑wipe on the
//   **same shell line**, so nothing is left waiting on STDIN while the
//   script prompts the user.
// • oneLinerSecrets() no longer appends an extra “unset HISTFILE …” —
//   the cleanup is already part of oneLiner().
//   ↳ This prevents the stray
//       unset HISTFILE && history ‑c || true10.0.0.3:9345"
//     from leaking into */etc/rancher/rke2/config.yaml*.
//
import React, { useEffect, useState } from "react";
import Spinner            from "../components/Spinner.jsx";
import { useInitState }   from "../state/initState.jsx";

/* ────────────────────────────────────────────────────────────
   Tiny helpers – delimiter picker, one‑liner, playbook,
   clipboard (with fallback) & “busy” copy button.
──────────────────────────────────────────────────────────── */
const rand      = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
const pickDelim = (body, base = "EOF") => {
  if (!body.includes(`\n${base}\n`)) return base;
  while (true) {
    const d = `${base}_${rand().slice(0, 6).toUpperCase()}`;
    if (!body.includes(`\n${d}\n`)) return d;
  }
};
/*  BUG‑FIX: script call + history wipe are now on ONE line  */
const oneLiner = (name, body) => {
  const D = pickDelim(body);
  return [
    `cat <<'${D}' > ${name}`,
    body.trimEnd(),
    `${D}`,
    /* nothing is printed *after* the script starts reading stdin */
    `sudo -E bash ${name} && unset HISTFILE && history -c || true`,
  ].join("\n");
};
const makePlaybook = (file, body) => {
  const ind = body
    .split("\n")
    .map(l => `          ${l}`)
    .join("\n"); // 10‑sp indent
  return `---
- hosts: all
  become: true
  tasks:
    - name: Upload ${file}
      copy:
        dest: /tmp/${file}
        mode: "0755"
        content: |
${ind}
    - name: Run ${file}
      shell: /tmp/${file}
      args:
        chdir: /tmp
`;
};
async function copy(txt) {
  try {
    await navigator.clipboard.writeText(txt);
  } catch (_) {
    const ta = Object.assign(document.createElement("textarea"), {
      value: txt,
      style: "position:fixed;opacity:0",
    });
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}
function CopyBtn({ getText, label = "⧉", className = "tiny-btn", onCopied }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await copy(await getText());
          onCopied?.();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner size={14} /> : label}
    </button>
  );
}

/* NEW helper – test if the selected script is the *worker* installer  */
const isWorkerScript = name =>
  /(^|\/)2-install-worker\.sh$/.test(name);

/* ─────────────────────────────────────────────────────────── */
export default function Step7Scripts({ step, setStep }) {
  const ctx              = useInitState();
  const [list, setList]  = useState([]);
  const [busy, setBusy]  = useState(true);
  const [cache, setCache]= useState({}); // name → body

  /* fetch list once we land on this step -------------------- */
  useEffect(() => {
    (async () => {
      setBusy(true);
      const arr = await fetch("/api/scripts").then(r => r.json());
      setList(arr);
      setBusy(false);
    })();
  }, []);

  /* helper – fetch file once & cache ------------------------ */
  async function getBody(name) {
    if (cache[name]) return cache[name];
    const txt = await fetch(`/scripts/${name}`).then(r => r.text());
    setCache(o => ({ ...o, [name]: txt }));
    return txt;
  }

  /* create “one‑liner + secrets” ---------------------------- */
  async function oneLinerSecrets(name) {
    const body       = await getBody(name);

    /* ── WORKER NODES need *just* the join token ─────────── */
    if (isWorkerScript(name)) {
      const lines = [
        `export RANCHER_TOKEN="${ctx.token}"`,
        "",
        oneLiner(name, body),            // cleanup already inside
      ];
      return lines.join("\n");
    }

    /* ── CONTROL‑PLANE & misc scripts keep full bundle ──── */
    const pw   = ctx.pwds || {};
    const keys = ctx.keys || {};
    const oauth2Apps = [...ctx.sel].filter(n => n.startsWith("oauth2-"));
    const needsS3    = [...ctx.sel].some(n =>
      ["loki", "thanos", "tempo"].includes(n.toLowerCase()),
    );

    const lines = [
      `export GIT_REPO_URL="${ctx.repo.trim()}"`,
      `export RANCHER_TOKEN="${ctx.token}"`,
      `export ARGOCD_PASS="${pw.argocd || ""}"`,
      `export KEYCLOAK_PASS="${pw.keycloak || ""}"`,
      `export RANCHER_PASS="${pw.rancher || ""}"`,
      `export GRAFANA_PASS="${pw.grafana || ""}"`,
      `export SSH_PRIVATE_KEY='${keys.privateKey?.replace(/\n/g, "\\n") || ""}'`,
      `export SELECTED_APPS="${[...ctx.sel].join(" ")}"`,
    ];

    /* install‑rancher flag */
    if ([...ctx.sel].some(n => n.toLowerCase().includes("rancher")))
      lines.push(`export INSTALL_RANCHER="true"`);

    /* OAuth2 env‑vars */
    if (oauth2Apps.length) {
      lines.push(`export OAUTH2_APPS="${oauth2Apps.join(" ")}"`);
      for (const app of oauth2Apps) {
        const env = app.toUpperCase().replace(/-/g, "_");
        const sec = ctx.oauth2Secrets[app] || {};
        lines.push(
          `export ${env}_CLIENT_ID="${sec.clientId || ""}"`,
          `export ${env}_CLIENT_SECRET="${sec.clientSecret || ""}"`,
          `export ${env}_COOKIE_SECRET="${sec.cookieSecret || ""}"`,
          `export ${env}_REDIS_PASSWORD="${sec.redisPassword || ""}"`,
        );
      }
    }

    /* S‑3 creds */
    if (needsS3) {
      lines.push(
        `export S3_ACCESS_KEY_ID="${ctx.s3.id || ""}"`,
        `export S3_SECRET_ACCESS_KEY="${ctx.s3.key || ""}"`,
        `export S3_ENDPOINT="${ctx.s3.url || ""}"`,
        `export S3_BUCKET="${ctx.bucket || ""}"`,
      );
    }

    lines.push(
      "",
      oneLiner(name, body),              // cleanup already inside
    );
    return lines.join("\n");
  }

  /* render -------------------------------------------------- */
  if (busy) {
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <Spinner size={38} />
      </div>
    );
  }

  return (
    <>
      <h2>Step 7 – Helper scripts</h2>
      <p className="intro">
        Copy / download raw scripts, one‑liner installers or tiny Ansible
        playbooks.
      </p>

      <table className="scripts-table">
        <thead>
          <tr>
            <th style={{ width: "38%" }}>Script</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.map(name => (
            <tr key={name}>
              <td>
                <code>{name}</code>
              </td>
              <td style={{ display: "flex", flexWrap: "wrap", gap: ".45rem" }}>
                {/* download raw */}
                <a className="tiny-btn" href={`/scripts/${name}`} download>
                  Download
                </a>

                {/* copy raw */}
                <CopyBtn
                  label="⧉ File"
                  getText={() => getBody(name)}
                  onCopied={() => ctx.toast("copied file!")}
                />

                {/* copy one‑liner */}
                <CopyBtn
                  label="⧉ One‑liner"
                  getText={async () => oneLiner(name, await getBody(name))}
                  onCopied={() => ctx.toast("copied one‑liner!")}
                />

                {/* copy one‑liner + secrets */}
                <CopyBtn
                  label="⧉ One‑liner + secrets"
                  getText={() => oneLinerSecrets(name)}
                  onCopied={() => ctx.toast("copied one‑liner + secrets!")}
                />

                {/* download playbook */}
                <CopyBtn
                  label="Download Ansible"
                  className="tiny-btn"
                  getText={async () => {
                    const yaml = makePlaybook(name, await getBody(name));
                    const blob = new Blob([yaml], { type: "text/yaml" });
                    const url  = URL.createObjectURL(blob);
                    Object.assign(document.createElement("a"), {
                      href: url,
                      download: `${name}.yml`,
                    }).click();
                    URL.revokeObjectURL(url);
                    return ""; // nothing to copy
                  }}
                />

                {/* copy playbook */}
                <CopyBtn
                  label="⧉ Ansible"
                  getText={async () => makePlaybook(name, await getBody(name))}
                  onCopied={() => ctx.toast("copied playbook!")}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* nav */}
      <div style={{ marginTop: "1.5rem" }}>
        <button className="btn-secondary" onClick={() => setStep(step - 1)}>
          ← Back
        </button>
        <button className="btn" onClick={() => setStep(step + 1)}>
          Next →
        </button>
      </div>
    </>
  );
}
