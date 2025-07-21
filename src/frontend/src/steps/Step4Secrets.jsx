import React, { useEffect, useState } from "react";
import { useInitState } from "../state/initState.jsx";
import { genPass, genCookie, rand } from "../utils/random.js";

/**
 * Generates & displays:
 *   • 4096‑bit RSA key pair              (public / private)
 *   • Argo CD admin password
 *   • Grafana admin password
 *   • Cookie secret
 *   • S‑3 credentials         (when loki / thanos / tempo selected)
 *   • OAuth2 app secrets       (for every oauth2‑* application)
 */
export default function Step4Secrets({ step, setStep }) {
  const ctx          = useInitState();
  const [busy, setBusy] = useState(true);

  /* ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      /* ① SSH key pair ---------------------------------------- */
      if (!ctx.keys) {
        const { publicKey, privateKey } = await fetch("/api/ssh-keygen").then(
          r => r.json(),
        );
        ctx.set({ keys: { publicKey, privateKey } });
      }

      /* ② simple tokens / passwords --------------------------- */
      if (!ctx.token)  ctx.set({ token: genCookie() });
      if (!ctx.pwds)   ctx.set({
        pwds: { grafana: genPass(), argocd: genPass() },
      });

      /* ③ S‑3 credentials (loki / thanos / tempo) ------------- */
      const needS3 = [...ctx.sel].some(a =>
        ["loki", "thanos", "tempo"].includes(a),
      );
      if (needS3 && (!ctx.s3?.id || !ctx.s3.key || !ctx.s3.url)) {
        ctx.set({
          s3: {
            id : rand().slice(0, 12),
            key: genPass() + genPass().slice(0, 6),
            url: "https://s3.example.com",
          },
        });
      }

      /* ④ OAuth2 application secrets ------------------------- */
      const oauthApps  = [...ctx.sel].filter(a => a.startsWith("oauth2-"));
      const oauthState = { ...(ctx.oauth2Secrets || {}) };
      let   changed    = false;

      for (const app of oauthApps) {
        if (!oauthState[app]) {
          changed = true;
          oauthState[app] = {
            clientId      : rand(),
            clientSecret  : genPass() + genPass().slice(0, 4),
            cookieSecret  : genCookie(),
            redisPassword : genPass(),
          };
        }
      }
      if (changed) ctx.set({ oauth2Secrets: oauthState });

      setBusy(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* tiny helper ------------------------------------------------ */
  const copy = txt => {
    navigator.clipboard.writeText(txt);
    ctx.toast("copied!");
  };

  /* ----------------------------------------------------------- */
  if (busy) return <p>Generating secrets…</p>;

  const { argocd, grafana }  = ctx.pwds;
  const { id, key, url }     = ctx.s3 ?? {};
  const oauthApps            = Object.entries(ctx.oauth2Secrets ?? {});

  return (
    <>
      <h2>Step 4 – Secrets & keys</h2>
      <p className="intro">
        Store these somewhere safe – you’ll need them later.
      </p>

      {/* SSH keys ---------------------------------------------------- */}
      <div className="key-wrap">
        <pre className="key-block pub">{ctx.keys.publicKey}</pre>
        <button className="btn-copy" onClick={() => copy(ctx.keys.publicKey)}>
          ⧉
        </button>
      </div>
      <div className="key-wrap">
        <pre className="key-block priv">{ctx.keys.privateKey}</pre>
        <button className="btn-copy" onClick={() => copy(ctx.keys.privateKey)}>
          ⧉
        </button>
      </div>

      {/* generic secrets --------------------------------------------- */}
      <table className="summary-table">
        <tbody>
          <tr>
            <th>Argo CD admin&nbsp;pw</th>
            <td>{argocd}</td>
            <td><button className="btn-copy" onClick={() => copy(argocd)}>⧉</button></td>
          </tr>
          <tr>
            <th>Grafana admin&nbsp;pw</th>
            <td>{grafana}</td>
            <td><button className="btn-copy" onClick={() => copy(grafana)}>⧉</button></td>
          </tr>
          <tr>
            <th>Cookie secret</th>
            <td>{ctx.token}</td>
            <td><button className="btn-copy" onClick={() => copy(ctx.token)}>⧉</button></td>
          </tr>

          {/* S‑3 creds (conditional) -------------------------------- */}
          {id && (
            <>
              <tr><th>S‑3 access key</th><td>{id}</td>
                <td><button className="btn-copy" onClick={() => copy(id)}>⧉</button></td></tr>
              <tr><th>S‑3 secret key</th><td>{key}</td>
                <td><button className="btn-copy" onClick={() => copy(key)}>⧉</button></td></tr>
              <tr><th>S‑3 endpoint</th><td>{url}</td>
                <td><button className="btn-copy" onClick={() => copy(url)}>⧉</button></td></tr>
            </>
          )}

          {/* OAuth2 apps (conditional) ----------------------------- */}
          {oauthApps.map(([app, sec]) => (
            <React.Fragment key={app}>
              <tr style={{ background: "var(--bg)" }}>
                <th colSpan={3} style={{ textAlign: "left" }}>
                  <strong>{app}</strong>
                </th>
              </tr>
              <tr><th>client ID</th><td>{sec.clientId}</td>
                <td><button className="btn-copy" onClick={() => copy(sec.clientId)}>⧉</button></td></tr>
              <tr><th>client secret</th><td>{sec.clientSecret}</td>
                <td><button className="btn-copy" onClick={() => copy(sec.clientSecret)}>⧉</button></td></tr>
              <tr><th>cookie secret</th><td>{sec.cookieSecret}</td>
                <td><button className="btn-copy" onClick={() => copy(sec.cookieSecret)}>⧉</button></td></tr>
              <tr><th>redis password</th><td>{sec.redisPassword}</td>
                <td><button className="btn-copy" onClick={() => copy(sec.redisPassword)}>⧉</button></td></tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>

      <button
        className="btn"
        style={{ marginTop: "1.6rem" }}
        onClick={() => setStep(step + 1)}
      >
        Next →
      </button>
    </>
  );
}
