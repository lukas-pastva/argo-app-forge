import React from "react";
import { DOMAIN_RE, REPO_RE } from "../utils/regex.js";
import { useInitState } from "../state/initState.jsx";
export default function Step1Details({ setStep }) {
  const ctx = useInitState();
  const domainOK = DOMAIN_RE.test(ctx.domain.trim());
  const repoOK   = REPO_RE.test(ctx.repo.trim());
  return (
    <>
      <h2>Step 1 – Project details</h2>
      <p className="intro">Main domain & Git repo.</p>
      <label>Main domain</label>
      <input
        className="wizard-input"
        value={ctx.domain}
        onChange={(e) => ctx.set({ domain: e.target.value.toLowerCase() })}
        placeholder="example.com"
      />
      {!domainOK && <p className="error">Enter a valid domain.</p>}
      <label style={{ marginTop: ".8rem" }}>Git repo (SSH)</label>
      <input
        className="wizard-input"
        value={ctx.repo}
        onChange={(e) => ctx.set({ repo: e.target.value })}
        placeholder="git@host:group/repo.git"
      />
      {!repoOK && <p className="error">Enter a valid SSH repository URL.</p>}
      <button
        className="btn"
        disabled={!(domainOK && repoOK)}
        onClick={() => setStep(2)}
      >
        Next →
      </button>
    </>
  );
}