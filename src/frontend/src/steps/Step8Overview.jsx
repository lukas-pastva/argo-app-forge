import React from "react";
import { useInitState } from "../state/initState.jsx";

export default function Step8Overview() {
  const ctx = useInitState();

  const copy = txt => {
    navigator.clipboard.writeText(txt);
    ctx.toast("copied!");
  };

  const { argocd, grafana } = ctx.pwds ?? {};
  const { id, key, url }    = ctx.s3   ?? {};
  const oauthApps           = Object.entries(ctx.oauth2Secrets ?? {});

  return (
    <>
      <h2>Step 8 – Everything at a glance</h2>
      <p className="intro">Quick reference for all data generated in this session.</p>

      <table className="summary-table">
        <tbody>
          <tr><th>Main domain</th><td>{ctx.domain}</td>
            <td><button className="btn-copy" onClick={()=>copy(ctx.domain)}>⧉</button></td></tr>
          <tr><th>Git repo</th><td>{ctx.repo}</td>
            <td><button className="btn-copy" onClick={()=>copy(ctx.repo)}>⧉</button></td></tr>
          <tr><th>Selected apps</th><td>{[...ctx.sel].join(", ")}</td><td></td></tr>

          <tr><th>Argo CD pw</th><td>{argocd}</td>
            <td><button className="btn-copy" onClick={()=>copy(argocd)}>⧉</button></td></tr>
          <tr><th>Grafana pw</th><td>{grafana}</td>
            <td><button className="btn-copy" onClick={()=>copy(grafana)}>⧉</button></td></tr>
          <tr><th>Cookie secret</th><td>{ctx.token}</td>
            <td><button className="btn-copy" onClick={()=>copy(ctx.token)}>⧉</button></td></tr>

          {/* S‑3 rows if present ----------------------------------- */}
          {id && (
            <>
              <tr><th>S‑3 access key</th><td>{id}</td>
                <td><button className="btn-copy" onClick={()=>copy(id)}>⧉</button></td></tr>
              <tr><th>S‑3 secret key</th><td>{key}</td>
                <td><button className="btn-copy" onClick={()=>copy(key)}>⧉</button></td></tr>
              <tr><th>S‑3 endpoint</th><td>{url}</td>
                <td><button className="btn-copy" onClick={()=>copy(url)}>⧉</button></td></tr>
            </>
          )}
        </tbody>
      </table>

      {/* SSH keys ------------------------------------------------------ */}
      <h3 style={{ marginTop: "1.4rem" }}>SSH keys</h3>
      <div className="key-wrap">
        <pre className="key-block pub">{ctx.keys?.publicKey}</pre>
        <button className="btn-copy" onClick={()=>copy(ctx.keys.publicKey)}>⧉</button>
      </div>
      <div className="key-wrap">
        <pre className="key-block priv">{ctx.keys?.privateKey}</pre>
        <button className="btn-copy" onClick={()=>copy(ctx.keys.privateKey)}>⧉</button>
      </div>

      {/* OAuth2 apps list --------------------------------------------- */}
      {oauthApps.length > 0 && (
        <>
          <h3 style={{ marginTop: "1.4rem" }}>OAuth2 application secrets</h3>
          {oauthApps.map(([app, sec]) => (
            <table key={app} className="summary-table" style={{ marginTop: ".9rem" }}>
              <thead>
                <tr><th colSpan={3} style={{ textAlign: "left" }}>{app}</th></tr>
              </thead>
              <tbody>
                <tr><th>client ID</th><td>{sec.clientId}</td>
                  <td><button className="btn-copy" onClick={()=>copy(sec.clientId)}>⧉</button></td></tr>
                <tr><th>client secret</th><td>{sec.clientSecret}</td>
                  <td><button className="btn-copy" onClick={()=>copy(sec.clientSecret)}>⧉</button></td></tr>
                <tr><th>cookie secret</th><td>{sec.cookieSecret}</td>
                  <td><button className="btn-copy" onClick={()=>copy(sec.cookieSecret)}>⧉</button></td></tr>
                <tr><th>redis password</th><td>{sec.redisPassword}</td>
                  <td><button className="btn-copy" onClick={()=>copy(sec.redisPassword)}>⧉</button></td></tr>
              </tbody>
            </table>
          ))}
        </>
      )}

      <p style={{ marginTop: "2rem", fontSize: ".9rem", color: "var(--text-light)" }}>
        You can revisit any step via the pill‑navigator above to regenerate or
        change individual pieces. Happy hacking!
      </p>
    </>
  );
}
