/*  src/backend/src/zip.js
    ───────────────────────────────────────────────────────────────
    Clone → filter selected Applications → keep only referenced
    charts → optional token-replace → stream back a ZIP.
*/

import fs       from "fs/promises";
import path     from "node:path";
import yaml     from "js-yaml";
import fg       from "fast-glob";
import Archiver from "archiver";
import { ensureRepo } from "./git.js";
import cfg      from "./config.js";

/* ───────────────────────────────────────────────────────────────
   helpers
   ───────────────────────────────────────────────────────────── */
const commonIcons = ["icon.png", "icon.jpg", "icon.svg", "logo.png"];

/* Extract icon, description, maintainers from a chart (repo charts only) */
async function chartMeta(root, app) {
  if (!app.path) return { icon: null, desc: "", maint: "" }; // remote chart
  const chartDir = path.join(root, app.path);
  try {
    const chartYaml = yaml.load(
      await fs.readFile(path.join(chartDir, "Chart.yaml"), "utf8")
    ) || {};

    /* icon ----------------------------------------------------- */
    let iconRef = chartYaml.icon || "";
    if (!iconRef) {
      for (const f of commonIcons) {
        try { await fs.access(path.join(chartDir, f)); iconRef = f; break; }
        catch { /* ignore */ }
      }
    }
    let icon = null;
    if (/^https?:\/\//.test(iconRef)) {
      icon = iconRef; // remote URL
    } else if (iconRef) {
      try {
        const buf = await fs.readFile(path.join(chartDir, iconRef));
        const ext = path.extname(iconRef).toLowerCase();
        const mime =
          ext === ".svg"  ? "image/svg+xml" :
          ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
          "image/png";
        icon = `data:${mime};base64,${buf.toString("base64")}`;
      } catch { /* ignore */ }
    }

    /* description & maintainers -------------------------------- */
    const desc  = chartYaml.description || "";
    const maint = (chartYaml.maintainers || [])
      .map(m => (m.name || m).trim())
      .filter(Boolean)
      .join(", ");

    return { icon, desc, maint };
  } catch {
    return { icon: null, desc: "", maint: "" };
  }
}

/* find every “app-of-apps” YAML matching APPS_GLOB */
async function findAppFiles(root) {
  const files = await fg(cfg.appsGlob, { cwd: root, absolute: true });
  if (!files.length) {
    throw new Error(`No file matched APPS_GLOB="${cfg.appsGlob}" in ${root}`);
  }
  return files;
}

/* ───────────────────────────────────────────────────────────────
   1) Flatten Applications  (+ icon / desc / maintainers)
   ───────────────────────────────────────────────────────────── */
export async function listApps() {
  const root  = await ensureRepo();
  const files = await findAppFiles(root);
  const out   = [];

  for (const file of files) {
    const doc = yaml.load(await fs.readFile(file, "utf8")) || {};
    for (const proj of doc.appProjects || []) {
      for (const app of proj.applications || []) {
        const meta = await chartMeta(root, app);
        out.push({
          name : app.name,
          icon : meta.icon,
          desc : meta.desc,
          maint: meta.maint
        });
      }
    }
  }

  /* de-dupe by name (first hit wins) */
  const seen = new Map();
  for (const a of out) if (!seen.has(a.name)) seen.set(a.name, a);
  return [...seen.values()];
}

/* ───────────────────────────────────────────────────────────────
   2) Build filtered ZIP
   ───────────────────────────────────────────────────────────── */
export async function buildZip(keepNames, tokenOutput = cfg.nameDefault) {
  const root = await ensureRepo();

  /* —— Figure out which chart dirs we must keep ———————— */
  const neededCharts = new Set(); // repo-relative paths
  const appFilesRoot = await findAppFiles(root);

  for (const file of appFilesRoot) {
    const doc = yaml.load(await fs.readFile(file, "utf8")) || {};
    for (const proj of doc.appProjects || []) {
      for (const app of proj.applications || []) {
        if (keepNames.includes(app.name) && app.path) {
          neededCharts.add(app.path.replace(/^\.?\/*/, "")); // normalise
        }
      }
    }
  }

  /* —— Prepare working copy ——————————————— */
  const tmp = path.join(process.cwd(), "tmp-filtered");
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.cp(root, tmp, { recursive: true });

  /* —— Trim Application blocks + values/  ——————— */
  const appFiles = await findAppFiles(tmp);
  await Promise.all(appFiles.map(async (aoa) => {
    const doc = yaml.load(await fs.readFile(aoa, "utf8")) || {};
    doc.appProjects = (doc.appProjects || [])
      .map(proj => {
        proj.applications = (proj.applications || [])
          .filter(app => keepNames.includes(app.name));
        return proj;
      })
      .filter(proj => proj.applications.length);
    await fs.writeFile(aoa, yaml.dump(doc));
  }));

  /* —— Delete unused values/*.yaml  ——————————— */
  const valFiles = await fg("values/*.yaml", { cwd: tmp });
  await Promise.all(valFiles.map(async (rel) => {
    const base = path.basename(rel, ".yaml");
    if (!keepNames.includes(base)) await fs.rm(path.join(tmp, rel));
  }));

  /* —— Delete unreferenced charts/external/** ————— */
  const allChartVers = await fg(
    ["charts/external/*/*/*", "external/*/*/*"],
    { cwd: tmp, onlyDirectories: true }
  );
  await Promise.all(allChartVers.map(async (rel) => {
    if (!neededCharts.has(rel)) {
      await fs.rm(path.join(tmp, rel), { recursive: true, force: true });
    }
  }));

  /* —— Token replacement  ——————————————— */
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

  /* —— Zip & stream  ——————————————————— */
  const arch = Archiver("zip", { zlib: { level: 9 } });
  arch.on("warning", console.warn);
  arch.on("error", err => { throw err; });
  arch.directory(tmp, false);
  arch.finalize();
  return arch;
}
