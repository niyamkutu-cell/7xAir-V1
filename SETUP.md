# 7xAir Beginner-Friendly Setup Guide (Supabase + GitHub + Vercel)

Follow these steps in order to connect your database, screenshot storage, admin permissions, automated Windows builds, and live Vercel website.

---

## Step 1: Set Up Supabase (Accounts, Screenshots & Release Metadata)

1. Go to [supabase.com](https://supabase.com), sign in, and click **New Project**.
2. Name it `7xair`, pick a strong database password, choose the closest region, and wait ~2 minutes for it to finish provisioning.
3. In the left sidebar, open **SQL Editor** → **New Query**.
4. Open `supabase/schema.sql` from this repository, copy the entire file, paste it into the SQL Editor, and click **Run**.
   - This creates the `profiles`, `screenshots`, and `releases` tables, enables Row-Level Security (RLS), and creates the public `screenshots` Storage bucket (2 MB PNG/JPG/WebP limit).
5. Go to **Project Settings** → **API** and copy these three values (you will paste them into Vercel in Step 3):
   - **Project URL** (`SUPABASE_URL`)
   - **anon public key** (`SUPABASE_ANON_KEY`)
   - **service_role secret key** (`SUPABASE_SERVICE_ROLE_KEY`) — *never share this publicly*.

---

## Step 2: Push to GitHub & Enable Automated Windows EXE Releases

1. Create a new repository on [github.com](https://github.com) named `7xair`.
2. From your local project folder, run:
   ```bash
   git add .
   git commit -m "Initial 7xAir release"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/7xair.git
   git push -u origin main
   ```
3. Every push to `main` automatically runs `.github/workflows/ci.yml` (checks, tests, TypeScript build, and Rust `cargo check`).
4. To build and publish a Windows 10/11 NSIS `.exe` installer automatically:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
   GitHub Actions (`.github/workflows/release.yml`) will build the Windows installer, compute its SHA-256 checksum, and attach **only** the `.exe` installer + `SHA256SUMS.txt` to GitHub Releases.

---

## Step 3: Deploy the Website to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your `7xair` GitHub repository.
2. Under **Root Directory**, click **Edit** and select **`apps/website`**.
3. Open **Environment Variables** and add the variables from `apps/website/.env.example`:
   - `SUPABASE_URL` = your Supabase Project URL
   - `SUPABASE_ANON_KEY` = your Supabase anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service_role key
   - `SEVENXAIR_ADMIN_EMAILS` = your email address (e.g. `you@example.com`)
   - `SEVENXAIR_SESSION_SECRET` = any random 32+ character string
   - `GITHUB_REPO` = `YOUR_USERNAME/7xair`
4. Click **Deploy**. Your website and `/api/*` serverless endpoints will go live immediately.

---

## Step 4: Claim Admin Permissions & Publish Your First Release

1. Open your live Vercel URL and click **Log In / Sign Up** → **Sign Up** using the exact email you placed in `SEVENXAIR_ADMIN_EMAILS`.
2. Because your email matches `SEVENXAIR_ADMIN_EMAILS`, your account is automatically assigned `role = 'admin'`.
   - *(Optional)* You can also promote another user anytime in Supabase **Table Editor** → `profiles` → change `role` from `user` to `admin`, or via the `/api/admin` endpoint.
3. Once signed in as an admin, you can:
   - Moderate or delete screenshots in the Showcase Gallery (`/api/admin` → `delete_screenshot`).
   - Publish new Windows `.exe` release metadata and SHA-256 checksums (`/api/admin` → `publish_release`) — note that standalone `.jar` URLs are blocked at both the API and database levels.
   - Update `apps/website/public/releases/latest.json` (or point the launcher updater at your live release endpoint) so existing Windows launchers receive automatic background updates.
