import React, { useState } from "react";
import Spinner from "../components/Spinner.jsx";
import { useInitState } from "../state/initState.js";

export default function Step3Zip({ step, setStep }) {
  const ctx = useInitState();
  const [busy, setBusy]   = useState(false);
  const [link, setLink]   = useState(null);
  const [err,  setErr]    = useState("");

  async function build() {
    setBusy(true);
    setErr("");
    try {
      const res  = await fetch("/api/build", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          selected: [...ctx.sel],
          repo   : ctx.repo,
          domain : ctx.domain,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      setLink(URL.createObjectURL(blob));
      ctx.toast("ZIP ready!");
    } catch (e) {
      console.error(e);
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Step 3 – Build ZIP & push</h2>
      <p className="intro">
        Click *Build ZIP* to tailor the repository to your selection. Download
        it, then push the contents to the Git repo you entered in Step 1.
      </p>

      {busy ? (
        <Spinner size={48} />
      ) : link ? (
        <>
          <a
            className="btn"
            href={link}
            download={`${ctx.domain || "argo-init"}.zip`}
            onClick={() => setLink(null)}
          >
            ⬇ Download ZIP
          </a>
          <p style={{ marginTop: "1.4rem", fontSize: ".9rem" }}>
            After downloading, unpack the archive, inspect the files if you
            wish, <strong>git&nbsp;add&nbsp;· git&nbsp;commit&nbsp;· git&nbsp;push</strong>{" "}
            the result to <code>{ctx.repo}</code>.
          </p>
          <button
            className="btn-secondary"
            style={{ marginTop: "2rem" }}
            onClick={() => setStep(step + 1)}
          >
            Next →
          </button>
        </>
      ) : (
        <>
          <button className="btn" onClick={build}>
            Build ZIP
          </button>
          {err && <p className="error" style={{ marginTop: ".9rem" }}>{err}</p>}
        </>
      )}
    </>
  );
}
