import express from "express";
import helmet  from "helmet";
import { listApps, buildZip } from "./zip.js";
import cfg     from "./config.js";

const app = express();
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

/* 1️⃣ Flattened Application list (with icons) */
app.get("/api/apps", async (_req, res) => res.json(await listApps()));

/* 2️⃣ Expose default “Name” value to the UI  */
app.get("/api/defaults", (_req, res) =>
  res.json({ name: cfg.nameDefault || "" })
);

/* 3️⃣ Generate ZIP */
app.post("/api/build", async (req, res) => {
  const { selected = [], name = "" } = req.body ?? {};
  if (!Array.isArray(selected)) {
    return res.status(400).json({ error: "selected[] required" });
  }
  try {
    const stream = await buildZip(selected, name);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=appforge.zip");
    stream.pipe(res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(cfg.port, () => console.log(`✔︎ AppForge backend @${cfg.port}`));
