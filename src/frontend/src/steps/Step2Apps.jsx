import React, { useEffect, useState, useMemo } from "react";
import Spinner     from "../components/Spinner.jsx";
import AppDetails  from "../components/AppDetails.jsx";
import { useInitState } from "../state/initState.jsx";

/* helper – groups flat [{name,namespace,…}] into ns → [apps] */
const byNs = list =>
  list.reduce((m, a) => { (m[a.namespace] ??= []).push(a); return m; }, {});

export default function Step2Apps({ step, setStep }) {
  const ctx               = useInitState();
  const [busy,    setBusy]   = useState(true);
  const [inspect, setInspect]= useState(null);     // ← currently opened modal

  /* fetch once -------------------------------------------------------- */
  useEffect(() => {
    (async () => {
      setBusy(true);
      try {
        /* each item: { name, namespace, icon, desc, readme, __file }  */
        const list = await fetch("/api/apps").then(r => r.json());
        ctx.set({
          apps : list,
          sel  : new Set(ctx.sel),    // keep any previous selection
          open : new Set(ctx.open),
        });
      } finally { setBusy(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* derived – grouped by namespace ----------------------------------- */
  const grouped = useMemo(() => byNs(ctx.apps), [ctx.apps]);
  const allSelected = ctx.apps.length && ctx.sel.size === ctx.apps.length;

  /* selection helpers ------------------------------------------------ */
  const toggleApp = name => {
    const next = new Set(ctx.sel);
    next.has(name) ? next.delete(name) : next.add(name);
    ctx.set({ sel: next });
  };
  const toggleNs  = ns => {
    const nsApps = grouped[ns].map(a => a.name);
    const every  = nsApps.every(n => ctx.sel.has(n));
    const next   = new Set(ctx.sel);
    nsApps.forEach(n => (every ? next.delete(n) : next.add(n)));
    ctx.set({ sel: next });
  };

  /* ------------------------------------------------------------------ */
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
        repository before the ZIP is built. Click ℹ️ for chart details.
      </p>

      {/* mass actions -------------------------------------------------- */}
      <div className="apps-actions">
        <button
          className="btn-secondary"
          onClick={() =>
            ctx.set({
              sel: new Set(allSelected ? [] : ctx.apps.map(a => a.name)),
            })}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
        <span style={{ alignSelf: "center", fontSize: ".9rem", color: "var(--text-light)" }}>
          {ctx.sel.size} / {ctx.apps.length} selected
        </span>
      </div>

      {/* namespace groups --------------------------------------------- */}
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
              <span className="apps-ns-count">{picked} / {list.length}</span>
            </h3>

            <ul className="apps-list">
              {list.map(app => (
                <li
                  key={app.name}
                  className="app-item"
                  data-selected={ctx.sel.has(app.name)}
                  onClick={() => toggleApp(app.name)}
                >
                  {app.icon
                    ? <img src={app.icon} alt="" />
                    : <span className="fallback-ico">📦</span>}
                  <span className="app-name">{app.name}</span>

                  {/* ℹ️ button – info modal */}
                  <button
                    className="info-btn"
                    title="Details"
                    disabled={!app.readme && !app.desc}
                    onClick={e => { e.stopPropagation(); setInspect(app); }}
                  >
                    ℹ️
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {/* nav buttons --------------------------------------------------- */}
      <div style={{ marginTop: "1.6rem" }}>
        <button
          className="btn"
          onClick={() => setStep(step + 1)}
          disabled={ctx.sel.size === 0}
        >
          Next →
        </button>
      </div>

      {/* details modal ------------------------------------------------- */}
      {inspect && (
        <AppDetails
          project={inspect.namespace}
          file={inspect.__file /* provided by backend */}
          app={inspect}
          onClose={() => setInspect(null)}
        />
      )}
    </>
  );
}
