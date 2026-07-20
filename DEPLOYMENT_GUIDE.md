# Vercel Deployment & Setup Guide

This guide provides step-by-step instructions to successfully deploy your **Prompt & Document Vault** application to Vercel, configure your cloud database environment variables, and verify that the client-to-cloud synchronization functions correctly.

---

## ⚡ Dual-Mode Hybrid Architecture (Full-Stack & Serverless Fallback)

To provide maximum versatility and guarantee 100% uptime, the application has been engineered with a **Dual-Mode Hybrid Architecture**:
1. **Persistent Server Mode (Docker, VPS, Railway)**: The application leverages the built-in Express.js backend (`server.ts`) to handle local JSON files, API routes, and full-stack utilities.
2. **Serverless Static Mode (Vercel, Netlify, Cloudflare Pages)**: When deployed on serverless platforms like Vercel where persistent Node servers are unsupported, the client-side React code **automatically detects** that the backend is unreachable. It immediately triggers a **transparent client-side fallback**, connecting directly to your Supabase tables for all authentication, reading, and CRUD writing operations!

This guarantees that your Vercel deployment is **fully operational** without encountering the `"Connection to server failed"` error.

---

## 📋 Prerequisites

Before proceeding, ensure you have:
1. **A Vercel Account** (Free hobby tier or Pro, linked to your GitHub, GitLab, or Bitbucket).
2. **A Supabase Project** with the required database schemas provisioned (`prompts`, `prompt_versions`, and `markdown_docs` tables).
3. **Your API Keys**:
   - `SUPABASE_URL` & `SUPABASE_ANON_KEY` (Found in your Supabase Project under **Settings > API**).
   - `GEMINI_API_KEY` (If you are proxying server-side AI actions or utilizing full-stack Gemini capabilities).

---

## 🚀 Step 1: Push Your Project to GitHub / GitLab

Vercel deploys directly from your Git repository to enable continuous integration (CI/CD):
1. Create a new repository on GitHub (e.g., `prompt-document-vault`).
2. Commit your project files (including the newly generated `vercel.json` and `DEPLOYMENT_GUIDE.md`).
3. Push your branch to GitHub:
   ```bash
   git init
   git remote add origin https://github.com/your-username/prompt-document-vault.git
   git branch -M main
   git add .
   git commit -m "feat: Add Supabase client offline sync and database status indicators"
   git push -u origin main
   ```

---

## 📦 Step 2: Import Project on Vercel

1. Log in to your [Vercel Dashboard](https://vercel.com).
2. Click **Add New...** in the top right corner and select **Project**.
3. Authenticate with your Git provider and select your repository (`prompt-document-vault`) from the list.
4. Click **Import**.

---

## ⚙️ Step 3: Build & Output Settings

On the **Configure Project** page, ensure your build settings match the Vite standards:
- **Framework Preset**: Detects **Vite** automatically. (If not, select **Vite** or **Other**).
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Root Directory**: `./` (leave empty/default)

---

## 🔐 Step 4: Environment Variables Configuration

In the **Environment Variables** section on Vercel, expand the form and add the following keys to bind client-side and server-side configurations.

| Variable Name | Value | Purpose |
| :--- | :--- | :--- |
| **`VITE_SUPABASE_URL`** | `https://your-project.supabase.co` | Used by the React client-side Supabase client (`src/lib/supabase.ts`) to connect to your database. |
| **`VITE_SUPABASE_ANON_KEY`** | `eyJhbGciOiJIUzI1NiIsIn...` | Public client key to authenticate and authorize CRUD requests to the database tables. |
| **`SUPABASE_URL`** | `https://your-project.supabase.co` | Backend database connection string for Express router APIs. |
| **`SUPABASE_ANON_KEY`** | `eyJhbGciOiJIUzI1NiIsIn...` | Backend authorization token. |
| **`GEMINI_API_KEY`** | `AIzaSy...` | API secret key to power AI Assistant chat and smart RAG searches server-side. |

> ⚠️ **Important**: Always use the prefix `VITE_` for any environment variable you want Vite to inject into your browser bundle. Non-prefixed keys will remain secure on the server.

---

## 🔀 Step 5: Single Page Application (SPA) Routing

Vercel is pre-configured via the root `vercel.json` file. This file specifies rewrite rules that solve the common "refresh 404" problem on Single Page Applications (SPAs).

### Why `vercel.json` is Included:
- **Client-Side Routing**: React Router or your local tab router uses browser history APIs. When a user manually refreshes a deep link on Vercel (such as `/export` or `/prompts`), Vercel searches for a physical folder or file at that path on the server, resulting in a **404 Page Not Found**.
- **The Solution**: The `vercel.json` file tells Vercel's edge network to capture any navigation requests that do not match static assets and redirect them seamlessly to `/index.html`, where your React app handles the route client-side.

---

## 🛠️ Troubleshooting & Support

### 1. Database Status Widget displays "Offline / Unreachable"
- **Cause**: The client cannot ping Supabase, or your project API keys are invalid.
- **Solution**: Open your browser Developer Tools (F12) and inspect the **Network** tab for requests to `/api/db/status`. Verify that your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` match your Supabase project dashboard exactly.

### 2. Build fails with "module not found" or "vite: not found"
- **Solution**: Clear your Vercel build cache. Go to **Project Settings > Deployments**, select your deployment, click the three dots, and choose **Redeploy with Clean Cache**.

---

## ✅ Post-Deployment Verification Checklist

Once Vercel reports **"Deployment Successful"**, verify your vault by performing these three checks:
1. **Check Dashboard Widget**:
   - Navigate to the **System Dashboard** tab.
   - Look for the **Database Engine** status line. It should show a glowing green dot: **Supabase Active & Connected**.
2. **Execute Local Data Migration**:
   - Open the **Import/Export Hub** tab.
   - Click **Migrate Local Data**. This triggers a POST to `/api/db/migrate` which takes any local JSON file structures and synchronizes them to Supabase in batches.
3. **Queue Offline Edits**:
   - In the **Two-Way Cloud & Offline Synchronization** panel, click **+ Mock Prompt** and **+ Mock Document** to populate your queue.
   - Choose a Conflict Strategy (e.g. **Latest Write Wins**).
   - Click **Push to Cloud** and watch the real-time progress bar synchronize the entries to your Supabase cloud tables.
