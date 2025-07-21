import React from "react";
import { useInitState } from "../state/initState.js";

export default function Step6SSH({ step, setStep }) {
  const ctx = useInitState();
  const cmd = `ssh -i ./id_rsa ubuntu@<VM‑IP>`;

  return (
    <>
      <h2>Step 6 – SSH to your nodes</h2>
      <p className="intro">
        Copy the private key to your workstation, then log in to every server
        that will run RKE2.
      </p>

      <pre className="code-block">{cmd}</pre>

      <p style={{ marginTop: "1rem" }}>
        Once connected, proceed to the next step and run the installer scripts.
      </p>

      <button className="btn" onClick={() => setStep(step + 1)}>
        Next →
      </button>
    </>
  );
}
