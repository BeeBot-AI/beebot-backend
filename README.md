# BeeBot Backend — Express API

The BeeBot backend is a Node.js/Express API that handles authentication, bot configuration, chat routing, knowledge management, and conversation storage for the BeeBot SaaS platform.

**Live URL:** https://beebot-backend.onrender.com

---

## Architecture

```
HTTP Request
     │
     ▼
Express Router (routes/)
     │
     ▼
Middleware (auth, rate-limit, CORS)
     │
     ▼
Controller Logic (inside routes)
     │
     ├──► MongoDB (via Mongoose models)
     │
     └──► Python AI Service (POST /chat forwarded to FastAPI)
```

---

## Environment Variables

| Variable               | Description                                                       |
|------------------------|-------------------------------------------------------------------|
| `MONGO_URI`            | MongoDB connection string (Atlas or self-hosted)                  |
| `JWT_SECRET`           | Secret key for signing JWT tokens                                 |
| `PYTHON_SERVICE_URL`   | URL of the FastAPI AI service                                     |
| `FRONTEND_URL`         | Frontend origin for CORS (e.g. https://beebot-ai.vercel.app)     |
| `ALLOWED_ORIGINS`      | Comma-separated list of allowed CORS origins                      |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID for social login                           |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret                                        |
| `NODE_ENV`             | `development` or `production`                                     |
| `PORT`                 | Server port (default: 5000)                                       |

---

## Local Setup

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your values

# 3. Start development server
npm run dev
```

The server starts at `http://localhost:5000`.

---

## API Route Groups

| Route Prefix          | Purpose                                                           |
|-----------------------|-------------------------------------------------------------------|
| `GET /`               | Root health check — returns service status, version, uptime JSON |
| `GET /health`         | Simple health ping                                                |
| `/api/auth`           | Register, login, logout, Google OAuth, token refresh             |
| `/api/business`       | Create/update business profile (onboarding step 1)               |
| `/api/chatbot`        | CRUD for chatbot config (name, tone, primary_color, etc.)        |
| `/api/chat`           | Public widget chat endpoint — rate-limited, proxies to AI service|
| `/api/knowledge`      | Upload files/URLs to the knowledge base                          |
| `/api/conversations`  | Retrieve conversation history in the dashboard                   |

---

## MongoDB Models

| Model              | Purpose                                                          |
|--------------------|------------------------------------------------------------------|
| `User`             | Authenticated users (email/password or Google OAuth)             |
| `Business`         | Business profile linked to a user                                |
| `Chatbot`          | Bot config: name, tone, primary_color, welcome message, starters |
| `ApiKey`           | API keys for widget authentication via `x-api-key` header        |
| `KnowledgeSource`  | Uploaded files and URLs in the knowledge base                    |
| `Conversation`     | Chat conversation sessions grouped by visitor ID                 |
| `Message`          | Individual messages within a conversation                        |

---

## Deployment on Render.com

1. Connect your GitHub repo to Render.
2. Create a new **Web Service** pointing to the `backend/` directory.
3. Set **Build Command:** `npm install`
4. Set **Start Command:** `node src/server.js`
5. Add all environment variables in the Render dashboard.
6. Deploy — Render auto-deploys on every push to `main`.
