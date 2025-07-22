import React from "react";

/**
 * Light‑weight modal that displays Helm‑chart meta pulled from the
 * backend: icon, description, maintainers, home URL and the first
 * 30 non‑empty lines of the chart’s README.
 */
export default function AppInfo({ app, onClose }) {
  if (!app) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        style={{ width: "60vw", maxWidth: 800 }}
        onClick={e => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="close">
          ×
        </button>

        {/* header – icon + name */}
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {app.icon && (
            <img
              src={app.icon}
              alt=""
              style={{
                width: 48,
                height: 48,
                borderRadius: 6,
                background: "#fff",
                objectFit: "contain",
              }}
            />
          )}
          <h2 style={{ margin: 0 }}>{app.name}</h2>
        </div>

        {/* description / meta ------------------------------------------------ */}
        {app.desc && (
          <p
            style={{
              margin: "1rem 0 .6rem",
              fontSize: ".95rem",
              color: "var(--text-light)",
            }}
          >
            {app.desc}
          </p>
        )}

        {(app.maint || app.home) && (
          <p style={{ margin: ".3rem 0 1rem", fontSize: ".85rem" }}>
            {app.maint && (
              <>
                <strong>Maintainers:</strong> {app.maint}
                {app.home ? " · " : ""}
              </>
            )}
            {app.home && (
              <>
                <strong>Home:</strong>{" "}
                <a href={app.home} target="_blank" rel="noopener noreferrer">
                  {app.home}
                </a>
              </>
            )}
          </p>
        )}

        {/* README (first 30 lines) ------------------------------------------ */}
        {app.readme && (
          <>
            <h3 style={{ margin: "1.2rem 0 .5rem" }}>README</h3>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "#f5f7f9",
                border: "1px solid var(--border)",
                padding: ".8rem 1rem",
                borderRadius: 6,
                maxHeight: "50vh",
                overflow: "auto",
                fontSize: ".85rem",
              }}
            >
              {app.readme}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
