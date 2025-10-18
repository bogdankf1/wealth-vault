# Wealth Vault

Ultimate personal finance management platform with modular architecture, AI-powered insights, and tier-based monetization.

## Overview

Wealth Vault is a comprehensive personal finance platform built with a modern tech stack:

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: FastAPI (Python 3.11+), PostgreSQL, Redis, Celery
- **Authentication**: NextAuth.js v5 with Google OAuth
- **State Management**: RTK Query + Zustand
- **Deployment**: Vercel (frontend) + Render/Railway (backend)

## Project Structure

```
wealth-vault/
├── backend/                 # FastAPI backend
│   ├── alembic/            # Database migrations
│   ├── app/
│   │   ├── api/v1/         # API endpoints
│   │   ├── core/           # Core configuration
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   └── scripts/        # Utility scripts
│   ├── requirements.txt    # Python dependencies
│   └── .env.example        # Environment variables template
├── frontend/               # Next.js frontend
│   ├── app/                # Next.js App Router pages
│   ├── components/         # React components
│   ├── lib/                # Utilities and stores
│   ├── hooks/              # Custom React hooks
│   └── .env.local.example  # Frontend env template
└── .claudeproject          # Project documentation
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+
- Redis

### Backend Setup

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Create PostgreSQL database**:
   ```bash
   createdb wealth_vault_dev
   # Or using psql:
   # psql -U postgres
   # CREATE DATABASE wealth_vault_dev;
   ```

5. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and update:
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `SECRET_KEY` - Generate a secure secret key (min 32 characters)
   - `GOOGLE_CLIENT_ID` - Get from Google Cloud Console
   - `GOOGLE_CLIENT_SECRET` - Get from Google Cloud Console
   - `EXCHANGE_RATE_API_KEY` - (Optional) Get from https://www.exchangerate-api.com/ for real-time exchange rates

6. **Run database migrations**:
   ```bash
   alembic upgrade head
   ```

7. **Seed initial data (tiers, features)**:
   ```bash
   python -m app.scripts.seed_data
   ```

8. **Start development server**:
   ```bash
   uvicorn app.main:app --reload
   ```

   Backend will run on http://localhost:8000
   API docs available at http://localhost:8000/docs

### Frontend Setup

1. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.local.example .env.local
   ```

   Edit `.env.local` and update:
   - `GOOGLE_CLIENT_ID` - Same as backend
   - `GOOGLE_CLIENT_SECRET` - Same as backend
   - `NEXTAUTH_SECRET` - Generate random string (openssl rand -base64 32)

4. **Start development server**:
   ```bash
   npm run dev
   ```

   Frontend will run on http://localhost:3000

### Redis Setup

**Option 1: Local Redis**
```bash
# macOS (with Homebrew)
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Verify Redis is running
redis-cli ping  # Should return: PONG
```

**Option 2: Docker**
```bash
docker run -d -p 6379:6379 redis:alpine
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
5. Configure OAuth consent screen
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - Your production URL (later)
7. Copy Client ID and Client Secret to both backend and frontend `.env` files

## Development Commands

### Backend

```bash
# Start dev server
cd backend
uvicorn app.main:app --reload

# Run database migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Seed database
python -m app.scripts.seed_data

# Run tests (Phase 1+)
pytest

# Lint code
ruff check .

# Format code
black .
```

### Frontend

```bash
# Start dev server
cd frontend
npm run dev

# Build for production
npm run build

# Type check
npm run type-check  # or: tsc --noEmit

# Lint
npm run lint

# Format
npm run format  # or: prettier --write .

