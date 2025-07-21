import React, { useEffect, useState, useMemo } from "react";
import Spinner from "../components/Spinner.jsx";
import { useInitState } from "../state/initState.js";

/* helper – groups flat [{name,namespace,…}] into ns → [apps] -------- */
function byNs(list = []) {
  return list.reduce((m, a) => {
    (m[a.namespace] ??= []).push(a);
    return m;
  }, {});
}

export default function Step2Apps({ step, setStep }) {
  const ctx = useInitState();
  const [busy, setBusy] = useState(true);

  /* fetch once ------------------------------------------------------ */
  useEffect(() => {
    (async () => {
      setBusy(true);
      try {
        const list = await fetch("/api/apps").then(r => r.json());
        ctx.set({
          apps: list,
          /* keep selection when user goes back / forth */
          sel: new Set(ctx.sel), open: new Set(ctx.open),
        });
      } finally {
        setBusy(false);
      }
    })();
    // eslint‑disable‑next‑line react‑hooks/exhaustive‑deps
  }, []);

  /* derived – grouped by namespace ---------------------------------- */
  const grouped = useMemo(() => byNs(ctx.apps), [ctx.apps]);

  /* helpers --------------------------------------------------------- */
  function toggleApp(appName) {
    const nxt = new Set(ctx.sel);
    nxt.has(appName) ? nxt.delete(appName) : nxt.add(appName);
    ctx.set({ sel: nxt });
  }
  function toggleNs(ns) {
    const nsApps = grouped[ns].map(a => a.name);
    const every  = nsApps.every(n => ctx.sel.has(n));
    const nxt = new Set(ctx.sel);
    nsApps.forEach(n => (every ? nxt.delete(n) : nxt.add(n)));
    ctx.set({ sel: nxt });
  }
  const allSelected = ctx.apps.length && ctx.sel.size === ctx.apps.length;

  /* ----------------------------------------------------------------- */
  if (busy) {
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <Spinner size={48} />
      </div>
    );
  }

  return (
    <>
      <h2>Step 2 – Pick Applications</h2>
      <p className="intro">
        Tick the Helm apps you want. Everything else will be stripped from the
        repository before the ZIP is built.
      </p>

      {/* mass‑actions ------------------------------------------------- */}
      <div className="apps-actions">
        <button
          className="btn-secondary"
          onClick={() =>
            ctx.set({ sel: new Set(allSelected ? [] : ctx.apps.map(a => a.name)) })
          }
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
        <span style={{ alignSelf: "center", fontSize: ".9rem", color: "var(--text-light)" }}>
          {ctx.sel.size} / {ctx.apps.length} selected
        </span>
      </div>

      {/* namespace groups -------------------------------------------- */}
      {Object.entries(grouped).map(([ns, list]) => {
        const picked = list.filter(a => ctx.sel.has(a.name)).length;
        return (
          <section
            key={ns}
            className="apps-ns-group"
            data-selected={picked && picked === list.length}
          >
            <h3 onClick={() => toggleNs(ns)} style={{ cursor: "pointer" }}>
              {ns}
              <span className="apps-ns-count">
                {picked} / {list.length}
              </span>
            </h3>

            <ul className="apps-list">
              {list.map(app => (
                <li
                  key={app.name}
                  className="app-item"
                  data-selected={ctx.sel.has(app.name)}
                  onClick={() => toggleApp(app.name)}
                >
                  {app.icon ? (
                    <img src={app.icon} alt="" />
                  ) : (
                    <span className="fallback-ico">📦</span>
                  )}
                  <span className="app-name">{app.name}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {/* nav buttons -------------------------------------------------- */}
      <div style={{ marginTop: "1.6rem" }}>
        <button
          className="btn"
          onClick={() => setStep(step + 1)}
          disabled={ctx.sel.size === 0}
        >
          Next →
        </button>
      </div>
    </>
  );
}
