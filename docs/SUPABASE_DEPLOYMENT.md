# Connecting GridPulse to Supabase & Free Hosting

## 1. Important Architecture Note: Supabase vs. Railway

- **Railway** was hosting both the **Laravel Docker container** (PHP web server + background telemetry simulator) and the database.
- **Supabase** is a **Managed PostgreSQL Database & BaaS**. Supabase does **not** host PHP/Docker containers directly.
- **The Solution**: 
  - **Database**: Use **Supabase** (100% free hosted PostgreSQL database).
  - **API Server**: Run the Laravel API Docker container on **[Render.com](https://render.com)** (100% free Docker web service tier, just like Railway) or **[Koyeb.com](https://www.koyeb.com)**, or run locally.

---

## 2. Step 1: Create Your Free Supabase Database

1. Sign up / log in to [supabase.com](https://supabase.com).
2. Click **New Project**:
   - **Name**: `gridpulse`
   - **Database Password**: Choose a strong password and **remember it**.
   - **Region**: Choose the closest region to you.
3. Once the project finishes provisioning (about 1-2 minutes):
   - Go to **Project Settings** (gear icon in sidebar) → **Database**.
   - Scroll down to **Connection parameters** / **Connection string**.
   - Select **URI** mode (Transaction pooler or Direct connection).
   - Copy the URI. It will look like:
     ```
     postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
     ```
   - Replace `[YOUR-PASSWORD]` with your real database password.

---

## 3. Step 2 (Optional): Initialize Tables Directly in Supabase

You can initialize all tables and demo users immediately via the Supabase web dashboard:
1. Open your project on Supabase.
2. In the left sidebar, click **SQL Editor** → **New query**.
3. Open [`docs/supabase_setup.sql`](file:///d:/StartUp/GridPulse-main/GridPulse-main/docs/supabase_setup.sql) in this repository, copy everything, and paste it into the SQL editor.
4. Click **Run**.
5. All tables (`users`, `sites`, `assets`, `telemetry_readings`, `alerts`, `work_orders`, `audit_logs`) and demo accounts are created!

---

## 4. Step 3: Deploy the Backend API to Render (Free Docker Hosting)

Render provides free hosting for Docker containers:

1. Push your code to your GitHub repository (or use your existing repository).
2. Sign up / log in at [render.com](https://render.com).
3. Click **New +** → **Web Service**.
4. Connect your GitHub repository.
5. Settings:
   - **Name**: `gridpulse-api`
   - **Language / Runtime**: `Docker`
   - **Root Directory**: leave as `.` (or `api`)
   - **Instance Type**: `Free`
6. Under **Environment Variables**, add:
   - `DB_URL`: *Paste your Supabase connection string from Step 1*
   - `APP_KEY`: Generate one or use any base64 32-byte key (e.g. `base64:u6tqEfZ8W7gN5oQ2X1yV4bM8kL0pS3aD6jH9cR4vF1w=`)
   - `CLIENT_ORIGIN`: `http://localhost:3000,http://localhost:5173,https://*.vercel.app`
   - `SEED_DEMO`: `true`
   - `APP_ENV`: `production`
   - `APP_DEBUG`: `false`
7. Click **Create Web Service**.
8. Render will build the Docker container. Once deployed, Render will give you a public URL like:
   `https://gridpulse-api.onrender.com`

---

## 5. Step 4: Connect Your Frontend to the New API

1. In your local frontend, create or update `client/.env`:
   ```env
   VITE_API_URL=https://gridpulse-api.onrender.com
   ```
2. If your frontend is also deployed on **Vercel**:
   - Go to Vercel → Project Settings → **Environment Variables**.
   - Update `VITE_API_URL` to `https://gridpulse-api.onrender.com`.
   - Trigger a **Redeploy**.

3. Open your web app and sign in with:
   - **Admin**: `admin@gridpulse.io` / `Admin12345`
   - **Engineer**: `engineer@gridpulse.io` / `Engineer12345`
   - **Viewer**: `viewer@gridpulse.io` / `Viewer12345`
