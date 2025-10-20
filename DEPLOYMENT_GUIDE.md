# 🚀 Wealth Vault Deployment Guide

Complete guide for deploying Wealth Vault with Supabase (Database), Render (Backend), and Vercel (Frontend).

---

## 📋 Prerequisites Checklist

- [ ] Supabase account created
- [ ] Render account created
- [ ] Vercel account created
- [ ] GitHub repository pushed
- [ ] Domain name (optional)

---

## Part 1: Supabase Setup (Database)

### Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign in with GitHub
3. Click **"New Project"**
4. Fill in:
   - **Name**: `wealth-vault-db`
   - **Database Password**: Generate strong password ⚠️ **SAVE THIS!**
   - **Region**: Choose closest to your users
   - **Plan**: Free tier
5. Click **"Create new project"** (takes ~2 minutes)

### Step 2: Get Database Connection String

1. Go to **Project Settings** (gear icon) → **Database**
2. Scroll to **"Connection string"** section
3. Select **"URI"** tab
4. Copy the connection string:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```
5. **Replace `[YOUR-PASSWORD]`** with your actual password

### Step 3: Enable Extensions

1. Go to **Database** → **Extensions**
2. Enable these extensions:
   - [x] `uuid-ossp` - for UUID generation
   - [x] `pgcrypto` - for encryption

### Step 4: Run Migrations to Supabase

```bash
# 1. Navigate to backend
cd backend

# 2. Activate virtual environment
source venv/bin/activate

# 3. Update .env with Supabase DATABASE_URL
# Edit backend/.env and change DATABASE_URL to:
DATABASE_URL=postgresql+asyncpg://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# 4. Run migrations
alembic upgrade head

# 5. Verify connection
python -c "from app.database.session import engine; import asyncio; print('✅ Connected to Supabase!')"
```

**✅ Supabase is ready!**

---

## Part 2: Render Deployment (Backend API)

### Step 1: Push Code to GitHub

```bash
# Make sure your code is pushed
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### Step 2: Create Render Web Service

