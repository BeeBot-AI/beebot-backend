import { Server } from 'socket.io';

let io;

/**
 * Initialise Socket.io on the given HTTP server.
 * Allows all origins — auth is handled at the application level.
 */
export function initSocket(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
        // Allow long-polling as fallback for environments that block WebSockets
        transports: ['websocket', 'polling'],
    });

    io.on('connection', (socket) => {
        // ── Widget visitor joins their conversation room ──────────────────
        socket.on('widget:join', ({ conversationId }) => {
            if (!conversationId) return;
            socket.join(`conv_${conversationId}`);
            socket.data.role = 'visitor';
            socket.data.conversationId = conversationId;
        });

        // ── Dashboard agent joins the business notification room ──────────
        // Gives them awareness of ALL conversations for their business.
        socket.on('dashboard:join', ({ businessId }) => {
            if (!businessId) return;
            socket.join(`business_${businessId}`);
            socket.data.role = 'agent';
            socket.data.businessId = businessId;
        });

        // ── Dashboard agent joins a specific conversation room ────────────
        // Called when the agent opens a conversation thread.
        socket.on('dashboard:join_conv', ({ conversationId }) => {
            if (!conversationId) return;
            socket.join(`conv_${conversationId}`);
        });

        // ── Dashboard agent leaves a specific conversation room ───────────
        // Called when the agent navigates away from a thread.
        socket.on('dashboard:leave_conv', ({ conversationId }) => {
            if (!conversationId) return;
            socket.leave(`conv_${conversationId}`);
        });

        // ── Agent typing indicator → forward to widget ───────────────────
        socket.on('agent:typing', ({ conversationId, isTyping }) => {
            if (!conversationId) return;
            socket.to(`conv_${conversationId}`).emit('agent:typing', { isTyping });
        });
    });

    return io;
}

/**
 * Returns the Socket.io instance.
 * Returns null (rather than throwing) so callers can guard gracefully.
 */
export function getIO() {
    return io || null;
}
