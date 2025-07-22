// src/frontend/src/steps/Step4Secrets.jsx
import React, { useEffect, useState } from "react";
import Spinner from "../components/Spinner.jsx";
import { useInitState } from "../state/initState.jsx";
import { genPass, genCookie, rand } from "../utils/random.js";

/* helpers ─────────────────────────────────────────────────────── */
const isOauth2 = (n = "") => n.toLowerCase().startsWith("oauth2-");
const makeOauth2Secrets = (appNames = []) =>
  Object.fromEntries(
    appNames.map(n => [
      n,
      {
        clientId      : "",
        clientSecret  : "",
        cookieSecret  : genCookie(),   // 32 ASCII chars
        redisPassword : genPass(),     // 10 chars
      },
    ]),
  );

const NAME_RE   = /^[a-z0-9-]{2,}$/i;                              // bucket
const S3_APPS   = ["loki", "thanos", "tempo"];                     // when to ask
const toastMs   = 2000;

/* ugly but handy – robust clipboard -------------------------------------- */
async function copy(text) {
  try      { await navigator.clipboard.writeText(text); }
  catch(_){ const ta = Object.assign(document.createElement("textarea"),{
              value:text,style:"position:fixed;opacity:0" });
            document.body.append(ta); ta.select(); document.execCommand("copy");
            ta.remove(); }
}

