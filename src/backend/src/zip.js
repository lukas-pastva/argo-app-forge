import fs from "fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import fg  from "fast-glob";
import Archiver from "archiver";
import { ensureRepo } from "./git.js";
import cfg from "./config.js";

export async function listApps(){
  const root = await ensureRepo();
  const f   = path.join(root,"argocd/app-of-apps.yaml");
  const doc = yaml.load(await fs.readFile(f,"utf8"));
  return (doc.appProjects||[]).flatMap(p=> (p.applications||[]).map(a=>a.name));
}

export async function buildZip(keepNames){
  const root = await ensureRepo();
  const tmp  = path.join(process.cwd(),"tmp-filtered");
  await fs.rm(tmp,{recursive:true,force:true});
  await fs.cp(root,tmp,{recursive:true});

  /* 1) Trim Application blocks + drop values files  */
  const aoa = path.join(tmp,"argocd/app-of-apps.yaml");
  const doc = yaml.load(await fs.readFile(aoa,"utf8"));
  doc.appProjects = (doc.appProjects||[]).map(p=>{
    p.applications = (p.applications||[]).filter(a=> keepNames.includes(a.name));
    return p;
  }).filter(p=> p.applications.length);
  await fs.writeFile(aoa,yaml.dump(doc));

  /*  Delete unused values/*.yaml  */
  const valFiles = await fg("values/*.yaml",{cwd:tmp});
  await Promise.all(valFiles.map(async f=>{
    const base = path.basename(f,".yaml");
    if(!keepNames.includes(base)) await fs.rm(path.join(tmp,f));
  }));

  /* 2) Global token replacement */
  const files = await fg(["**/*","!**/.git/**"],{cwd:tmp, dot:true});
  await Promise.all(files.map(async fp=>{
    const p = path.join(tmp,fp);
    if((await fs.stat(p)).isDirectory()) return;
    const txt = await fs.readFile(p,"utf8");
    if(txt.includes(cfg.replaceToken))
      await fs.writeFile(p, txt.replaceAll(cfg.replaceToken,cfg.replaceTokenValue));
  }));

  /* 3) Zip & return stream */
  const arch = Archiver("zip",{zlib:{level:9}});
  arch.on("warning",console.warn);
  arch.on("error",err=>{throw err;});
  arch.directory(tmp,false);
  arch.finalize();
  return arch;
}