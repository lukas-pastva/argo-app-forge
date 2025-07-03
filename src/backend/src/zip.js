/*  src/backend/src/zip.js
    ───────────────────────────────────────────────────────────────
    Clone → filter selected Applications → optional token-replace
    → stream back a ZIP.
*/

import fs        from "fs/promises";
import path      from "node:path";
import yaml      from "js-yaml";
import fg        from "fast-glob";
import Archiver  from "archiver";
import { ensureRepo } from "./git.js";
import cfg       from "./config.js";

/* ────────────────────────────────────────────────────────────────
   Helper – find every “app-of-apps” file that matches APPS_GLOB
   (throws if nothing matches)
   ────────────────────────────────────────────────────────────── */
async function findAppFiles(root) {
  const files = await fg(cfg.appsGlob, { cwd: root, absolute: true });
  if (!files.length) {
    throw new Error(
      `No file matched APPS_GLOB="${cfg.appsGlob}" in ${root}`
    );
  }
  return files;
}

/* ────────────────────────────────────────────────────────────────
   1) Flatten the list of Application names across *all* matches
   ────────────────────────────────────────────────────────────── */
export async function listApps() {
  const root   = await ensureRepo();
  const files  = await findAppFiles(root);
  const names  = new Set();

  for (const file of files) {
    const doc = yaml.load(await fs.readFile(file, "utf8")) || {};
    (doc.appProjects || []).forEach((proj) =>
      (proj.applications || []).forEach((a) => names.add(a.name))
    );
  }
  return [...names];
}

/* ────────────────────────────────────────────────────────────────
   2) Build filtered ZIP
   ────────────────────────────────────────────────────────────── */
export async function buildZip(keepNames) {
  const root = await ensureRepo();

  /* make a working copy to mutate -------------------------------- */
  const tmp = path.join(process.cwd(), "tmp-filtered");
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.cp(root, tmp, { recursive: true });

  /* 2a) Trim Application blocks in every matching file ----------- */
  const appFiles = await findAppFiles(tmp);
  await Promise.all(
    appFiles.map(async (aoa) => {
      const doc = yaml.load(await fs.readFile(aoa, "utf8")) || {};
      doc.appProjects = (doc.appProjects || [])
        .map((proj) => {
          proj.applications = (proj.applications || []).filter((app) =>
            keepNames.includes(app.name)
          );
          return proj;
        })
        .filter((proj) => proj.applications.length);
      await fs.writeFile(aoa, yaml.dump(doc));
    })
  );

  /* 2b) Delete unused values/*.yaml ------------------------------ */
  const valFiles = await fg("values/*.yaml", { cwd: tmp });
  await Promise.all(
    valFiles.map(async (rel) => {
      const base = path.basename(rel, ".yaml");
      if (!keepNames.includes(base)) {
        await fs.rm(path.join(tmp, rel));
      }
    })
  );

  /* 2c) Optional token replacement ------------------------------ */
  if (cfg.replaceToken && cfg.replaceTokenValue) {
    const everyFile = await fg(["**/*", "!**/.git/**"], {
      cwd: tmp,
      dot: true,
    });
    await Promise.all(
      everyFile.map(async (rel) => {
        const p = path.join(tmp, rel);
        if ((await fs.stat(p)).isDirectory()) return;
        const txt = await fs.readFile(p, "utf8");
        if (txt.includes(cfg.replaceToken)) {
          await fs.writeFile(
            p,
            txt.replaceAll(cfg.replaceToken, cfg.replaceTokenValue)
          );
        }
      })
    );
  }

  /* 2d) Zip & return stream ------------------------------------- */
  const arch = Archiver("zip", { zlib: { level: 9 } });
  arch.on("warning", console.warn);
  arch.on("error", (err) => {
    throw err;
  });
  arch.directory(tmp, false);
  arch.finalize();
  return arch;
}
