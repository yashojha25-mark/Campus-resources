# Deployment Guide — Campus Resource Booking System

**Stack:** MongoDB Atlas (database) · Render (Node/Express backend) · Netlify (static frontend)

This is the exact sequence, in order. Don't skip ahead — later steps need values produced by earlier ones.

> **Golden rule:** secrets (`MONGO_URI`, `JWT_SECRET`) go in **`backend/.env` locally** and in
> **Render → Environment** in production. They are **never** committed to GitHub. The `.gitignore`
> already blocks `.env`; the frontend's `config.js` holds only a *public* API URL, which is safe.

---

## Order of work (why this order)

```
1. Atlas DB  →  2. DB user  →  3. connection string
                                    │
                                    ▼
                          4. backend .env (local test)
                                    │
                          5. push backend to GitHub
                                    │
                          6. deploy backend on Render  →  7. test APIs
                                    │
                          8. CORS (needs the Netlify URL, so it comes after Netlify too)
                                    │
                          9. set frontend API URL  →  10. push frontend  →  11. Netlify
                                    │
                          12. end-to-end test
```

CORS needs the **Netlify URL**, but the backend needs the **Render URL** before you build the frontend.
So the practical loop is: **Render first → get its URL → Netlify → get its URL → finish CORS → redeploy backend.**
Step 8 and step 12 handle that round trip.

---

## 1. Create the MongoDB Atlas database

