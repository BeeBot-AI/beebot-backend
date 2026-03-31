import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.routes.js';
import businessRoutes from './routes/business.routes.js';
import chatbotRoutes from './routes/chatbot.routes.js';
import knowledgeRoutes from './routes/knowledge.routes.js';
import chatRoutes from './routes/chat.routes.js';
import conversationRoutes from './routes/conversation.routes.js';

// Legacy routes kept for backward compat
import clientRoutes from './routes/client.routes.js';
import paymentRoutes from './routes/payment.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173'];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
            callback(null, true);
        } else {
            // Check if it's the chat route getting pinged from an external site
            callback(null, false); // Handled dynamically below
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
};

app.use(express.json());
app.use(cookieParser());

// Auth
app.use('/api/auth', cors(corsOptions), authRoutes);

// New onboarding + business system (strictly corsOptions restricted)
app.use('/api/business', cors(corsOptions), businessRoutes);
app.use('/api/chatbot', cors(corsOptions), chatbotRoutes);
app.use('/api/knowledge', cors(corsOptions), knowledgeRoutes);
app.use('/api/conversations', cors(corsOptions), conversationRoutes);

// Public widget chat route
// 1. Allow any origin to hit the chat formulation explicitly.
// 2. Apply rate limiter (e.g. max 20 requests per 15 minutes per IP)
const chatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 requests per `window` (here, per 15 minutes)
    message: { error: 'Too many chat requests from this IP, please try again after 15 minutes' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Dynamic CORS middleware for /api/chat route.
//
// WHY THIS LOGIC:
// - Browser preflight (OPTIONS) requests NEVER carry cookies.
// - So checking req.headers.cookie to detect credentials is wrong —
//   the preflight always looks cookie-less, causing origin:'*' to be
//   returned, which browsers reject when the real POST uses credentials:include.
// - Fix: decide CORS purely based on the Origin header.
//   If origin is in the allowed list → always return that specific origin
//   with credentials:true (safe for both preflight + actual request).
//   If origin is unknown → allow only in dev with no-credentials wildcard.

const chatCorsOptions = (req, callback) => {
    const origin = req.headers.origin;
    const isDevelopment = process.env.NODE_ENV !== 'production';

    const allowedOriginsList = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : isDevelopment
            ? ['http://localhost:5173', 'http://localhost:5000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000']
            : [];

    const isKnownOrigin = origin && (allowedOriginsList.includes(origin) || allowedOriginsList.includes('*'));

    if (isKnownOrigin) {
        // ✅ Known origin (e.g. our dashboard): always return specific origin + allow credentials.
        // This works correctly for BOTH the OPTIONS preflight and the real POST.
        console.log(`[CORS] Allowing known origin: ${origin}`);
        return callback(null, {
            origin: origin,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
        });
    }

    if (!origin) {
        // No origin header = curl, mobile apps, server-to-server — allow without credentials
        console.log('[CORS] No origin header (server-to-server or curl), allowing without credentials');
        return callback(null, {
            origin: false,
            credentials: false,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
        });
    }

    // Unknown external origin (a client's website embedding our widget)
    if (isDevelopment) {
        // In development, allow any external origin for easy widget testing
        // but without credentials (the widget uses x-api-key, not cookies)
        console.log(`[CORS] Dev: allowing unknown external origin without credentials: ${origin}`);
        return callback(null, {
            origin: origin,
            credentials: false,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
        });
    } else {
        // In production, allow any external origin for the widget (API-key authenticated)
        console.log(`[CORS] Production: allowing external widget origin without credentials: ${origin}`);
        return callback(null, {
            origin: origin,
            credentials: false,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
        });
    }
};

app.use('/api/chat', cors(chatCorsOptions), chatLimiter, chatRoutes);

// Legacy
app.use('/api/clients', cors(corsOptions), clientRoutes);
app.use('/api/payments', cors(corsOptions), paymentRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'BeeBot Backend' });
});

if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('Connected to MongoDB'))
        .catch(err => console.error('MongoDB connection error:', err));
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
