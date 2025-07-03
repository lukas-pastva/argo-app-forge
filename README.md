# AppForge 🚀

*A tiny Git‑based **App‑of‑Apps curator** that lets newcomers pick only the
Helm Applications they really need, performs a repo‑wide token replacement,
and streams back a **ready‑to‑install ZIP**.*

One container = React + Express + Git (no K8s credentials required).

---

## ✨ What it does

1. **Clone** a GitOps repository (SSH) — read‑only.  
2. **List** every Application in the `app-of-apps.yaml` file(s) per cluster/env.  
3. **Checkbox UI**: pick the apps you want; everything else vanishes.  
4. **Clean‑up**: removes the corresponding `values/*.yaml` overrides.  
5. **Token‑replace** across *all* files – handy for cluster‑specific hostnames.  
6. **Zip & Download** the tailored repo in one click.

---

## 🏃‍♂️ Quick start (Docker)

```bash
# 1) build
docker build -t appforge .

# 2) run – minimal required envs
docker run -p 8080:8080   -e GIT_REPO_SSH=git@github.com:my‑org/argo‑apps.git   -e GIT_SSH_KEY="$(cat ~/.ssh/id_ed25519)"   -e TOKEN_REPLACE="mycompany.local => mylab.dev"   appforge
```

Open <http://localhost:8080>

> **Nothing is ever pushed upstream.**  
> All filtering & editing happens inside the container; the end product is a ZIP.

---

## 🌡 Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| **`GIT_REPO_SSH`** | — | Git repo to clone (read‑only) |
| `GIT_BRANCH` | `main` | Branch to pull |
| **`GIT_SSH_KEY`** or `GIT_SSH_KEY_B64` | — | Private key (plain or base64) |
| **`TOKEN_REPLACE`** | — | Pattern `from => to`, e.g. `example.com => lab.dev` |
| `PORT` | `8080` | Port UI listens on |
| `APPS_GLOB` | `app-of-apps*.ya?ml` | File‑mask for repo scan |

---

## 🗂 Project layout

```
src/
  backend/         Express API + Git helper
  frontend/        React + Vite SPA
  Dockerfile       multi‑stage build (node:20‑alpine)
```

---

## 🔌 REST API (backend)

| Method | Path | Purpose |
|--------|------|---------|
| `GET /api/files` | list every `app-of-apps*.yaml` |
| `GET /api/apps?file=…` | flat list of `AppProject.applications[]` |
| `POST /api/build` | body = `{ selected: [], token: "a => b" }` → streams ZIP |

---

## 🛠 Local development

```bash
# prerequisites: Node 18+ and pnpm
pnpm install              # root = mono‑repo
pnpm --filter backend dev # :8080
pnpm --filter frontend dev # :5173
```

The frontend proxies `/api/*` → `:8080`.

---

## 🔒 Security notes

* **Read‑only Git clone** kept in `/tmp/gitops-readonly`  
  (force‑cleaned on every boot).
* The resulting ZIP is streamed once, never written to disk.
* No Helm / Kube config is present inside the container.

---

## © License

MIT — do whatever you want, no warranty, happy hacking!
