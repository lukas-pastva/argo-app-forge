import React, { useState, useEffect } from "react";
import Spinner from "../components/Spinner.jsx";
import { useInitState } from "../state/initState.jsx";

/**
 * Step 3 – tailors the GitOps repo, streams a ZIP, auto‑downloads it
 * and then advances to the next wizard step without user interaction.
 */
export default function Step3Zip({ step, setStep }) {
  const ctx           = useInitState();
  const [busy, setBusy] = useState(false);
  const [err,  setErr ] = useState("");

  /* ------------------------------------------------------------------ */
  async function build() {
    setBusy(true);
    setErr("");

    try {
      const res = await fetch("/api/build", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          selected: [...ctx.sel],   // the apps chosen in Step 2
          repo   : ctx.repo,
          domain : ctx.domain,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      /* stream → blob → ObjectURL → hidden <a> click */
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");

      a.href      = url;
      a.download  = `${ctx.domain || "argo-init"}.zip`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      /* revoke the ObjectURL a bit later */
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      ctx.toast("ZIP ready – downloading…");
      setStep(step + 1);                 // jump to Step 4
    } catch (e) {
      console.error(e);
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  /* kick off the build once – when the component mounts */
  useEffect(() => { build(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  /* ------------------------------------------------------------------ */
  return (
    <>
      <h2>Step 3 – Build ZIP & push</h2>
      <p className="intro">
        Sit tight – we’re tailoring the repo, downloading the ZIP and will
        advance automatically when it’s done.
      </p>

      {busy && <Spinner size={48} />}
      {err  && <p className="error" style={{ marginTop: "1rem" }}>{err}</p>}
    </>
  );
}
