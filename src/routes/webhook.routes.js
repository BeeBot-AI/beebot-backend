/**
 * Webhook routes — MUST be registered BEFORE express.json() middleware.
 * Both Polar and Cashfree require the raw request body for signature verification.
 */
import express from 'express';
import crypto  from 'crypto';
import Business from '../models/Business.js';
import Invoice  from '../models/Invoice.js';

const router = express.Router();

/* ══════════════════════════════════════════════════════════════════════
   POLAR WEBHOOK  — POST /api/webhooks/polar
   Register this URL in polar.sh Dashboard → Settings → Webhooks
════════════════════════════════════════════════════════════════════════ */
router.post('/polar', express.raw({ type: 'application/json' }), async (req, res) => {
    // Respond immediately (Polar times out after 10 s)
    res.status(202).send('');

    setImmediate(async () => {
        try {
            const { validateEvent, WebhookVerificationError } = await import('@polar-sh/sdk/webhooks');
            const event = validateEvent(
                req.body,
                req.headers,
                process.env.POLAR_WEBHOOK_SECRET || ''
            );

            switch (event.type) {
                case 'subscription.created':
                case 'subscription.active':
                    await Business.findOneAndUpdate(
                        { polarCustomerId: event.data.customerId },
                        {
                            subscriptionStatus:  'active',
                            polarSubscriptionId: event.data.id,
                            isTrialActive:       false,
                        }
                    );
                    break;

                case 'subscription.updated':
                    await Business.findOneAndUpdate(
                        { polarSubscriptionId: event.data.id },
                        { subscriptionStatus: event.data.status }
                    );
                    break;

                case 'subscription.revoked':
                case 'subscription.canceled':
                    await Business.findOneAndUpdate(
                        { polarSubscriptionId: event.data.id },
                        { subscriptionStatus: 'cancelled' }
                    );
                    break;

                case 'order.paid': {
                    const clientId = event.data.metadata?.clientId;
                    if (clientId) {
                        await Invoice.findOneAndUpdate(
                            {
                                clientId,
                                billingPeriod: new Date().toISOString().slice(0, 7),
                            },
                            {
                                polarOrderId:  event.data.id,
                                amountINR:     event.data.amount / 100, // paise → rupees
                                status:        'paid',
                                paymentMethod: 'card',
                            },
                            { upsert: true, new: true }
                        );
                    }
                    break;
                }

                default:
                    break;
            }
        } catch (err) {
            const { WebhookVerificationError } = await import('@polar-sh/sdk/webhooks').catch(() => ({}));
            if (WebhookVerificationError && err instanceof WebhookVerificationError) {
                console.error('[Polar Webhook] Invalid signature');
            } else {
                console.error('[Polar Webhook] Processing error:', err);
            }
        }
    });
});

/* ══════════════════════════════════════════════════════════════════════
   CASHFREE WEBHOOK  — POST /api/webhooks/cashfree
   Register in Cashfree Dashboard → Webhooks
════════════════════════════════════════════════════════════════════════ */
router.post('/cashfree', express.raw({ type: 'application/json' }), async (req, res) => {
    res.status(200).send('');

    setImmediate(async () => {
        try {
            // Verify Cashfree HMAC-SHA256 signature
            const body      = req.body.toString('utf8');
            const signature = req.headers['x-webhook-signature'];
            const timestamp = req.headers['x-webhook-timestamp'];
            const secret    = process.env.CASHFREE_SECRET || '';

            const signedPayload = `${timestamp}${body}`;
            const expected      = crypto
                .createHmac('sha256', secret)
                .update(signedPayload)
                .digest('base64');

            if (expected !== signature) {
                console.error('[Cashfree Webhook] Invalid signature');
                return;
            }

            const event = JSON.parse(body);
            if (event.type !== 'PAYMENT_SUCCESS_WEBHOOK') return;

            const orderId  = event.data?.order?.order_id || '';   // beebot_<clientId>_<ts>
            const clientId = orderId.split('_')[1];
            if (!clientId) return;

            await Business.findByIdAndUpdate(clientId, {
                subscriptionStatus: 'active',
                isTrialActive:      false,
                paymentMethod:      'upi',
            });

            await Invoice.findOneAndUpdate(
                { clientId, billingPeriod: new Date().toISOString().slice(0, 7) },
                {
                    cashfreeOrderId: orderId,
                    status:          'paid',
                    paymentMethod:   'upi',
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error('[Cashfree Webhook] Processing error:', err);
        }
    });
});

export default router;
