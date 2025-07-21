import React, { useEffect, useState, useRef } from "react";
import Spinner from "../components/Spinner.jsx";
import { useInitState } from "../state/initState.jsx";

/* ── helpers ──────────────────────────────────────────────────── */
const wrapAnsible = (name, body) => `---
- hosts: all
  become: yes
  tasks:
    - name: Run ${name}
      shell: |
${body
  .split(/\r?\n/)
  .map(l => `        ${l}`)
  .join("\n")}`;

/* smart fetch – returns text, throws on HTTP ≠ 2xx */
async function fetchTxt(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/* ── component ───────────────────────────────────────────────── */
export default function Step7Scripts({ step, setStep }) {
  const ctx                   = useInitState();
  const [list, setList]       = useState([]);
  const [busy, setBusy]       = useState(true);
  const [cache, setCache]     = useState({});          // name → body
  const [view,  setView]      = useState(null);        // { name, body } | null
  const [err,   setErr]       = useState("");

  /* initial list ------------------------------------------------ */
  useEffect(() => {
    (async () => {
      try {
        const arr = await fetch("/api/scripts").then(r => r.json());
        setList(arr);
      } catch (e) {
        setErr(`Could not fetch scripts – ${e.message}`);
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  /* pull body (cache‑aware) ------------------------------------ */
  async function getBody(name) {
    if (cache[name]) return cache[name];
    const txt = await fetchTxt(`/scripts/${name}`);
    setCache(o => ({ ...o, [name]: txt }));
    return txt;
  }

  /* tiny actions ------------------------------------------------ */
  async function copy(name, asAnsible = false) {
    const body = await getBody(name);
    await navigator.clipboard.writeText(
      asAnsible ? wrapAnsible(name, body) : body,
    );
    ctx.toast("copied!");
  }
  async function download(name, asAnsible = false) {
    const body = await getBody(name);
    const blob = new Blob(
      [asAnsible ? wrapAnsible(name, body) : body],
      { type: "text/plain" },
    );
    const a = Object.assign(document.createElement("a"), {
      href     : URL.createObjectURL(blob),
      download : asAnsible ? `${name.replace(/\.sh$/, "")}.yml` : name,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function openView(name) {
    const body = await getBody(name);
    setView({ name, body });
  }

  /* view‑modal -------------------------------------------------- */
  function ViewModal() {
    const ref = useRef(null);
    useEffect(() => {
      if (!ref.current) return;
      ref.current.focus();                // enable quick copy with ⌘‑A ⌘‑C
    }, []);
    return (
      <div className="modal-overlay" onClick={() => setView(null)}>
        <div
          className="modal-dialog"
          style={{ width: "80vw", maxWidth: 1000 }}
          onClick={e => e.stopPropagation()}
        >
          <button className="modal-close" onClick={() => setView(null)}>
            ×
          </button>
          <h2 style={{ marginTop: 0 }}>{view.name}</h2>
          <pre
            ref={ref}
            tabIndex={0}
            className="code-block"
            style={{ maxHeight: "70vh", overflow: "auto" }}
          >
            {view.body}
          </pre>
          <div style={{ textAlign: "right", marginTop: "1rem" }}>
            <button className="btn" onClick={() => copy(view.name)}>
              Copy
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* render ------------------------------------------------------ */
  if (busy) {
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <Spinner size={40} />
      </div>
    );
  }
  if (err) return <p className="error">{err}</p>;

  return (
    <>
      {view && <ViewModal />}
      <h2>Step 7 – Helper scripts</h2>
      <p className="intro">
        Each script can be <strong>Viewed</strong>, <strong>Copied</strong> or{" "}
        <strong>Downloaded</strong>. The *Ansible* buttons wrap the Bash script
        in a minimal playbook so you can automate installs with{" "}
        <code>ansible-playbook</code>.
      </p>

      <table className="scripts-table">
        <thead>
          <tr>
            <th style={{ width: "38%" }}>Script</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.map(name => (
            <tr key={name}>
              <td>{name}</td>
              <td>
                <button className="tiny-btn" onClick={() => openView(name)}>
                  View
                </button>
                <button className="tiny-btn" onClick={() => copy(name)}>
                  Copy
                </button>
                <button className="tiny-btn" onClick={() => download(name)}>
                  Download
                </button>
                <button className="tiny-btn" onClick={() => copy(name, true)}>
                  Copy&nbsp;Ansible
                </button>
                <button className="tiny-btn" onClick={() => download(name, true)}>
                  Download&nbsp;Ansible
                </button>
              </td>
            </tr>
          ))}
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
