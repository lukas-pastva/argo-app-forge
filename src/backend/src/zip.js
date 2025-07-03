/*  src/backend/src/zip.js
    ───────────────────────────────────────────────────────────────
    Clone → filter selected Applications → optional token-replace
    → package every­thing under <name>/ into a ZIP streamed back
    to the client.
*/

import fs       from "fs/promises";
import path     from "node:path";
import yaml     from "js-yaml";
import fg       from "fast-glob";
import Archiver from "archiver";
import { ensureRepo } from "./git.js";
import cfg      from "./config.js";

/* helper – list every file that matches APPS_GLOB */
async function findAppFiles(root) {
  const files = await fg(cfg.appsGlob, { cwd: root, absolute: true });
  if (!files.length) {
    throw new Error(`No file matched APPS_GLOB="${cfg.appsGlob}" in ${root}`);
  }
  return files;
}

/* helper – pull icon + description from Chart.yaml or fallbacks */
async function chartMeta(root, app) {
  if (!app.path) return { icon: null, desc: "" };   // remote chart
  const chartDir = path.join(root, app.path);

  try {
    const chartYaml = yaml.load(
      await fs.readFile(path.join(chartDir, "Chart.yaml"), "utf8"),
    ) || {};

    /* ─ icon ─────────────────────────────────────────────── */
    let iconRef = chartYaml.icon || "";
    if (!iconRef) {
      for (const f of ["icon.png", "icon.jpg", "icon.svg", "logo.png"]) {
        try { await fs.access(path.join(chartDir, f)); iconRef = f; break; } catch {}
      }
    }
    let icon = null;
    if (iconRef) {
      if (/^https?:\/\//.test(iconRef)) {
        icon = iconRef;
      } else {
        const abs  = path.join(chartDir, iconRef);
        const buf  = await fs.readFile(abs);
        const ext  = path.extname(iconRef).toLowerCase();
        const mime = ext === ".svg" ? "image/svg+xml"
                  : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
                  : "image/png";
        icon = `data:${mime};base64,${buf.toString("base64")}`;
      }
    }

    /* ─ description ──────────────────────────────────────── */
    const desc = chartYaml.description || "";

    return { icon, desc };
  } catch {
    return { icon: null, desc: "" };
  }
}

/* ───────────────────────────────────────────────────────────────
   1) Flatten Application list (icon + description)
   ───────────────────────────────────────────────────────────── */
export async function listApps() {
  const root  = await ensureRepo();
  const files = await findAppFiles(root);
  const flat  = [];

  for (const file of files) {
    const doc = yaml.load(await fs.readFile(file, "utf8")) || {};
    for (const proj of doc.appProjects || []) {
      for (const app of proj.applications || []) {
        const meta = await chartMeta(root, app);
        flat.push({ name: app.name, ...meta });
      }
    }
  }

  /* de-duplicate by name (icon/desc from first occurrence wins) */
  const uniq = new Map();
  for (const { name, icon, desc } of flat) {
    if (!uniq.has(name)) uniq.set(name, { icon, desc });
  }
  return [...uniq.entries()].map(([name, m]) => ({ name, icon: m.icon, desc: m.desc }));
}

/* ───────────────────────────────────────────────────────────────
   2) Build filtered ZIP (packaged under <name>/)
   ───────────────────────────────────────────────────────────── */
export async function buildZip(keepNames, tokenOutput = cfg.nameDefault) {
  const root = await ensureRepo();

  /* working copy ------------------------------------------------ */
  const tmp = path.join(process.cwd(), "tmp-filtered");
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.cp(root, tmp, { recursive: true });

  /* 2a) Trim Application blocks -------------------------------- */
  const appFiles = await findAppFiles(tmp);
  await Promise.all(appFiles.map(async (f) => {
    const doc = yaml.load(await fs.readFile(f, "utf8")) || {};
    doc.appProjects = (doc.appProjects || [])
      .map(p => {
        p.applications = (p.applications || [])
          .filter(a => keepNames.includes(a.name));
        return p;
      })
      .filter(p => p.applications.length);
    await fs.writeFile(f, yaml.dump(doc));
  }));

  /* 2b) Delete unused values/*.yaml ----------------------------- */
  const valFiles = await fg("values/*.yaml", { cwd: tmp });
  await Promise.all(valFiles.map(async (rel) => {
    const base = path.basename(rel, ".yaml");
    if (!keepNames.includes(base)) await fs.rm(path.join(tmp, rel));
  }));

  /* 2c) Token replacement -------------------------------------- */
  if (cfg.tokenInput && tokenOutput) {
    const everyFile = await fg(["**/*", "!**/.git/**"], { cwd: tmp, dot: true });
    await Promise.all(everyFile.map(async (rel) => {
      const p = path.join(tmp, rel);
      if ((await fs.stat(p)).isDirectory()) return;
      const txt = await fs.readFile(p, "utf8");
      if (txt.includes(cfg.tokenInput)) {
        await fs.writeFile(p, txt.replaceAll(cfg.tokenInput, tokenOutput));
      }
    }));
  }

  /* 2d) Zip & return stream  (everything under <name>/) -------- */
  const arch = Archiver("zip", { zlib: { level: 9 } });
  arch.on("warning", console.warn);
  arch.on("error", err => { throw err; });
  arch.directory(tmp, tokenOutput || "bundle");   // <-- top-level folder
  arch.finalize();
  return arch;
}
