import './env.js';  // must be first — loads dotenv before any module reads process.env
import express    from 'express';
import cors       from 'cors';
import mongoose   from 'mongoose';
import cookieParser from 'cookie-parser';
import rateLimit  from 'express-rate-limit';

import authRoutes         from './routes/auth.routes.js';
import businessRoutes     from './routes/business.routes.js';
import chatbotRoutes      from './routes/chatbot.routes.js';
import knowledgeRoutes    from './routes/knowledge.routes.js';
import chatRoutes         from './routes/chat.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import resolutionRoutes   from './routes/resolution.routes.js';
import billingRoutes      from './routes/billing.routes.js';
import trialRoutes        from './routes/trial.routes.js';
import logoRoutes         from './routes/logo.routes.js';
// ⚠️  Webhooks MUST be registered BEFORE express.json()
import webhookRoutes      from './routes/webhook.routes.js';
// Legacy
import clientRoutes       from './routes/client.routes.js';
import paymentRoutes      from './routes/payment.routes.js';

const app  = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173'];

const corsOptions = {
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*'))
            return cb(null, true);
        cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
};

// ── Webhooks first (raw body required for signature verification) ──────
app.use('/api/webhooks', webhookRoutes);

// ── Standard middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ── Health check ───────────────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.status(200).json({
        status: 'operational', service: 'BeeBot API', version: '2.0.0',
        uptime: process.uptime(), timestamp: new Date().toISOString(),
    });
});

// ── Auth ───────────────────────────────────────────────────────────────
app.use('/api/auth',          cors(corsOptions), authRoutes);

// ── Core business APIs ─────────────────────────────────────────────────
app.use('/api/business',      cors(corsOptions), businessRoutes);
app.use('/api/chatbot',       cors(corsOptions), chatbotRoutes);
app.use('/api/chatbot/logo',  cors(corsOptions), logoRoutes);
app.use('/api/knowledge',     cors(corsOptions), knowledgeRoutes);
app.use('/api/conversations', cors(corsOptions), conversationRoutes);

// ── Resolutions + trial + billing ─────────────────────────────────────
app.use('/api/resolutions',   cors(corsOptions), resolutionRoutes);
app.use('/api/trial',         cors(corsOptions), trialRoutes);
app.use('/api/billing',       cors(corsOptions), billingRoutes);

// ── Public widget chat (dynamic CORS, rate-limited) ────────────────────
const chatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'Too many requests — please wait 15 minutes' },
    standardHeaders: true, legacyHeaders: false,
});

const chatCorsOptions = (req, cb) => {
    const origin    = req.headers.origin;
    const isDev     = process.env.NODE_ENV !== 'production';
    const isKnown   = origin && (allowedOrigins.includes(origin) || allowedOrigins.includes('*'));

    if (isKnown) {
        return cb(null, { origin, credentials: true, methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','x-api-key'] });
    }
    // External website embedding the widget — allow without credentials (uses x-api-key)
    return cb(null, { origin: origin || false, credentials: false, methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','x-api-key'] });
};

app.use('/api/chat', cors(chatCorsOptions), chatLimiter, chatRoutes);

// ── Legacy ─────────────────────────────────────────────────────────────
app.use('/api/clients',  cors(corsOptions), clientRoutes);
app.use('/api/payments', cors(corsOptions), paymentRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── MongoDB ────────────────────────────────────────────────────────────
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('[DB] Connected to MongoDB'))
        .catch(err => console.error('[DB] Connection error:', err));
}

app.listen(PORT, () => console.log(`[Server] Running on port ${PORT}`));
