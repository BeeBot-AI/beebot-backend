/**
 * Billing routes
 *
 * POST /api/billing/checkout      — create Polar checkout session (card)
 * POST /api/billing/upi-setup     — create Cashfree UPI order
 * GET  /api/billing/portal        — Polar customer portal URL
 * GET  /api/billing/invoices      — list invoices for logged-in client
 */
import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import Business from '../models/Business.js';
import Invoice  from '../models/Invoice.js';
import { getPolar } from '../lib/polar.js';

const router = express.Router();

/* ── Polar card checkout ─────────────────────────────────────────────── */
router.post('/checkout', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

        const polar = await getPolar();
        if (!polar) return res.status(503).json({ success: false, message: 'Billing not configured' });

        const session = await polar.checkouts.create({
            productId:     process.env.POLAR_PRODUCT_ID,
            customerEmail: req.user.email,
            metadata:      { clientId: String(business._id) },
            successUrl:    `${process.env.FRONTEND_URL}/dashboard?checkout_success=true`,
        });

        res.json({ success: true, checkoutUrl: session.url });
    } catch (err) {
        console.error('[Billing] Checkout error:', err);
        res.status(500).json({ success: false, message: 'Could not create checkout session' });
    }
});

/* ── Polar customer portal ───────────────────────────────────────────── */
router.get('/portal', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business?.polarCustomerId)
            return res.status(400).json({ success: false, message: 'No Polar subscription found' });

        const polar = await getPolar();
        if (!polar) return res.status(503).json({ success: false, message: 'Billing not configured' });

        const portalSession = await polar.customerSessions.create({
            customerId: business.polarCustomerId,
        });
        res.json({ success: true, portalUrl: portalSession.customerPortalUrl });
    } catch (err) {
        console.error('[Billing] Portal error:', err);
        res.status(500).json({ success: false, message: 'Could not create portal session' });
    }
});

/* ── Cashfree UPI setup ──────────────────────────────────────────────── */
router.post('/upi-setup', protect, async (req, res) => {
    try {
        if (!process.env.CASHFREE_CLIENT_ID || !process.env.CASHFREE_SECRET) {
            return res.status(503).json({ success: false, message: 'UPI payments not configured' });
        }

        const business = await Business.findOne({ userId: req.user._id });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

        const { Cashfree } = await import('cashfree-pg');
        Cashfree.XClientId     = process.env.CASHFREE_CLIENT_ID;
        Cashfree.XClientSecret = process.env.CASHFREE_SECRET;
        Cashfree.XEnvironment  = process.env.NODE_ENV === 'production'
            ? Cashfree.Environment.PRODUCTION
            : Cashfree.Environment.SANDBOX;

        const orderRequest = {
            order_id:       `beebot_${business._id}_${Date.now()}`,
            order_amount:   1.00,        // ₹1 auth charge — refunded after verification
            order_currency: 'INR',
            customer_details: {
                customer_id:    String(business._id),
                customer_email: req.user.email,
                customer_phone: req.body.phone || '9999999999',
            },
            order_meta: {
                return_url: `${process.env.FRONTEND_URL}/billing/upi-success?order_id={order_id}`,
                notify_url: `${process.env.BACKEND_URL || process.env.FRONTEND_URL}/api/webhooks/cashfree`,
            },
            order_note: 'BeeBot UPI mandate setup',
        };

        const response = await Cashfree.PGCreateOrder('2023-08-01', orderRequest);
        res.json({ success: true, paymentSessionId: response.data.payment_session_id });
    } catch (err) {
        console.error('[Billing] UPI setup error:', err);
        res.status(500).json({ success: false, message: 'Could not create UPI order' });
    }
});

/* ── Invoices ────────────────────────────────────────────────────────── */
router.get('/invoices', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

        const invoices = await Invoice.find({ clientId: business._id })
            .sort({ createdAt: -1 })
            .limit(24);
        res.json({ success: true, invoices });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;
