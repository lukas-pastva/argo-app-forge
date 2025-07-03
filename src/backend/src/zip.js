/*  src/backend/src/zip.js
    ───────────────────────────────────────────────────────────────
    • listApps()        → returns rich meta (icon, desc, maint, home, readme)
    • buildZip()        → prunes charts/external to only referenced paths
    • helper chartMeta  – far more robust (case-insensitive Chart.yaml, etc.)
*/

import fs       from "fs/promises";
import path     from "node:path";
import yaml     from "js-yaml";
import fg       from "fast-glob";
import Archiver from "archiver";
import { ensureRepo } from "./git.js";
import cfg      from "./config.js";

/* ── helper utils ────────────────────────────────────────────── */
async function exists(p){ try{ await fs.access(p); return true; }catch{return false;} }
const iconFiles = ["icon.png","icon.jpg","icon.jpeg","icon.svg","logo.png","logo.svg"];

/* grab meta from a local chart dir */
async function chartMeta(root, chartRel){
  const dir   = path.join(root, chartRel);
  const files = await fg(["Chart.yaml","chart.yaml"],{cwd:dir,absolute:true});
  if(!files.length) return {};                          // no Chart.yaml -> no meta

  const meta  = yaml.load(await fs.readFile(files[0],"utf8")) || {};
  const iconF = meta.icon ? [meta.icon] : iconFiles;
  let   icon  = null;

  for(const f of iconF){
    const p = path.join(dir, f);
    if(await exists(p)){
      if(/^https?:\/\//.test(f)){ icon=f; break; }
      const buf = await fs.readFile(p);
      const ext = path.extname(f).toLowerCase();
      const mime= ext===".svg"?"image/svg+xml":ext.match(/jpe?g/)?"image/jpeg":"image/png";
      icon = `data:${mime};base64,${buf.toString("base64")}`;
      break;
    }
  }

  /* README.md – first 30 non-empty lines */
  let readme="";
  for(const r of ["README.md","Readme.md","readme.md"]){
    const p=path.join(dir,r);
    if(await exists(p)){
      readme=(await fs.readFile(p,"utf8"))
        .split(/\r?\n/).filter(l=>l.trim()).slice(0,30).join("\n");
      break;
    }
  }

  return {
    icon,
    desc : meta.description || "",
    maint: (meta.maintainers||[]).map(m=>m.name||m).join(", "),
    home : meta.home || "",
    readme
  };
}

/* locate every app-of-apps file once */
async function appFiles(root){
  const f=await fg(cfg.appsGlob,{cwd:root,absolute:true});
  if(!f.length) throw new Error(`No file matched APPS_GLOB="${cfg.appsGlob}"`);
  return f;
}

/* ── 1)  Flatten Applications with meta ─────────────────────── */
export async function listApps(){
  const root  = await ensureRepo();
  const files = await appFiles(root);
  const map   = new Map();                                   // name → meta

  for(const file of files){
    const doc=yaml.load(await fs.readFile(file,"utf8"))||{};
    for(const proj of doc.appProjects||[])
      for(const app of proj.applications||[]){
        if(map.has(app.name)) continue;                      // de-dupe by name
        if(app.path) map.set(app.name, await chartMeta(root, app.path));
        else         map.set(app.name, {});                  // remote chart
      }
  }
  return [...map.entries()].map(([name,meta])=>({name,...meta}));
}

/* ── 2)  Build ZIP (filters values + charts) ────────────────── */
export async function buildZip(keepNames, tokenOutput=cfg.nameDefault){
  const root  = await ensureRepo();
  const files = await appFiles(root);

  /* which chart paths are really referenced? */
  const needed=new Set();
  for(const file of files){
    const doc=yaml.load(await fs.readFile(file,"utf8"))||{};
    for(const proj of doc.appProjects||[])
      for(const app of proj.applications||[])
        if(keepNames.includes(app.name)&&app.path)
          needed.add(app.path.replace(/^\.?\/*/,""));
  }

  /* working copy */
  const tmp=path.join(process.cwd(),"tmp-filtered");
  await fs.rm(tmp,{recursive:true,force:true});
  await fs.cp(root,tmp,{recursive:true});

  /* trim Application blocks */
  for(const aoa of await appFiles(tmp)){
    const doc=yaml.load(await fs.readFile(aoa,"utf8"))||{};
    doc.appProjects=(doc.appProjects||[])
      .map(p=>{p.applications=(p.applications||[]).filter(a=>keepNames.includes(a.name));return p;})
      .filter(p=>p.applications.length);
    await fs.writeFile(aoa,yaml.dump(doc));
  }

  /* delete unused values */
  for(const rel of await fg("values/*.yaml",{cwd:tmp}))
    if(!keepNames.includes(path.basename(rel,".yaml")))
      await fs.rm(path.join(tmp,rel));

  /* prune charts/external that are NOT in “needed” */
  for(const d of await fg(["charts/external/*/*/*","external/*/*/*"],{cwd:tmp,onlyDirectories:true}))
    if(!needed.has(d)) await fs.rm(path.join(tmp,d),{recursive:true,force:true});

  /* token replace (optional) */
  if(cfg.tokenInput && tokenOutput){
    const every=await fg(["**/*","!**/.git/**"],{cwd:tmp,dot:true});
    await Promise.all(every.map(async rel=>{
      const p=path.join(tmp,rel);
      if((await fs.stat(p)).isDirectory()) return;
      const txt=await fs.readFile(p,"utf8");
      if(txt.includes(cfg.tokenInput))
        await fs.writeFile(p,txt.replaceAll(cfg.tokenInput,tokenOutput));
    }));
  }

  /* stream ZIP */
  const arch=Archiver("zip",{zlib:{level:9}});
  arch.directory(tmp,false); arch.finalize();
  return arch;
}
