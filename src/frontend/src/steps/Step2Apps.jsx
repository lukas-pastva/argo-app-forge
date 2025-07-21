import React, { useEffect, useState, useMemo } from "react";
import Spinner  from "../components/Spinner.jsx";
import AppInfo  from "../components/AppInfo.jsx";      // 👈 new lightweight modal
import { useInitState } from "../state/initState.jsx";

/* helper – group [{ name, namespace, … }] into ns → [apps] */
const groupByNs = arr =>
  arr.reduce((m, a) => { (m[a.namespace] ??= []).push(a); return m; }, {});

export default function Step2Apps({ step, setStep }) {
  const ctx                = useInitState();
  const [busy, setBusy]    = useState(true);
  const [info, setInfo]    = useState(null);    // ← chart‑info currently open

  /* fetch once ----------------------------------------------------- */
  useEffect(() => {
    (async () => {
      setBusy(true);
      try {
        const apps = await fetch("/api/apps").then(r => r.json());
        ctx.set({
          apps,
          sel : new Set(ctx.sel),    // keep any prior choices
          open: new Set(ctx.open),
        });
      } finally { setBusy(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* derived -------------------------------------------------------- */
  const grouped     = useMemo(() => groupByNs(ctx.apps), [ctx.apps]);
  const allSelected = ctx.apps.length && ctx.sel.size === ctx.apps.length;

  /* selection helpers --------------------------------------------- */
  const toggleApp = name => {
    const next = new Set(ctx.sel);
    next.has(name) ? next.delete(name) : next.add(name);
    ctx.set({ sel: next });
  };
  const toggleNs = ns => {
    const nsApps = grouped[ns].map(a => a.name);
    const every  = nsApps.every(n => ctx.sel.has(n));
    const next   = new Set(ctx.sel);
    nsApps.forEach(n => (every ? next.delete(n) : next.add(n)));
    ctx.set({ sel: next });
  };

  /* --------------------------------------------------------------- */
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
        Tick the Helm apps you need. Click ℹ️ to see chart description,
        maintainers and a README snippet.
      </p>

      {/* mass‑actions ------------------------------------------------- */}
      <div className="apps-actions">
        <button
          className="btn-secondary"
          onClick={() =>
            ctx.set({
              sel: new Set(
                allSelected ? [] : ctx.apps.map(a => a.name),
              ),
            })}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
        <span
          style={{
            alignSelf: "center",
            fontSize: ".9rem",
            color: "var(--text-light)",
          }}
        >
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
                  {/* icon / fallback 📦 */}
                  {app.icon
                    ? <img src={app.icon} alt="" />
                    : <span className="fallback-ico">📦</span>}

                  <span className="app-name">{app.name}</span>

                  {/* ℹ️ – open info modal */}
                  <button
                    className="info-btn"
                    title="Details"
                    disabled={!app.desc && !app.readme}
                    onClick={e => { e.stopPropagation(); setInfo(app); }}
                  >
                    ℹ️
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {/* navigation --------------------------------------------------- */}
      <div style={{ marginTop: "1.6rem" }}>
        <button
          className="btn"
          onClick={() => setStep(step + 1)}
          disabled={ctx.sel.size === 0}
        >
          Next →
        </button>
      </div>

      {/* info modal --------------------------------------------------- */}
      {info && <AppInfo app={info} onClose={() => setInfo(null)} />}
    </>
  );
}