1. Go to <https://www.mongodb.com/cloud/atlas/register> and create a free account.
2. **Create a project** (e.g. `Campus Booking`) if prompted.
3. Click **Build a Database** → choose **M0 (Free)**.
4. **Cloud Provider & Region:** pick a provider, and choose a region **close to your Render region**
   (Render's default is often Oregon/US or Frankfurt/EU). Matching regions keeps latency low.
   - Render region → Atlas region (roughly):
     - Oregon (US West) → `AWS / us-west-2`
     - Ohio (US East) → `AWS / us-east-1`
     - Frankfurt (EU) → `AWS / eu-central-1`
5. **Cluster Name:** leave `Cluster0` or name it `campus-cluster`.
6. Click **Create Deployment**.

> M0 gives ~512 MB free. Enough for a college project.

---

## 2. Configure the database user

1. Atlas will prompt for a database user right after creation.
   If not: **Security → Database Access → Add New Database User**.
2. **Authentication Method:** `Password`.
3. **Username:** e.g. `campus_admin` (don't reuse your Atlas login).
4. **Password:** click **Autogenerate Secure Password** and **copy it now**.
   - ⚠️ Avoid characters that break URLs: `@ : / ? # [ ] %`. If your password contains any,
     you must percent-encode them in the connection string (step 3).
   - Safest: autogenerate, then eyeball it for `@` and `/`.
5. **Database User Privileges:** `Read and write to any database`
   (or scope it to `campus_resource_booking` later).
6. Click **Add User**.

### 2b. Allow network access

1. **Security → Network Access → Add IP Address**.
2. For Render, you **cannot** whitelist a fixed IP on free plans. Choose **Allow Access from Anywhere**
   (`0.0.0.0/0`).
   - This is acceptable for a project; the database still requires the username + password.
   - For production-grade security, Render's paid tiers offer static outbound IPs you can whitelist.
3. Click **Confirm**.

---

## 3. Get the MongoDB connection string

1. **Database → Cluster0 → Connect**.
2. Choose **Drivers**.
3. **Driver:** `Node.js`, **Version:** `5.5 or later` (Mongoose 9 supports it).
4. Copy the string. It looks like:

```
mongodb+srv://campus_admin:<db_password>@cluster0.ab1cd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
```

5. **Edit it before use:**
   - Replace `<db_password>` with the password from step 2.
   - **Insert the database name** right after the host and before the `?` — otherwise Mongo
     writes to a database literally named `test`:

```
mongodb+srv://campus_admin:YOUR_PASSWORD@cluster0.ab1cd.mongodb.net/campus_resource_booking?retryWrites=true&w=majority&appName=Cluster0
```

   - If the password has special characters, percent-encode them:
     `@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`, `?` → `%3F`, `%` → `%25`.

> Keep this string secret. It is a full-access credential to your database.

---

## 4. Configure the backend environment variables (locally)

Generate a strong JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Copy the example file and fill it in:

```bash
cd Campus-Resource-Booking/backend
cp .env.example .env
```

Edit `.env` so it looks like this:

```dotenv
# backend/.env  — LOCAL ONLY. Never committed (see root .gitignore).

PORT=5000
MONGO_URI=mongodb+srv://campus_admin:YOUR_PASSWORD@cluster0.ab1cd.mongodb.net/campus_resource_booking?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=paste_the_48_byte_base64url_string_here
JWT_EXPIRES_IN=7d

# Comma-separated list of browser origins allowed to call this API.
# Locally: your static server. Add the Netlify URL in step 8.
CORS_ORIGINS=http://localhost:5599

# Leave unset locally so error messages stay verbose.
# NODE_ENV=production
```

> **Why `.env` and not a committed file:** `.env` is listed in the repo root `.gitignore`, along with
> `.env.*`, so it cannot be staged by accident. Verify with `git check-ignore -v backend/.env`.

### Test locally against Atlas

```bash
npm install
npm start
```

Expected:

```
MongoDB Connected: cluster0-shard-00-xx.ab1cd.mongodb.net
Server is running on port 5000
```

Quick check:

```bash
curl http://localhost:5000/api/test
# {"message":"Campus Resource Booking API is running"}
```

If you see `MongoDB connection error`:
- Wrong password / not percent-encoded → `Authentication failed`.
- IP not whitelisted → `Could not connect to any servers` / TLS timeout.
- Missing DB name → it connects but writes to a `test` database.

### Verify `.env` is ignored before you ever commit

```bash
git check-ignore -v backend/.env
# .gitignore:8:.env        backend/.env     ← good
```

---

## 5. Push the backend to GitHub

The repository already exists. If you're adding these changes on top of the current `main`:

```bash
# from the repo root
cd ~/Practice/Campus_Resourse            # adjust to your clone

git add -A
git status --short                        # CONFIRM: no backend/.env listed
git commit -m "Add deploy config (frontend config.js, Node engines)"
git push
```

**Before pushing, run the secret check:**

```bash
git status --short | grep -E "\.env$" && echo "STOP: .env is staged" || echo "OK: .env not staged"
```

> Use a **separate repository** for the frontend if you prefer (step 10). Render only needs the
> `backend/` folder; Netlify only needs `frontend/`. One repo with a subfolder each works fine —
> you set a **Root Directory** on each platform.

---

## 6. Deploy the backend on Render

1. Sign up at <https://render.com> with GitHub.
2. **Dashboard → New → Web Service**.
3. **Connect** your GitHub repo (`Campus-resources`). Grant repo access if asked.
4. Configure:

| Field | Value |
|---|---|
| **Name** | `campus-resources-api` (becomes part of the URL) |
| **Region** | match your Atlas region (step 1) |
| **Branch** | `main` |
| **Root Directory** | `Campus-Resource-Booking/backend` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |

> **Root Directory** is the critical field. Your `package.json` lives in
> `Campus-Resource-Booking/backend/`, not at the repo root. If you leave it blank, the build fails
> with "no package.json found".

5. Scroll to **Environment Variables** → **Add Environment Variable** for each:

| Key | Value | Notes |
|---|---|---|
| `MONGO_URI` | `mongodb+srv://campus_admin:.../campus_resource_booking?...` | Your **Atlas** string from step 3 |
| `JWT_SECRET` | your 48-byte base64url string | **Use a *different* one from local if you like — but it must be ≥32 chars and not a placeholder** |
| `JWT_EXPIRES_IN` | `7d` | Optional |
| `NODE_ENV` | `production` | Tightens CORS; hides validation detail in 500s |
| `CORS_ORIGINS` | `http://localhost:5599` | **Temporary.** You'll add the Netlify URL in step 8. |

   - Paste values directly into Render's UI. Do **not** create a `.env` file in the repo.
   - Render injects these as real environment variables at runtime — `process.env.MONGO_URI` works
     exactly as it does locally.

6. Click **Create Web Service**.

### What a good deploy log looks like

```
==> Running build command 'npm install'...
added 120 packages
==> Running 'npm start'
MongoDB Connected: cluster0-shard-00-xx.ab1cd.mongodb.net
Server is running on port 10000
==> Your service is live 🎉
```

Two things to know:

- **Port:** Render sets `PORT` itself (often `10000`). Your `server.js` reads `process.env.PORT`, so
  it picks this up automatically. **Never hardcode the port.**
- **Free tier sleeps:** after ~15 minutes idle the service spins down; the next request takes
  30–60 seconds to wake, then behaves normally. The first API call from Netlify may therefore be slow.

Your backend URL is now:

```
https://campus-resources-api.onrender.com
```

---

## 7. Test the deployed backend APIs

Set a variable to save typing:

```bash
API=https://campus-resources-api.onrender.com/api
```

**1) Liveness**

```bash
curl $API/test
# {"message":"Campus Resource Booking API is running"}
```

**2) Public resources (no auth)**

