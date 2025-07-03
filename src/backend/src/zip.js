/*  src/backend/src/zip.js
    ───────────────────────────────────────────────────────────────
    Clone → filter selected Applications → optional token-replace
    → stream back a ZIP.
*/

import fs       from "fs/promises";
import path     from "node:path";
import yaml     from "js-yaml";
import fg       from "fast-glob";
import Archiver from "archiver";
import { ensureRepo } from "./git.js";
import cfg      from "./config.js";

/* helper – find every “app-of-apps” file that matches APPS_GLOB */
async function findAppFiles(root) {
  const files = await fg(cfg.appsGlob, { cwd: root, absolute: true });
  if (!files.length) {
    throw new Error(`No file matched APPS_GLOB="${cfg.appsGlob}" in ${root}`);
  }
  return files;
}

/* helper – best-effort icon extractor (repo charts only) */
async function chartIcon(root, app) {
  if (!app.path) return null;                         // remote chart
  const chartDir = path.join(root, app.path);
  try {
    const chartYaml = yaml.load(
      await fs.readFile(path.join(chartDir, "Chart.yaml"), "utf8")
    ) || {};
    let iconRef = chartYaml.icon || "";
    /* remote URL? just return it */
    if (/^https?:\/\//.test(iconRef)) return iconRef;

    /* local file? */
    if (!iconRef) {
      /* common fallbacks */
      for (const f of ["icon.png", "icon.jpg", "icon.svg", "logo.png"]) {
        try {
          await fs.access(path.join(chartDir, f));
          iconRef = f;
          break;
        } catch { /* empty */ }
      }
    }
    if (!iconRef) return null;

    const abs = path.join(chartDir, iconRef);
    const buf = await fs.readFile(abs);
    const ext = path.extname(iconRef).toLowerCase();
    const mime =
      ext === ".svg"  ? "image/svg+xml" :
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
      ".png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/* ───────────────────────────────────────────────────────────────
   1) Flatten Applications and attach icons
   ───────────────────────────────────────────────────────────── */
export async function listApps() {
  const root   = await ensureRepo();
  const files  = await findAppFiles(root);
  const out    = [];

  for (const file of files) {
    const doc = yaml.load(await fs.readFile(file, "utf8")) || {};
    (doc.appProjects || []).forEach((proj) =>
      (proj.applications || []).forEach((app) =>
        out.push({
          name : app.name,
          icon : await chartIcon(root, app)        // may be null
        })
      )
    );
  }
  /* de-dupe by name (icon from first hit wins) */
  const seen = new Map();
  for (const { name, icon } of out) if (!seen.has(name)) seen.set(name, icon);
  return [...seen.entries()].map(([name, icon]) => ({ name, icon }));
}

/* ───────────────────────────────────────────────────────────────
   2) Build filtered ZIP
   ───────────────────────────────────────────────────────────── */
export async function buildZip(keepNames, tokenOutput = cfg.nameDefault) {
  const root = await ensureRepo();

  /* working copy ------------------------------------------------ */
  const tmp = path.join(process.cwd(), "tmp-filtered");
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.cp(root, tmp, { recursive: true });

  /* 2a) Trim Application blocks in every matching file ---------- */
  const appFiles = await findAppFiles(tmp);
  await Promise.all(appFiles.map(async (aoa) => {
    const doc = yaml.load(await fs.readFile(aoa, "utf8")) || {};
    doc.appProjects = (doc.appProjects || [])
      .map((proj) => {
        proj.applications = (proj.applications || [])
          .filter((app) => keepNames.includes(app.name));
        return proj;
      })
      .filter((proj) => proj.applications.length);
    await fs.writeFile(aoa, yaml.dump(doc));
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

  /* 2d) Zip & return stream ------------------------------------ */
  const arch = Archiver("zip", { zlib: { level: 9 } });
  arch.on("warning", console.warn);
  arch.on("error", (err) => { throw err; });
  arch.directory(tmp, false);
  arch.finalize();
  return arch;
}
