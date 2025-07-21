// src/frontend/src/steps/Step8Overview.jsx
import React from "react";
import { useInitState, stepsMeta } from "../state/initState.jsx";
import CopyBtn from "../components/CopyBtn.jsx";   // ← if CopyBtn lives elsewhere, adjust import

/* helper – mask sensitive values in the UI, but keep them copyable */
const masked = (val) => (val ? "••••••" : "—");

export default function Step8Overview() {
  const ctx = useInitState();
  const { domain, repo, pwds = {}, keys = {}, s3 = {}, bucket = "" } = ctx;

  /* OAuth2 section -------------------------------------------------- */
  const oauth2Rows = Object.entries(ctx.oauth2Secrets || {}).flatMap(
    ([app, sec]) => {
      const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
      return [
        { label: `${app} – Client ID`,        val: sec.clientId,        hide: false },
        { label: `${app} – Client secret`,    val: sec.clientSecret,    hide: true  },
        { label: `${app} – Cookie secret`,    val: sec.cookieSecret,    hide: true  },
        { label: `${app} – Redis password`,   val: sec.redisPassword,   hide: false },
      ];
    },
  );

  /* S‑3 rows (only when relevant) ----------------------------------- */
  const s3Rows = ["loki", "thanos", "tempo"].some((n) =>
    [...ctx.sel].includes(n),
  )
    ? [
        { label: "S3_ACCESS_KEY_ID",      val: s3.id,  hide: false },
        { label: "S3_SECRET_ACCESS_KEY",  val: s3.key, hide: true  },
        { label: "S3_ENDPOINT",           val: s3.url, hide: false },
        { label: "S3_BUCKET",             val: bucket, hide: false },
      ]
    : [];

  /* main rows ------------------------------------------------------- */
  const rows = [
    { label: "Main domain",      val: domain },
    { label: "Git repo",         val: repo   },
    ...["argocd", "keycloak", "rancher", "grafana"].map((k) => ({
      label: `${k.charAt(0).toUpperCase() + k.slice(1)} password`,
      val: pwds[k],
      hide: true,
    })),
    { label: "SSH public key",   val: keys.publicKey },
    { label: "SSH private key",  val: keys.privateKey, hide: true },
    ...oauth2Rows,
    ...s3Rows,
  ];

  /* render ---------------------------------------------------------- */
  return (
    <>
      <h2>Step 8 – Everything at a glance</h2>
      <p className="intro">{stepsMeta[8].desc}</p>

      <table className="summary-table">
        <tbody>
          {rows.map(({ label, val, hide = false }) => (
            <tr key={label}>
              <th>{label}</th>
              <td>{hide ? masked(val) : val || "—"}</td>
              <td>
                {val && (
                  <CopyBtn
                    text={val}
                    className="tiny-btn"
                    onCopied={() => ctx.toast("Copied!")}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        className="btn"
        style={{ marginTop: "1.2rem" }}
        onClick={() => ctx.setStep?.(0) ?? window.location.reload()}
      >
        Start again
      </button>
    </>
  );
}
