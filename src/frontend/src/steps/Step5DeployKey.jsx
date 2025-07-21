import React from "react";
import { useInitState } from "../state/initState.js";

export default function Step5DeployKey({ step, setStep }) {
  const ctx = useInitState();

  const copy = () => {
    navigator.clipboard.writeText(ctx.keys.publicKey);
    ctx.toast("copied!");
  };

  return (
    <>
      <h2>Step 5 – Add deploy key</h2>
      <p className="intro">
        Go to your Git hosting platform and add the following SSH public key as
        a **read‑only deploy key** (write access is <em>not</em> required).
      </p>

      <div className="key-wrap">
        <pre className="key-block pub">{ctx.keys.publicKey}</pre>
        <button className="btn-copy" onClick={copy}>
          ⧉
        </button>
      </div>

      <button className="btn" onClick={() => setStep(step + 1)}>
        Next →
      </button>
    </>
  );
}
