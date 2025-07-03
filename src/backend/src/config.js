/*  config.js  –  zero-fallback version
    ─────────────────────────────────────────────────────────────── */

const repo = process.env.GIT_REPO_SSH;
if (!repo) {
  console.error("❌  GIT_REPO_SSH required");
  process.exit(1);
}

export default {
  /* ── Git repo / clone settings ─────────────────────────────── */
  gitRepo   : repo,
  gitBranch : process.env.GIT_BRANCH || "main",
  gitKey    : process.env.GIT_SSH_KEY || process.env.GIT_SSH_KEY_B64,

  /* ── Backend behaviour ─────────────────────────────────────── */
  appsGlob  : process.env.APPS_GLOB || "app-of-apps*.y?(a)ml",

  /* ── Token replacement (NEW) ───────────────────────────────── */
  /** what to search for (e.g. "example.com")                     */
  tokenInput: process.env.TOKEN_REPLACE || "",
  /** default replacement shown in the UI; editable by the user   */
  nameDefault: process.env.DEFAULT_NAME || "",

  /* ── Webhook URLs (must all be set if you use them) ────────── */
  webhookUrl        : process.env.WF_WEBHOOK_URL,
  deleteWebhookUrl  : process.env.WF_DELETE_WEBHOOK_URL,
  upgradeWebhookUrl : process.env.WF_UPGRADE_WEBHOOK_URL,
  downloadWebhookUrl: process.env.WF_DOWNLOAD_WEBHOOK_URL,
  webhookTok        : process.env.WF_TOKEN || "",

  /* misc */
  chartCacheDir: "/tmp/chart-cache",
  port         : Number(process.env.PORT) || 8080
};
