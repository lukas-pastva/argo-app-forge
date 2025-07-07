/*  src/backend/src/zip.js
    ───────────────────────────────────────────────────────────────
    • listApps()  → returns rich meta (icon, desc, …)
    • buildZip()  → prunes charts/external to only referenced paths
                    (except: we no longer delete remote-chart dirs)
                    + NEW 2025-07-07
                      ▶ correctly uncomment  # oauth2-<app> BEGIN … END  blocks
*/

import fs       from "fs/promises";
import path     from "node:path";
import yaml     from "js-yaml";
import fg       from "fast-glob";
import Archiver from "archiver";
import { ensureRepo } from "./git.js";
import cfg      from "./config.js";

/* ── helpers ─────────────────────────────────────────────────── */
async function exists(p){ try{ await fs.access(p); return true; }catch{return false;} }
const iconFiles = ["icon.png","icon.jpg","icon.jpeg","icon.svg","logo.png","logo.svg"];

/* ───────────────────────────────────────────────────────────────
   Uncomment everything between
   “# oauth2-<app> BEGIN” … “# oauth2-<app> END”

   • The BEGIN / END marker lines themselves stay commented.
   • If activeApps is an **empty set** we treat that as “uncomment all
     OAuth2 blocks”.
──────────────────────────────────────────────────────────────── */
function uncommentOauth2Blocks(text, activeApps = new Set()) {
  const out = [];
  let inBlock = false, processBlock = false;

  for (const line of text.split(/\r?\n/)) {
    const beg = line.match(/^(\s*)#\s*(oauth2-[\w-]+)\s+BEGIN/i);
    if (beg) {
      const allActive = activeApps.size === 0;          // empty set → enable all
      processBlock    = allActive || activeApps.has(beg[2]);
      inBlock         = true;
      out.push(line);
      continue;
    }
    if (/^\s*#\s*oauth2-[\w-]+\s+END/i.test(line)) {
      inBlock = processBlock = false;
      out.push(line);
      continue;
    }
    if (inBlock && processBlock) {
      const m = line.match(/^(\s*)#\s?(.*)$/);
      out.push(m ? m[1] + m[2] : line);
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

/* grab meta from a local chart dir ---------------------------------------- */
async function chartMeta(root, chartRel){
  let dir = path.join(root, chartRel);

  // if Chart.yaml missing and we’re inside “external/…”, try “charts/external/…”
  if (!await exists(path.join(dir, "Chart.yaml")) &&
      chartRel.startsWith("external/")) {
    dir = path.join(root, "charts", chartRel);
  }
  const files = await fg(["Chart.yaml","chart.yaml"],{cwd:dir,absolute:true});
  if (!files.length) return {};                         // no Chart.yaml ⇒ no meta

  const meta  = yaml.load(await fs.readFile(files[0],"utf8")) || {};
  const iconF = meta.icon ? [meta.icon] : iconFiles;
  let   icon  = null;

  for (const f of iconF){
    const p = path.join(dir, f);
    if (await exists(p)){
      if (/^https?:\/\//.test(f)){ icon=f; break; }
      const buf  = await fs.readFile(p);
      const ext  = path.extname(f).toLowerCase();
      const mime = ext===".svg" ? "image/svg+xml"
                 : ext.match(/jpe?g/) ? "image/jpeg"
                 : "image/png";
      icon = `data:${mime};base64,${buf.toString("base64")}`;
      break;
    }
  }

  /* README.md – first 30 non-empty lines */
  let readme = "";
  for (const r of ["README.md","Readme.md","readme.md"]){
    const p = path.join(dir,r);
    if (await exists(p)){
      readme = (await fs.readFile(p,"utf8"))
                 .split(/\r?\n/).filter(l => l.trim()).slice(0,30).join("\n");
      break;
    }
  }

  return {
    icon,
    desc : meta.description || "",
    maint: (meta.maintainers||[]).map(m => m.name||m).join(", "),
    home : meta.home || "",
    readme
  };
}

/* locate every app-of-apps file once -------------------------------------- */
async function appFiles(root){
  const f = await fg(cfg.appsGlob,{cwd:root,absolute:true});
  if (!f.length) throw new Error(`No file matched APPS_GLOB="${cfg.appsGlob}"`);
  return f;
}

/* ── 1)  Flatten Applications with meta ─────────────────────── */
export async function listApps(){
  const root  = await ensureRepo();
  const files = await appFiles(root);
  const map   = new Map();                                  // name → meta

  for (const file of files){
    const doc = yaml.load(await fs.readFile(file,"utf8")) || {};
    for (const proj of doc.appProjects || [])
      for (const app of proj.applications || []){
        if (map.has(app.name)) continue;                    // de-dupe by name
        if (app.path) map.set(app.name, await chartMeta(root, app.path));
        else          map.set(app.name, {});                // remote chart
      }
  }
  return [...map.entries()].map(([name,meta]) => ({ name, ...meta }));
}

/* ── 2)  Build ZIP ──────────────────────────────────────────── */
export async function buildZip(keepNames, repoReplace = "", domainReplace = "") {
  const root  = await ensureRepo();
  const files = await appFiles(root);

  /* which chart paths are really referenced?  (collect *both* possible locations) */
  const needed = new Set();
  for (const file of files){
    const doc = yaml.load(await fs.readFile(file,"utf8")) || {};
    for (const proj of doc.appProjects || [])
      for (const app of proj.applications || [])
        if (keepNames.includes(app.name) && app.path){
          const p = app.path.replace(/^\.?\/*/,"");   // canonical
          needed.add(p);                              // e.g.  external/foo/bar
          if (p.startsWith("external/"))              // also charts/external/foo/bar
            needed.add(path.posix.join("charts", p));
        }
  }

  /* working copy ── skip ALL “.git” directories right here */
  const tmp = path.join(process.cwd(),"tmp-filtered");
  await fs.rm(tmp,{recursive:true,force:true});
  await fs.cp(root, tmp, {
    recursive: true,
    /* filter callback runs for every path being copied */
    filter: (src/*, dest*/) => {
      const rel = path.relative(root, src);
      return !rel.split(path.sep).includes(".git");
    }
  });

  /* trim Application blocks */
  for (const aoa of await appFiles(tmp)){
    const doc = yaml.load(await fs.readFile(aoa,"utf8")) || {};
    doc.appProjects = (doc.appProjects||[])
      .map(p => {
        p.applications = (p.applications||[])
          .filter(a => keepNames.includes(a.name));
        return p;
      })
      .filter(p => p.applications.length);
    await fs.writeFile(aoa, yaml.dump(doc));
  }

  /* delete unused values */
  for (const rel of await fg("values/*.yaml",{cwd:tmp}))
    if (!keepNames.includes(path.basename(rel,".yaml")))
      await fs.rm(path.join(tmp,rel));

  /* -----------------------------------------------------------------------
     We *keep* every directory under external/** and charts/external/**.
     The earlier logic that deleted unreferenced dirs is gone.
     --------------------------------------------------------------------- */

  /* multi-token replacement ----------------------------------- */
  const replacements = [];
  if (cfg.repoTokenInput   && repoReplace)   replacements.push([cfg.repoTokenInput,   repoReplace]);
  if (cfg.domainTokenInput && domainReplace) replacements.push([cfg.domainTokenInput, domainReplace]);

  if (replacements.length){
    const every = await fg(["**/*","!**/.git/**"],{cwd:tmp,dot:true});
    await Promise.all(every.map(async rel => {
      const p = path.join(tmp,rel);
      if ((await fs.stat(p)).isDirectory()) return;
      let txt   = await fs.readFile(p,"utf8");
      let changed = false;
      for (const [from,to] of replacements){
        if (txt.includes(from)){ txt = txt.split(from).join(to); changed = true; }
      }
      if (changed) await fs.writeFile(p,txt);
    }));
  }

  /* ─────────────────────────────────────────────────────────────
     OAuth2: uncomment blocks for the selected oauth2-apps
  ───────────────────────────────────────────────────────────── */
  const oauth2Set = new Set(keepNames.filter(n => n.startsWith("oauth2-")));

  /* 🎯 FIX #71 – glob includes root values as well */
  const yamls = await fg(
    ['values/*.ya?ml', 'values/**/*.ya?ml'],   // ← added first pattern
    { cwd: tmp }
  );

  await Promise.all(
    yamls.map(async rel => {
      const p   = path.join(tmp, rel);
      const txt = await fs.readFile(p, "utf8");
      const mod = uncommentOauth2Blocks(txt, oauth2Set);   // empty set = “all”
      if (mod !== txt) await fs.writeFile(p, mod);
    })
  );

  /* stream ZIP – root folder = main domain (if provided) */
  const arch = Archiver("zip", { zlib: { level: 9 } });
  arch.directory(tmp, domainReplace || false);
  arch.finalize();
  return arch;
}
