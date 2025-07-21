import React from "react";
import { useInitState, stepsMeta } from "../state/initState.js";

export default function Step8Overview() {
  const ctx = useInitState();

  const copy = txt => {
    navigator.clipboard.writeText(txt);
    ctx.toast("copied!");
  };

  return (
    <>
      <h2>Step 8 – Everything at a glance</h2>
      <p className="intro">Quick reference for all data generated in this session.</p>

      <table className="summary-table">
        <tbody>
          <tr><th>Main domain</th><td>{ctx.domain}</td><td><button className="btn-copy" onClick={()=>copy(ctx.domain)}>⧉</button></td></tr>
          <tr><th>Git repo</th><td>{ctx.repo}</td><td><button className="btn-copy" onClick={()=>copy(ctx.repo)}>⧉</button></td></tr>
          <tr><th>Selected apps</th><td>{[...ctx.sel].join(", ")}</td><td></td></tr>
          <tr><th>Argo CD pw</th><td>{ctx.pwds?.argocd}</td><td><button className="btn-copy" onClick={()=>copy(ctx.pwds.argocd)}>⧉</button></td></tr>
          <tr><th>Grafana pw</th><td>{ctx.pwds?.grafana}</td><td><button className="btn-copy" onClick={()=>copy(ctx.pwds.grafana)}>⧉</button></td></tr>
          <tr><th>Cookie secret</th><td>{ctx.token}</td><td><button className="btn-copy" onClick={()=>copy(ctx.token)}>⧉</button></td></tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: "1.4rem" }}>SSH keys</h3>
      <div className="key-wrap">
        <pre className="key-block pub">{ctx.keys?.publicKey}</pre>
        <button className="btn-copy" onClick={()=>copy(ctx.keys.publicKey)}>⧉</button>
      </div>
      <div className="key-wrap">
        <pre className="key-block priv">{ctx.keys?.privateKey}</pre>
        <button className="btn-copy" onClick={()=>copy(ctx.keys.privateKey)}>⧉</button>
      </div>

      <p style={{ marginTop: "2rem", fontSize: ".9rem", color: "var(--text-light)" }}>
        You can revisit any step via the pill‑navigator above to regenerate or
        change individual pieces. Happy hacking!
      </p>
    </>
  );
}
