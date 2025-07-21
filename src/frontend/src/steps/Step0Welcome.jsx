import React from "react";
import { stepsMeta } from "../state/initState.js";
export default function Step0Welcome({ setStep }) {
  return (
    <>
      <h2>Welcome to Argo Init 🚀</h2>
      <p className="intro">{stepsMeta[0].desc}</p>
      <ol style={{ margin: "1rem 0 1.5rem 1.2rem" }}>
        {stepsMeta.slice(1).map((s, i) => (
          <li key={i}>{s.label} – {s.desc}</li>
        ))}
      </ol>
      <button className="btn" onClick={() => setStep(1)}>Start →</button>
    </>
  );
}