1. Go to [https://render.com](https://render.com)
2. Sign in with GitHub
3. Click **"New +"** → **"Web Service"**
4. Connect your GitHub repository: `wealth-vault`
5. Configure:
   - **Name**: `wealth-vault-api`
   - **Region**: Same as Supabase
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free (or Starter $7/month for better performance)

### Step 3: Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"** and add these:

#### Required Variables:

```bash
PYTHON_VERSION=3.11.0
DATABASE_URL=postgresql+asyncpg://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
SECRET_KEY=<generate-with-openssl-rand-hex-32>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
DEBUG=False
CORS_ORIGINS=["https://your-app.vercel.app","http://localhost:3000"]
```

#### Optional Variables:

```bash
REDIS_URL=redis://localhost:6379/0
EXCHANGE_RATE_API_KEY=your-api-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
STRIPE_SECRET_KEY=your-stripe-secret
STRIPE_WEBHOOK_SECRET=your-webhook-secret
STRIPE_PUBLISHABLE_KEY=your-publishable-key
```

**To generate SECRET_KEY:**
```bash
openssl rand -hex 32
```

### Step 4: Deploy

1. Click **"Create Web Service"**
2. Wait for deployment (5-10 minutes)
3. Your API will be live at: `https://wealth-vault-api.onrender.com`
4. Test health endpoint: `https://wealth-vault-api.onrender.com/health`

### Step 5: Run Database Migrations on Render (Optional)

If you didn't run migrations locally, run them on Render:

1. Go to your Render service
2. Click **"Shell"** tab
3. Run:
   ```bash
   alembic upgrade head
   ```

**✅ Backend is deployed!**

---

## Part 3: Vercel Deployment (Frontend)

### Step 1: Create Environment Variables File

**Create `frontend/.env.production`:**

```bash
# API URL - Your Render backend URL
NEXT_PUBLIC_API_URL=https://wealth-vault-api.onrender.com

# Supabase (if using Supabase Storage/Auth)
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT-REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Google OAuth (if using)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id

# Stripe (if using)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
```

### Step 2: Deploy to Vercel

1. Go to [https://vercel.com](https://vercel.com)
2. Sign in with GitHub
3. Click **"Add New..."** → **"Project"**
4. Import your `wealth-vault` repository
5. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `.next` (auto-detected)

### Step 3: Add Environment Variables in Vercel

1. In project settings, go to **"Environment Variables"**
2. Add each variable from `.env.production`:

| Key | Value | Environment |
|-----|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://wealth-vault-api.onrender.com` | Production |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://[REF].supabase.co` | Production (optional) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key | Production (optional) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Your client ID | Production (optional) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Your publishable key | Production (optional) |

### Step 4: Deploy

1. Click **"Deploy"**
2. Wait for deployment (3-5 minutes)
3. Your app will be live at: `https://your-app.vercel.app`

### Step 5: Update CORS in Backend

1. Go back to Render
2. Update `CORS_ORIGINS` environment variable:
   ```
   ["https://your-app.vercel.app"]
   ```
3. Click **"Save Changes"** (will redeploy automatically)

**✅ Frontend is deployed!**

---

## Part 4: Post-Deployment Steps

### 1. Test the Full Stack

- [ ] Open your Vercel app: `https://your-app.vercel.app`
- [ ] Try to register a new account
- [ ] Try to login
- [ ] Create an income source
- [ ] Create an expense
- [ ] Check if data persists (refresh page)

### 2. Update Google OAuth (if using)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services** → **Credentials**
3. Edit your OAuth 2.0 Client ID
4. Add **Authorized redirect URIs**:
   ```
   https://your-app.vercel.app/api/auth/callback/google
   ```
5. Add **Authorized JavaScript origins**:
   ```
   https://your-app.vercel.app
   ```

### 3. Update Stripe Webhooks (if using)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers** → **Webhooks**
3. Add endpoint: `https://wealth-vault-api.onrender.com/api/v1/webhooks/stripe`
4. Select events to listen for
5. Copy webhook secret and update `STRIPE_WEBHOOK_SECRET` in Render

### 4. Setup Custom Domain (Optional)

#### For Frontend (Vercel):
1. Go to Vercel project → **Settings** → **Domains**
2. Add your domain: `app.yourcompany.com`
3. Follow DNS configuration instructions

#### For Backend (Render):
1. Go to Render service → **Settings** → **Custom Domain**
2. Add your API domain: `api.yourcompany.com`
3. Follow DNS configuration instructions
4. Update `NEXT_PUBLIC_API_URL` in Vercel to new domain

### 5. Enable SSL/HTTPS

Both Render and Vercel automatically provide SSL certificates. No action needed! ✅

---

## 🔧 Troubleshooting

### Backend Issues

**Issue: "Internal Server Error"**
- Check Render logs: Service → **Logs**
- Verify DATABASE_URL is correct
- Check if migrations ran: `alembic current`

**Issue: "CORS Error"**
- Verify `CORS_ORIGINS` in Render includes your Vercel URL
- Format: `["https://your-app.vercel.app"]` (with brackets and quotes)

**Issue: "Database connection failed"**
- Test Supabase connection locally first
- Verify password is correct (no special characters causing issues)
- Check if Supabase project is active

### Frontend Issues

**Issue: "Failed to fetch"**
- Verify `NEXT_PUBLIC_API_URL` is set correctly in Vercel
- Check if backend health endpoint works
- Open browser console for detailed error

**Issue: "Environment variables not working"**
- Redeploy after adding environment variables
- Variables starting with `NEXT_PUBLIC_` are required

### Database Issues

**Issue: "Relation does not exist"**
- Run migrations: `alembic upgrade head`
- Check current migration: `alembic current`
- View migration history: `alembic history`

---

## 📊 Monitoring & Maintenance

### Render Free Tier Limitations

⚠️ **Important**: Render free tier services:
- Spin down after 15 minutes of inactivity
- Take ~30 seconds to wake up on first request
- Consider upgrading to Starter ($7/month) for always-on service

### Supabase Free Tier Limitations

- 500 MB database size
- 2 GB bandwidth per month
- 50,000 monthly active users
- Upgrade to Pro ($25/month) if limits exceeded

### Vercel Free Tier Limitations

- 100 GB bandwidth per month
- Unlimited deployments
- Consider upgrading to Pro ($20/month) for team features

---

## 🎉 Deployment Complete!

Your Wealth Vault application is now live:

- **Frontend**: `https://your-app.vercel.app`
- **Backend API**: `https://wealth-vault-api.onrender.com`
- **Database**: Supabase PostgreSQL

### Next Steps:

1. Monitor application performance
2. Set up error tracking (e.g., Sentry)
3. Set up uptime monitoring (e.g., UptimeRobot)
4. Configure backups (Supabase automatic backups)
5. Add analytics (e.g., Google Analytics)

Need help? Check:
- Render docs: https://render.com/docs
- Vercel docs: https://vercel.com/docs
- Supabase docs: https://supabase.com/docs
