import React, { useEffect, useState } from "react";
import Spinner from "../components/Spinner.jsx";
import { useInitState } from "../state/initState.jsx";

/* tiny helper that wraps a Bash script inside an Ansible playbook */
const wrapAnsible = (name, body) => `---
- hosts: all
  become: yes
  tasks:
    - name: Run ${name}
      shell: |
${body
  .split(/\r?\n/)
  .map(l => `        ${l}`)
  .join("\n")}
`;

export default function Step7Scripts({ step, setStep }) {
  const ctx = useInitState();
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(true);
  const [cache, setCache] = useState({}); // name → script text

  useEffect(() => {
    (async () => {
      setBusy(true);
      const arr = await fetch("/api/scripts").then(r => r.json());
      setList(arr);
      setBusy(false);
    })();
  }, []);

  /* helpers --------------------------------------------------------- */
  async function getScript(name) {
    if (cache[name]) return cache[name];
    const txt = await fetch(`/scripts/${name}`).then(r => r.text());
    setCache(o => ({ ...o, [name]: txt }));
    return txt;
  }

  async function copy(name, asAnsible = false) {
    const txt = await getScript(name);
    await navigator.clipboard.writeText(asAnsible ? wrapAnsible(name, txt) : txt);
    ctx.toast("copied!");
  }

  async function download(name, asAnsible = false) {
    const txt = await getScript(name);
    const blob = new Blob([asAnsible ? wrapAnsible(name, txt) : txt], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = asAnsible ? `${name.replace(/\.sh$/,"")}.yml` : name;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ----------------------------------------------------------------- */
  if (busy) {
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <Spinner size={40} />
      </div>
    );
  }

  return (
    <>
      <h2>Step 7 – Helper scripts</h2>
      <p className="intro">
        Each script can be <strong>Copied</strong> to your clipboard or{" "}
        <strong>Downloaded</strong> to a file. The extra *Ansible* buttons wrap
        the same Bash script inside a minimal playbook so you can automate the
        install via <code>ansible-playbook</code>.
      </p>

      <table className="scripts-table">
        <thead>
          <tr>
            <th style={{ width: "40%" }}>Script</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.map(name => (
            <tr key={name}>
              <td>{name}</td>
              <td>
                <button className="tiny-btn" onClick={() => copy(name)}>
                  Copy
                </button>
                <button className="tiny-btn" onClick={() => download(name)}>
                  Download
                </button>
                <button className="tiny-btn" onClick={() => copy(name, true)}>
                  Copy Ansible
                </button>
                <button className="tiny-btn" onClick={() => download(name, true)}>
                  Download Ansible
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button className="btn" style={{ marginTop: "1.6rem" }} onClick={() => setStep(step + 1)}>
        Next →
      </button>
    </>
  );
}
