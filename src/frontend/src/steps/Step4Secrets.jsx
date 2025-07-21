import React, { useEffect, useState } from "react";
import { useInitState } from "../state/initState.js";
import { genPass, genCookie } from "../utils/random.js";

export default function Step4Secrets({ step, setStep }) {
  const ctx = useInitState();
  const [busy, setBusy] = useState(true);

  /* generate once --------------------------------------------------- */
  useEffect(() => {
    (async () => {
      /* key‑pair ----------------------------------------------------- */
      if (!ctx.keys) {
        const { publicKey, privateKey } = await fetch("/api/ssh-keygen").then(
          r => r.json(),
        );
        ctx.set({ keys: { publicKey, privateKey } });
      }

      /* misc tokens -------------------------------------------------- */
      if (!ctx.token) ctx.set({ token: genCookie() });
      if (!ctx.pwds)  ctx.set({ pwds: { grafana: genPass(), argocd: genPass() } });

      setBusy(false);
    })();
    // eslint‑disable‑next‑line react‑hooks/exhaustive‑deps
  }, []);

  if (busy) return <p>Generating keys…</p>;

  const copy = txt => {
    navigator.clipboard.writeText(txt);
    ctx.toast("copied!");
  };

  return (
    <>
      <h2>Step 4 – Secrets & keys</h2>
      <p className="intro">
        Store these somewhere safe – you’ll need them later.
      </p>

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

      <table className="summary-table">
        <tbody>
          <tr>
            <th>Argo CD admin&nbsp;pw</th>
            <td>{ctx.pwds.argocd}</td>
            <td>
              <button className="btn-copy" onClick={() => copy(ctx.pwds.argocd)}>
                ⧉
              </button>
            </td>
          </tr>
          <tr>
            <th>Grafana admin&nbsp;pw</th>
            <td>{ctx.pwds.grafana}</td>
            <td>
              <button className="btn-copy" onClick={() => copy(ctx.pwds.grafana)}>
                ⧉
              </button>
            </td>
          </tr>
          <tr>
            <th>Cookie secret</th>
            <td>{ctx.token}</td>
            <td>
              <button className="btn-copy" onClick={() => copy(ctx.token)}>
                ⧉
              </button>
            </td>
          </tr>
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