```bash
curl $API/resources/public
# {"resources":[]}   ← empty until you add one as admin
```

**3) Register a user**

```bash
curl -X POST $API/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Deploy Test","email":"deploy@campus.test","password":"password123"}'
# {"message":"User registered successfully","user":{...,"role":"student"}}
```

**4) Log in and capture the token**

```bash
curl -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"deploy@campus.test","password":"password123"}'
```

Copy the `token` from the response, then:

```bash
TOKEN=paste_the_token_here
curl $API/auth/me -H "Authorization: Bearer $TOKEN"
# {"user":{"id":"...","name":"Deploy Test","email":"deploy@campus.test","role":"student"}}
```

**5) Check a protected route rejects a bad token**

```bash
curl -i $API/bookings -H "Authorization: Bearer garbage"
# HTTP/1.1 401 Unauthorized
# {"message":"Not authorized, token failed"}
```

| Check | Expected | ☐ |
|---|---|---|
| `/api/test` | `200` with the running message | ☐ |
| `/api/resources/public` | `200` (empty array is fine) | ☐ |
| Register | `201` "User registered successfully" | ☐ |
| Login | `200` with a `token` | ☐ |
| `/api/auth/me` with token | `200` with your user | ☐ |
| Any route with a bad token | `401` | ☐ |

### Create the admin user

Registration always makes a `student`. Promote yourself in Atlas:

**Atlas → Database → Browse Collections → `campus_resource_booking` → `users` → edit the document →
change `"role": "student"` to `"role": "admin"`.** Save. Log in again — the Admin link appears.

---

## 8. Configure CORS

Your backend's CORS is an **allow-list**. It reads `CORS_ORIGINS` (comma-separated, no trailing
slashes). If the browser's `Origin` isn't on the list, the request is blocked.

You can't finish this until Netlify gives you a URL — so do steps **9–11 first**, then come back here.

**When you have the Netlify URL:**

1. Render → your service → **Environment**.
2. Edit `CORS_ORIGINS`:

```
http://localhost:5599,https://your-site-name.netlify.app
```

   Or, if you attach a custom domain, add it too:

```
http://localhost:5599,https://your-site-name.netlify.app,https://yourdomain.com
```

3. **Save Changes** → Render redeploys automatically.

**Rules that trip people up:**

- **No trailing slash.** `https://site.netlify.app/` ≠ `https://site.netlify.app` — the browser sends
  no trailing slash, so a stray one silently fails to match.
- **Scheme must match.** `http://` vs `https://` are different origins.
- **Netlify previews have different URLs.** Every branch deploy gets a URL like
  `https://deploy-preview-3--your-site.netlify.app`. If you need those, add them or use a
  `*.netlify.app` pattern (not supported by this simple allow-list — list them explicitly, or add
  logic to allow `*.netlify.app`).
- **Redeploy after changing.** The env var only takes effect on the next boot.

