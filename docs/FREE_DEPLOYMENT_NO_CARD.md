# 100% Free Backend Deployment (NO Credit Card Required)

This guide shows you how to deploy your GridPulse backend for free without needing a credit or debit card, using **Koyeb** or **Zeabur**, and connect it to your live Vercel frontend (`https://grid-pulse-ruby.vercel.app`).

---

## Your Credentials Checklist

Keep these exact environment variables ready to copy-paste:

| Variable | Value |
|---|---|
| `DB_URL` | `postgresql://postgres.zvrlxhwgmpqpbvzzadrc:Hamdanalicnic@123@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres` |
| `APP_KEY` | `base64:X8vB7b5Y2e1lK4rQ0mP9sT3wV6aD8jH2cF5nU1xZ7oE=` |
| `CLIENT_ORIGIN` | `https://grid-pulse-ruby.vercel.app,http://localhost:3000` |
| `APP_NAME` | `GridPulse` |
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `SEED_DEMO` | `false` |

*(Note: `SEED_DEMO` is set to `false` because we already populated your Supabase database with all sites, assets, demo accounts, and 68,000+ telemetry readings!)*

---

## Option 1: Koyeb (Recommended — Fastest & Easiest)

1. Go to **[app.koyeb.com](https://app.koyeb.com)** and click **Continue with GitHub**.
2. Click **Create Service**.
3. Choose **GitHub** as the deployment source.
4. Select repository: **`Hamdanali3/GridPulse`** (branch: `main`).
5. **Build configuration**:
   * Builder: **Dockerfile** (Koyeb auto-detects `Dockerfile` at root).
6. **Instance type**:
   * Select **Eco (Free)** ($0.00/mo).
7. **Port configuration**:
   * Ensure port is set to **`8000`** (Protocol: HTTP).
8. **Environment variables**:
   * Add each variable from the checklist above (`DB_URL`, `APP_KEY`, `CLIENT_ORIGIN`, `APP_NAME`, `APP_ENV`, `APP_DEBUG`, `SEED_DEMO`).
9. Click **Deploy**.
10. Koyeb will build the Docker container and give you a public URL like:
    `https://gridpulse-hamdanali.koyeb.app`

---

## Option 2: Zeabur (Alternative — No Card Needed)

1. Go to **[zeabur.com](https://zeabur.com)** and sign in with **GitHub**.
2. Click **Create Project**.
3. Click **Deploy New Service** → **Git** → Select **`Hamdanali3/GridPulse`**.
4. Zeabur automatically detects the `Dockerfile`.
5. In the service settings, go to **Variables** and paste the environment variables from the checklist above.
6. Under **Networking**, click **Generate Domain** to get a free `https://<name>.zeabur.app` URL.

---

## Connecting Your Vercel Frontend (`grid-pulse-ruby.vercel.app`)

Once you have your new public backend URL from Koyeb or Zeabur:

1. Open **[vercel.com](https://vercel.com)** and click on your **`grid-pulse-ruby`** project.
2. Go to **Settings** → **Environment Variables**.
3. Look for **`VITE_API_URL`**:
   * If it already exists, click **Edit** and replace the old Railway URL with your new Koyeb/Zeabur URL (e.g. `https://gridpulse-hamdanali.koyeb.app`).
   * If it does not exist, click **Add Variable**:
     * Key: `VITE_API_URL`
     * Value: `https://your-backend-url.koyeb.app` (no trailing slash).
4. Go to the **Deployments** tab on Vercel.
5. Click the three dots `...` on the latest deployment and click **Redeploy**.
6. When Vercel finishes deploying, visit **[https://grid-pulse-ruby.vercel.app/login](https://grid-pulse-ruby.vercel.app/login)**.
7. Click any demo account (e.g. **Admin** `admin@gridpulse.io`) and click **Sign in**.
8. You're logged in!