# Add shadcn/ui component
npx shadcn@latest add [component-name]
```

## Phase 0 Deliverables ✓

- [x] Backend FastAPI project structure
- [x] PostgreSQL database with SQLAlchemy (async)
- [x] Alembic migrations setup
- [x] Redis connection configured
- [x] Celery background tasks setup
- [x] Base models (User with roles and tiers)
- [x] Error handling and logging
- [x] API versioning (/api/v1/)
- [x] CORS configuration
- [x] Next.js 14 with App Router
- [x] TypeScript with strict mode
- [x] Tailwind CSS + shadcn/ui
- [x] RTK Query + Zustand
- [x] Theme system (light/dark/system)
- [x] NextAuth.js v5 with Google OAuth
- [x] JWT validation in FastAPI
- [x] Protected route middleware
- [x] Login page UI
- [x] Tier and role system (starter/growth/wealth)
- [x] Permission decorators (@admin_only, @require_feature)
- [x] useFeatureAccess hook
- [x] FeatureGate component
- [x] Environment configuration

## Database Schema

### Tables Created in Phase 0:
- `users` - User accounts with OAuth, roles, and tier
- `tiers` - Subscription tiers (starter/growth/wealth)
- `features` - Platform features
- `tier_features` - Tier-to-feature mappings with limits

## Tech Stack Details

### Backend
- **FastAPI** - Modern Python web framework
- **SQLAlchemy 2.0** - Async ORM
- **PostgreSQL** - Primary database
- **Redis** - Caching and message broker
- **Celery** - Background task processing
- **Alembic** - Database migrations
- **Pydantic** - Data validation

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety (strict mode)
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Component library
- **RTK Query** - API data fetching
- **Zustand** - Lightweight state management
- **NextAuth.js v5** - Authentication
- **Framer Motion** - Animations
- **Recharts** - Data visualization

## Code Quality Standards

### TypeScript Rules
- ✅ Strict mode enabled
- ✅ NO `any` types allowed
- ✅ All components properly typed
- ✅ Props interfaces defined
- ✅ 0 ESLint errors/warnings
- ✅ 0 TypeScript errors
- ✅ Consistent Prettier formatting

### Python Rules
- ✅ Type hints on all functions
- ✅ Async/await for database ops
- ✅ Pydantic schemas for validation
- ✅ Docstrings on all functions
- ✅ Black formatting
- ✅ Ruff linting

## Multi-Currency Support ✓

The application now supports multiple currencies with real-time exchange rates:

- **Supported Currencies**: USD, EUR, UAH (more can be added via admin panel)
- **Real-time Rates**: Integration with exchangerate-api.com
- **Smart Caching**: 1-hour database cache + fallback to last known rates
- **Conversion**: Automatic conversion in all widgets and charts
- **User Preferences**: Set preferred and display currencies in Settings

### Exchange Rate Setup

The app works without an API key (uses database fallback), but for real-time rates:

1. Get free API key from https://www.exchangerate-api.com/
2. Add to `.env`: `EXCHANGE_RATE_API_KEY=your_key_here`
3. Rates auto-update hourly (1,500 requests/month on free tier)

**See [EXCHANGE_RATE_SETUP.md](./EXCHANGE_RATE_SETUP.md) for detailed setup and testing instructions.**

## Next Steps (Phase 1)

Phase 1 will implement the first complete module (Income Tracking) as a template for all future modules:

- [ ] Module registry system
- [ ] Event bus for inter-module communication
- [ ] Income Tracking module (full CRUD)
- [ ] Reusable component library
- [ ] Dashboard with widgets

## Troubleshooting

### Backend won't start
- Check PostgreSQL is running: `pg_isready`
- Check Redis is running: `redis-cli ping`
- Verify DATABASE_URL in `.env`
- Ensure migrations are applied: `alembic upgrade head`

### Frontend build errors
- Run `npm run type-check` to find TypeScript errors
- Run `npm run lint` to find ESLint issues
- Ensure all dependencies installed: `npm install`

### OAuth not working
- Verify Google OAuth credentials in both .env files match
- Check redirect URIs in Google Cloud Console
- Ensure http://localhost:3000/api/auth/callback/google is added

## License

Proprietary - All rights reserved

## Support

For issues or questions, please create an issue in the repository.