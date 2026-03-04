import { Router } from 'express';
import Client from '../models/Client.js';

const router = Router();

// Dodo payments webhook mapping
router.post('/webhook', async (req, res) => {
    try {
        const event = req.body;

        // Verify Dodo signature here (omitted for scaffolding)

        if (event.type === 'subscription.created' || event.type === 'payment.succeeded') {
            const clientId = event.data.client_id; // Metadata passed during checkout
            if (clientId) {
                await Client.findOneAndUpdate(
                    { clientId },
                    { subscriptionStatus: 'pro' }
                );
            }
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

export default router;
