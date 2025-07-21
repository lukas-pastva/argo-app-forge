import express  from "express";
import helmet   from "helmet";
import fg       from "fast-glob";
import fs       from "node:fs/promises";
import path     from "node:path";
import { listApps, buildZip } from "./zip.js";
import { ensureRepo }  from "./git.js";
import { genKeyPair }  from "./ssh.js";
import cfg      from "./config.js";

const app = express();
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

/* 1️⃣ Flat Application list (with icons) */
app.get("/api/apps", async (_req, res) => res.json(await listApps()));

/* 2️⃣ Default values for the UI */
app.get("/api/defaults", (_req, res) =>
  res.json({ repo: cfg.repoDefault, domain: cfg.domainDefault })
);

/* 3️⃣ Generate ZIP */
app.post("/api/build", async (req, res) => {
  const { selected = [], repo = "", domain = "" } = req.body ?? {};
  if (!Array.isArray(selected)) {
    return res.status(400).json({ error: "selected[] required" });
  }
  try {
    const stream   = await buildZip(selected, repo, domain);
    const fileStem = (domain || "Argo Init").replace(/[^a-z0-9.-]+/gi, "-");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=${fileStem}.zip`);
    stream.pipe(res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/* ── NEW: generate RSA key pair ─────────────────────────────── */
app.get("/api/ssh-keygen", (_req, res) => {
  try {
    res.json(genKeyPair());
  } catch (e) {
    console.error("ssh-keygen error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ── NEW: list files under repo/scripts ─────────────────────── */
app.get("/api/scripts", async (_req, res) => {
  try {
    const root  = await ensureRepo();
    const dir   = path.join(root, "scripts");
    const files = await fg("*", { cwd: dir, onlyFiles: true });
    res.json(files);
  } catch (e) {
    console.error("scripts list error:", e);
    res.json([]);
  }
});

/* RAW script download – GET /scripts/<file>  */
app.get("/scripts/:name", async (req, res) => {
  try {
    const root = await ensureRepo();
    const file = path.join(root, "scripts", req.params.name);
    const txt  = await fs.readFile(file, "utf8");
    res.type("text/plain").send(txt);
  } catch {
    res.status(404).send("script not found");
  }
});

app.listen(cfg.port, () => console.log(`✔︎ Argo Init backend @${cfg.port}`));
