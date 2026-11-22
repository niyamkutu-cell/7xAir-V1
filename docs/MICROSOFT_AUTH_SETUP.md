# 7xAir Microsoft Authentication Setup Guide

7xAir uses official Microsoft OAuth 2.0 Browser Sign-In (Authorization Code + PKCE with local `http://localhost` callback) as its primary login, with Device Code flow available as a fallback (`consumers` tenant -> Xbox Live -> XSTS -> Minecraft Services -> Entitlements -> Java Profile). **No Microsoft Client Secret is used or distributed in the launcher.**

> **Account Separation:** Microsoft authentication is strictly for verifying Minecraft: Java Edition ownership and launching Minecraft. It is completely separate from 7xAir website accounts and does not grant or represent any 7xAir website role or subscription.

---

## Step 1 — Create a Microsoft App Registration

1. Open the [Microsoft Azure Portal — App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).
2. Click **New registration**.
3. Set:
   - **Name:** `7xAir Launcher`
   - **Supported account types:** **Personal Microsoft accounts only** *(required for Minecraft / Xbox Live `consumers` OAuth)*
   - **Redirect URI:** Select **Public client/native (mobile & desktop)** and set **`http://localhost`** *(required for 1-click browser sign-in; Microsoft automatically accepts any local port on `http://localhost`)*.
4. Click **Register**.
5. On the Overview page, copy the **Application (client) ID** (a UUID like `12345678-1234-1234-1234-123456789abc`).
6. Go to **Authentication** (left sidebar) -> **Advanced settings** -> set **Allow public client flows** to **Yes** -> click **Save**.
7. **Do NOT create a Client Secret.** Desktop public clients must never ship a client secret.

---

## Step 2 — Configure `SEVENXAIR_MSA_CLIENT_ID`

### A. Production Windows `.exe` Builds (GitHub Actions)
1. Open your GitHub repository -> **Settings -> Secrets and variables -> Actions**.
2. Click **New repository secret**:
   - **Name:** `SEVENXAIR_MSA_CLIENT_ID`
   - **Secret:** paste your Application (client) ID UUID.
3. Push a new release tag (e.g. `git tag v0.2.1 && git push origin v0.2.1`). GitHub Actions automatically embeds `SEVENXAIR_MSA_CLIENT_ID` into the compiled Windows launcher binary at build time.

### B. Local Development
Copy `.env.example` to `.env` (at the repository root or `apps/launcher/.env`) and set:
```env
SEVENXAIR_MSA_CLIENT_ID=your-application-client-id-uuid
```
Or set it in your terminal before running `npm run tauri:dev`:
```powershell
$env:SEVENXAIR_MSA_CLIENT_ID = "your-application-client-id-uuid"
npm run tauri:dev
```

### C. Local Machine Override (Without Rebuilding)
You can also place a JSON file at `%APPDATA%\7xAir\msa-config.json`:
```json
{
  "clientId": "your-application-client-id-uuid"
}
```