> For `www.` vs bare domain, add **both** origins.

---

## 9. Update the frontend API URL

The frontend now reads its backend URL from **one file**: `frontend/js/config.js`
(loaded before `api.js` on every page).

```bash
cd Campus-Resource-Booking/frontend
```

Edit `js/config.js`:

```js
// BEFORE (local)
window.CAMPUS_API_BASE_URL = 'http://localhost:5000/api';

// AFTER (production — use YOUR Render URL + /api)
window.CAMPUS_API_BASE_URL = 'https://campus-resources-api.onrender.com/api';
```

**Must-haves:**

- `https://` (not `http://`) — Netlify serves over HTTPS; a mixed-content call is blocked by the browser.
- **`/api` on the end.** Your routes are mounted at `/api/auth`, `/api/resources`, `/api/bookings`.
- **No trailing slash** — `api.js` strips one, but keep it clean.

> This file is **not** secret. It contains a public URL the browser must know. Never put a JWT or
> password here.

### Keep local development working

You now have one file serving two environments. Options:

- **Simplest:** change `config.js` to the Render URL to ship, and change it back when developing locally.
- **Better:** keep `config.js` at the localhost default and set the production value at deploy time by
  editing the file just before pushing.

Either is fine for a project. (A build step or a `netlify.toml` redirect would avoid the switch, but
that's beyond this setup.)

---

## 10. Push the frontend to GitHub

```bash
cd ~/Practice/Campus_Resourse
git add -A
git status --short
```

Confirm `frontend/js/config.js` is listed with your production URL, and that **no `.env`** appears.

```bash
git commit -m "Point frontend at production API"
git push
```

---

## 11. Deploy the frontend on Netlify

1. Sign up / log in at <https://app.netlify.com> with GitHub.
2. **Add new site → Import an existing project → GitHub** → pick `Campus-resources`.
3. Configure:

| Field | Value |
|---|---|
| **Branch to deploy** | `main` |
| **Base directory** | *(leave empty)* |
| **Build command** | *(leave empty)* |
| **Publish directory** | `Campus-Resource-Booking/frontend` |

> This is a static site — no build step. The **Publish directory** must point at the folder holding
> `index.html`. If you leave it blank Netlify deploys the repo root and you'll get a 404.

4. Click **Deploy site**.

Netlify gives you a URL like `https://random-name-123456.netlify.app`.

**Tidy the URL (optional):** Site configuration → **Change site name** → `campus-resources-booking`
→ becomes `https://campus-resources-booking.netlify.app`.

5. **Go back and finish step 8** — add this Netlify URL to `CORS_ORIGINS` on Render and let it redeploy.

### SPA/redirect note

This app uses plain `.html` files with relative links, so no `_redirects` or `netlify.toml` rewrite
rules are needed. Direct hits like `/resources.html` resolve on their own.

---

## 12. Test frontend + backend + MongoDB together

Open your Netlify URL:

```
https://campus-resources-booking.netlify.app
```

Walk the whole journey:

| # | Step | Expected | ☐ |
|---|---|---|---|
| 1 | Home page loads | Hero, categories, featured resources render over HTTPS | ☐ |
| 2 | Open DevTools → Console | **No** red errors; **no** CORS errors | ☐ |
| 3 | DevTools → Network → any `/api/...` call | Status `200`, request URL is your **Render** host, response headers include `access-control-allow-origin: https://your-site.netlify.app` | ☐ |
| 4 | Register a new account | Success, redirect to login | ☐ |
| 5 | Log in | Redirect to `resources.html`, navbar shows your name | ☐ |
| 6 | Open Atlas → Browse Collections | The new `users` document is **in the cloud database** (proves the frontend reached Render which reached Atlas) | ☐ |
| 7 | Log in as admin (promoted account) | Admin link visible | ☐ |
| 8 | Admin → Add a resource | Success; row appears | ☐ |
| 9 | Refresh Atlas `resources` collection | The document is there | ☐ |
| 10 | As a student, book the resource | Availability check → Confirm → receipt | ☐ |
| 11 | Refresh Atlas `bookings` collection | Booking document exists with the right `studentId` | ☐ |
| 12 | Reload the Netlify site | Login persists (JWT in `localStorage`) | ☐ |
| 13 | Cancel the booking | Status becomes `cancelled` in Atlas | ☐ |
| 14 | Log out | Redirected home; guest navbar | ☐ |

### The three-way proof

The single most convincing test is **step 6/9/11**: a change made in the browser appears in Atlas.
That only happens if **frontend → Render → Atlas** all work.

---

## Troubleshooting

### CORS errors in the browser console

```
Access to fetch at 'https://...onrender.com/api/...' from origin 'https://...netlify.app'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

**Cause:** the Netlify origin isn't in `CORS_ORIGINS`.
**Fix:** step 8 — add the exact origin (**no trailing slash**), save, wait for the redeploy.

Check what the server actually allows:

```bash
curl -i -X OPTIONS https://campus-resources-api.onrender.com/api/auth/login \
  -H "Origin: https://your-site.netlify.app" \
  -H "Access-Control-Request-Method: POST"
# Look for: access-control-allow-origin: https://your-site.netlify.app
```

No such header → the origin isn't matched.

### "Cannot reach the server" / network error in the UI

- The Render service may be **asleep** (free tier). Wait 30–60s and retry.
- Wrong URL in `frontend/js/config.js` (missing `/api`, or `http://` instead of `https://`).
- Check Render → **Logs** to see whether the request arrived at all.

### Mixed content blocked

```
Mixed Content: The page at 'https://...' was loaded over HTTPS, but requested an insecure resource 'http://...'
```

**Cause:** `config.js` still points at `http://` (usually `http://localhost:5000`).
**Fix:** use the `https://` Render URL.

### Render build fails: "no package.json found"

**Root Directory** isn't set. Set it to `Campus-Resource-Booking/backend`.

### Render starts then crashes: `[FATAL] Insecure configuration`

Your `JWT_SECRET` is missing, shorter than 32 characters, or still looks like a placeholder
(e.g. starts with `replace`, `changeme`, `your-`). Set a real one in Render → Environment.
This check is deliberate — see `backend/config/assertSecureConfig.js`.

### `MongoDB connection error: Authentication failed`

Password wrong, or contains unencoded special characters. Percent-encode `@ : / # ? %`
in the connection string (step 3).

### `MongoDB connection error: ... IP ... not whitelisted`

Add `0.0.0.0/0` in Atlas → Network Access (step 2b).

### Data appears but disappears on redeploy

You're not connected to Atlas — you may be hitting a local Mongo, or the DB name is missing from the
`MONGO_URI`, so it's writing to `test`. Check the `MongoDB Connected:` host in the Render logs.

### Netlify shows "Page not found"

**Publish directory** is wrong. It must be `Campus-Resource-Booking/frontend`.

### Login works, but data is missing after redeploying the backend

Changing `JWT_SECRET` invalidates all existing tokens. Users must log in again. That's expected.

---

## Security checklist

| Item | Where it lives | Committed? |
|---|---|---|
| `MONGO_URI` | `backend/.env` (local) + Render Environment | ❌ Never |
| `JWT_SECRET` | `backend/.env` (local) + Render Environment | ❌ Never |
| `CORS_ORIGINS` | Render Environment (not secret, but per-environment) | ❌ Never |
| Frontend API URL | `frontend/js/config.js` | ✅ Yes — it's public |

Before every push:

```bash
git status --short | grep -E "\.env$" && echo "STOP" || echo "OK: no .env staged"
git check-ignore -v backend/.env    # should print the matching .gitignore rule
```

- If a secret is ever committed, **rotate it immediately** — deleting the file in a later commit does
  not remove it from history. Change the Atlas password and generate a new `JWT_SECRET`.
- Use **different** `JWT_SECRET` values for local and production.
- Don't enable Atlas "Allow access from anywhere" beyond what you need; scope it to a database user
  with only `readWrite` on `campus_resource_booking` when you're done.