/* main component ───────────────────────────────────────────────────────── */
export default function Step4Secrets({ step, setStep }) {
  const ctx = useInitState();
  const [busy, setBusy] = useState(true);

  /* ── auto‑bootstrap once ─────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      /* 1) SSH key pair */
      if (!ctx.keys) {
        const k = await fetch("/api/ssh-keygen").then(r => r.json());
        ctx.set({ keys: k });
      }

      /* 2) passwords / token */
      if (!ctx.token) ctx.set({ token: rand() });
      if (!ctx.pwds) {
        ctx.set({
          pwds: {
            argocd  : genPass(),
            keycloak: genPass(),
            rancher : genPass(),
            grafana : genPass(),
          },
        });
      }

      /* 3) OAuth2 bundle – once per *current* selection */
      const oauth2Apps = [...ctx.sel].filter(isOauth2);
      if (oauth2Apps.length && Object.keys(ctx.oauth2Secrets).length === 0) {
        ctx.set({ oauth2Secrets: makeOauth2Secrets(oauth2Apps) });
      }

      setBusy(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── convenience derived flags ───────────────────────────────── */
  const oauth2Apps = [...ctx.sel].filter(isOauth2);

  const oauth2ClientMiss = oauth2Apps.some(
    n => !ctx.oauth2Secrets[n]?.clientId.trim() ||
         !ctx.oauth2Secrets[n]?.clientSecret.trim(),
  );

  const needsS3   = [...ctx.sel].some(n => S3_APPS.includes(n.toLowerCase()));
  const s3Missing = needsS3 &&
    (!ctx.s3.id.trim() || !ctx.s3.key.trim() || !ctx.s3.url.trim());
  const bucketMissing = needsS3 && !NAME_RE.test(ctx.bucket.trim());

  /* ── regenerate all ---------------------------------------------------- */
  async function regenAll() {
    setBusy(true);
    const k = await fetch("/api/ssh-keygen").then(r => r.json());
    ctx.set({
      keys           : k,
      token          : rand(),
      pwds           : {
        argocd  : genPass(),
        keycloak: genPass(),
        rancher : genPass(),
        grafana : genPass(),
      },
      s3             : { id: "", key: "", url: "" },
      bucket         : "",
      oauth2Secrets  : makeOauth2Secrets(oauth2Apps),
    });
    setBusy(false);
  }

  /* ── tiny copy helper with toast -------------------------------------- */
  const toast = txt => { ctx.toast(txt); setTimeout(() => {}, toastMs); };

  /* ── UI pieces -------------------------------------------------------- */
  if (busy || !ctx.keys || !ctx.pwds) {
    return (
      <div style={{ textAlign:"center", padding:"2rem" }}>
        <Spinner size={40}/>
      </div>
    );
  }

  const pwdRow = key => (
    <div style={{ display:"flex", gap:".6rem", alignItems:"center" }}>
      <label style={{ minWidth:"7rem", textTransform:"capitalize" }}>
        {key} pw
      </label>
      <input
        className="wizard-input"
        type="text"
        value={ctx.pwds[key]}
        onChange={e => ctx.set({ pwds:{ ...ctx.pwds, [key]: e.target.value } })}
        style={{ flex:1 }}
      />
      <button className="tiny-btn" onClick={()=>{ copy(ctx.pwds[key]); toast("copied!"); }}>
        ⧉
      </button>
    </div>
  );

  return (
    <>
      <h2>Step 4 – Secrets & keys</h2>
      <p className="intro">Store these somewhere safe – you'll need them later.</p>

      {/* SSH keys */}
      <label>SSH public key</label>
      <div className="key-wrap">
        <pre className="key-block pub">{ctx.keys.publicKey}</pre>
        <button className="key-copy" onClick={()=>{ copy(ctx.keys.publicKey); toast("copied!"); }}>⧉</button>
      </div>

      <label style={{ marginTop:"1rem" }}>SSH private key</label>
      <div className="key-wrap">
        <pre className="key-block priv">{ctx.keys.privateKey}</pre>
        <button className="key-copy" onClick={()=>{ copy(ctx.keys.privateKey); toast("copied!"); }}>⧉</button>
      </div>

      {/* RKE2 token */}
      <label style={{ marginTop:"1rem" }}>Rancher join token</label>
      <div className="key-wrap">
        <pre className="key-block pub">{ctx.token}</pre>
        <button className="key-copy" onClick={()=>{ copy(ctx.token); toast("copied!"); }}>⧉</button>
      </div>

      {/* admin pwds */}
      <h3 style={{ marginTop:"1.6rem" }}>Admin passwords (editable)</h3>
      {["argocd","keycloak","rancher","grafana"].map(pwdRow)}

      {/* OAuth2 bundle */}
      {oauth2Apps.length > 0 && (
        <>
          <h3 style={{ marginTop:"2rem" }}>OAuth2 app secrets</h3>
          {oauth2Apps.map(name=>{
            const sec = ctx.oauth2Secrets[name]||{};
            const setField = (f,v)=>
              ctx.set({ oauth2Secrets:{ ...ctx.oauth2Secrets,
                        [name]:{ ...sec, [f]:v } }});
            return (
              <div key={name} style={{ border:"1px solid var(--border)",
                                        borderRadius:8, padding:"1rem",
                                        marginBottom:"1.3rem" }}>
                <strong>{name}</strong>
                <input className="wizard-input" placeholder="Client ID"
                       value={sec.clientId} style={{ marginTop:".6rem" }}
                       onChange={e=>setField("clientId",e.target.value)}/>
                <input className="wizard-input" placeholder="Client secret"
                       type="password" value={sec.clientSecret}
                       onChange={e=>setField("clientSecret",e.target.value)}/>
                <label>Cookie secret</label>
                <div className="key-wrap">
                  <pre className="key-block pub">{sec.cookieSecret}</pre>
                  <button className="key-copy" onClick={()=>{ copy(sec.cookieSecret); toast("copied!"); }}>⧉</button>
                </div>
                <label>Redis password</label>
                <div className="key-wrap">
                  <pre className="key-block pub">{sec.redisPassword}</pre>
                  <button className="key-copy" onClick={()=>{ copy(sec.redisPassword); toast("copied!"); }}>⧉</button>
                </div>
              </div>
            );
          })}
          {oauth2ClientMiss && (
            <p className="error">Fill in Client ID / secret for every OAuth2 app.</p>
          )}
        </>
      )}

      {/* S‑3 creds when Loki / Thanos / Tempo present */}
      {needsS3 && (
        <>
          <h3 style={{ marginTop:"2rem" }}>Object‑storage credentials</h3>
          <input className="wizard-input" placeholder="S3_ACCESS_KEY_ID"
                 value={ctx.s3.id}
                 onChange={e=>ctx.set({ s3:{ ...ctx.s3, id:e.target.value }})}/>
          <input className="wizard-input" placeholder="S3_SECRET_ACCESS_KEY"
                 type="password" value={ctx.s3.key}
                 onChange={e=>ctx.set({ s3:{ ...ctx.s3, key:e.target.value }})}/>
          <input className="wizard-input"
                 placeholder="S3_ENDPOINT  (e.g. s3.us-west-1.amazonaws.com)"
                 value={ctx.s3.url}
                 onChange={e=>ctx.set({ s3:{ ...ctx.s3, url:e.target.value }})}/>
          <input className="wizard-input"
                 placeholder="S3_BUCKET  (bucket name)"
                 value={ctx.bucket}
                 onChange={e=>ctx.set({ bucket:e.target.value.toLowerCase() })}/>
          {(s3Missing || bucketMissing) &&
            <p className="error">Please fill in all object‑storage fields.</p>}
        </>
      )}

      {/* actions */}
      <button className="btn-secondary" style={{ marginTop:"1rem" }}
              onClick={regenAll}>Regenerate all secrets</button>

      <div style={{ marginTop:"1.5rem" }}>
        <button className="btn-secondary" onClick={()=>setStep(step-1)}>← Back</button>
        <button className="btn"
                disabled={oauth2ClientMiss || s3Missing || bucketMissing}
                onClick={()=>setStep(step+1)}>Next →</button>
      </div>
    </>
  );
}
