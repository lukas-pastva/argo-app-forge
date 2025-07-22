import React from "react";
import { useInitState, stepsMeta } from "../state/initState.jsx";

/* simple copy‑to‑clipboard button ---------------------------------------- */
function CopyBtn({ text, className = "tiny-btn", onCopied }) {
  return (
    <button
      className={className}
      onClick={() => {
        navigator.clipboard.writeText(text || "");
        onCopied?.();
      }}
    >
      ⧉
    </button>
  );
}

export default function Step8Overview() {
  const ctx = useInitState();

  /* which apps need S‑3 creds? */
  const s3Required = [...ctx.sel].some((n) =>
    ["loki", "thanos", "tempo"].includes(n.toLowerCase())
  );

  /* handy helper – mask secret values unless copied */
  const maskIfSecret = (label, value, hide) =>
    hide || /secret|password|key/i.test(label) ? "••••••" : value;

  /* build rows once */
  const rows = [
    { label: "Domain", val: ctx.domain },
    { label: "Git repo", val: ctx.repo },
  ];

  /* admin passwords ------------------------------------------------------ */
  ["argocd", "keycloak", "rancher", "grafana"].forEach((k) => {
    rows.push({
      label: `${k.charAt(0).toUpperCase() + k.slice(1)} password`,
      val: ctx.pwds?.[k] || "—",
      hide: true,
    });
  });

  /* SSH key pair --------------------------------------------------------- */
  if (ctx.keys) {
    rows.push(
      {
        label: "SSH public key",
        val: ctx.keys.publicKey
          .split("\n")
          .slice(0, 2)
          .join("\n") + "\n…",
        copy: ctx.keys.publicKey,
      },
      {
        label: "SSH private key",
        val: ctx.keys.privateKey
          .split("\n")
          .slice(0, 2)
          .join("\n") + "\n…",
        copy: ctx.keys.privateKey,
        hide: true,
      }
    );
  }

  /* OAuth2 application secrets ------------------------------------------ */
  const oauth2Apps = [...ctx.sel].filter((n) => n.toLowerCase().startsWith("oauth2-"));
  oauth2Apps.forEach((name) => {
    const s = ctx.oauth2Secrets?.[name] || {};
    rows.push(
      { label: `${name} – Client ID`, val: s.clientId || "—" },
      { label: `${name} – Client secret`, val: s.clientSecret || "—", hide: true },
      { label: `${name} – Cookie secret`, val: s.cookieSecret || "—", hide: true },
      { label: `${name} – Redis password`, val: s.redisPassword || "—", hide: true }
    );
  });

  /* S‑3 credentials ------------------------------------------------------ */
  if (s3Required) {
    rows.push(
      { label: "S3_ACCESS_KEY_ID", val: ctx.s3.id },
      { label: "S3_SECRET_ACCESS_KEY", val: ctx.s3.key, hide: true },
      { label: "S3_ENDPOINT", val: ctx.s3.url },
      { label: "S3_BUCKET", val: ctx.bucket }
    );
  }

  /* copy helper */
  const copy = (txt) => navigator.clipboard.writeText(txt);

  /* render --------------------------------------------------------------- */
  return (
    <>
      <h2>Step 8 – Everything at a glance</h2>
      <p className="intro">Quick reference for all data generated in this session.</p>

      <table className="summary-table">
        <tbody>
          {rows.map(({ label, val, copy: cp, hide }, i) => (
            <tr key={i}>
              <th>{label}</th>
              <td>{maskIfSecret(label, val, hide)}</td>
              <td>
                {cp || val ? (
                  <CopyBtn
                    text={cp ?? val}
                    onCopied={() => ctx.toast("copied!")}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: "2rem", fontSize: ".9rem", color: "var(--text-light)" }}>
        You can revisit any step via the pill‑navigator above to regenerate or
        change individual pieces. Happy hacking!
      </p>
    </>
  );
}
