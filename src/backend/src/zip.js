/*  src/backend/src/zip.js
    ───────────────────────────────────────────────────────────────
    listApps() → [{ name, icon, desc, maint, readme, home }]
*/

import fs       from "fs/promises";
import path     from "node:path";
import yaml     from "js-yaml";
import fg       from "fast-glob";
import Archiver from "archiver";
import { ensureRepo } from "./git.js";
import cfg      from "./config.js";

/* helper ─────────────────────────────────────────────────────── */
const commonIcons = ["icon.png","icon.jpg","icon.svg","logo.png"];
async function fileExists(p){ try{ await fs.access(p); return true; } catch{ return false; } }

/* pull meta from a repo-local chart dir */
async function chartMeta(root, chartPath){
  const chartDir  = path.join(root, chartPath);
  const chartFile = path.join(chartDir, "Chart.yaml");

  let icon=null, desc="", maint="", readme="", home="";
  try{
    const meta = yaml.load(await fs.readFile(chartFile,"utf8"))||{};
    desc  = meta.description || "";
    maint = (meta.maintainers||[]).map(m=>m.name||m).join(", ");
    home  = meta.home || "";

    /* icon – same logic as before */
    let ref = meta.icon||"";
    if(!ref){
      for(const f of commonIcons) if(await fileExists(path.join(chartDir,f))){ ref=f; break; }
    }
    if(/^https?:\/\//.test(ref)){ icon=ref; }
    else if(ref){
      const buf=await fs.readFile(path.join(chartDir,ref));
      const ext=path.extname(ref).toLowerCase();
      const mime=ext===".svg"?"image/svg+xml":ext===".jpg"||ext===".jpeg"?"image/jpeg":"image/png";
      icon=`data:${mime};base64,${buf.toString("base64")}`;
    }

    /* README (first 30 non-blank lines) */
    const rd=path.join(chartDir,"README.md");
    if(await fileExists(rd)){
      const lines=(await fs.readFile(rd,"utf8"))
        .split(/\r?\n/).filter(l=>l.trim()).slice(0,30);
      readme=lines.join("\n");
    }
  }catch{/* ignore */}
  return { icon, desc, maint, readme, home };
}

/* locate every app-of-apps YAML */
async function appFiles(root){
  const f=await fg(cfg.appsGlob,{cwd:root,absolute:true});
  if(!f.length) throw new Error(`No file matched APPS_GLOB="${cfg.appsGlob}"`);
  return f;
}

/* ── 1)  Flatten with rich meta ─────────────────────────────── */
export async function listApps(){
  const root = await ensureRepo();
  const files= await appFiles(root);
  const out  = [];

  for(const file of files){
    const doc=yaml.load(await fs.readFile(file,"utf8"))||{};
    for(const proj of doc.appProjects||[])
      for(const app of proj.applications||[]){
        const meta = app.path ? await chartMeta(root, app.path) : {};
        out.push({ name:app.name, ...meta });
      }
  }
  /* de-dupe by name */
  const seen=new Map();
  for(const a of out) if(!seen.has(a.name)) seen.set(a.name,a);
  return [...seen.values()];
}

/* ── 2)  buildZip() — unchanged except for chart-prune logic ── */
export async function buildZip(keepNames, tokenOutput=cfg.nameDefault){
  const root=await ensureRepo();

  /* which chart paths are referenced? */
  const needed=new Set();
  const files=await appFiles(root);
  for(const file of files){
    const doc=yaml.load(await fs.readFile(file,"utf8"))||{};
    for(const proj of doc.appProjects||[])
      for(const app of proj.applications||[])
        if(keepNames.includes(app.name)&&app.path)
          needed.add(app.path.replace(/^\.?\/*/,""));
  }

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

  /* delete unused values/ */
  for(const rel of await fg("values/*.yaml",{cwd:tmp})){
    if(!keepNames.has(path.basename(rel,".yaml"))) await fs.rm(path.join(tmp,rel));
  }

  /* prune un-referenced charts */
  for(const dir of await fg(["charts/external/*/*/*","external/*/*/*"],{cwd:tmp,onlyDirectories:true})){
    if(!needed.has(dir)) await fs.rm(path.join(tmp,dir),{recursive:true,force:true});
  }

  /* optional token replace */
  if(cfg.tokenInput&&tokenOutput){
    const every=await fg(["**/*","!**/.git/**"],{cwd:tmp,dot:true});
    await Promise.all(every.map(async rel=>{
      const p=path.join(tmp,rel);
      if((await fs.stat(p)).isDirectory()) return;
      const txt=await fs.readFile(p,"utf8");
      if(txt.includes(cfg.tokenInput))
        await fs.writeFile(p,txt.replaceAll(cfg.tokenInput,tokenOutput));
    }));
  }

  const arch=Archiver("zip",{zlib:{level:9}});
  arch.directory(tmp,false); arch.finalize();
  return arch;
}
