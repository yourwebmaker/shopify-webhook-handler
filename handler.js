const crypto = require('crypto');

const OFFER_ID = 16;
const EVENT_MAP = {
    '53136310075734': 'bundle-1x-300g',
    '53136310108502': 'bundle-3x-300g',
    '53136310141270': 'bundle-5x-300g',
    '53136310174038': 'bundle-1x-500g',
    '53136310206806': 'bundle-3x-500g',
    '53136310239574': 'bundle-5x-500g',
    '53452564201814': 'sub-300g-one-time',
    '53452564332886': 'sub-300g-casual-8wk',
    '53452564300118': 'sub-300g-steady-6wk',
    '53452564267350': 'sub-300g-glow-4wk',
    '53452564234582': 'sub-300g-elite-2wk',
    '53452564365654': 'sub-500g-one-time',
    '53452564496726': 'sub-500g-casual-8wk',
    '53452564463958': 'sub-500g-steady-6wk',
    '53452564431190': 'sub-500g-glow-4wk',
    '53452564398422': 'sub-500g-elite-2wk',
};

app.post('/webhooks/shopify/orders-paid', express.raw({ type: 'application/json' }), async (req, res) => {
    // 1. Verify the webhook signature
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const digest = crypto
        .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
        .update(req.body)
        .digest('base64');

    if (digest !== hmac) {
        console.error('Webhook signature mismatch');
        return res.status(401).send('Unauthorized');
    }

    // 2. Parse the order
    const order = JSON.parse(req.body);

    // 3. Get ef_id from note_attributes
    const efIdAttr = (order.note_attributes || []).find(a => a.name === 'ef_id');
    if (!efIdAttr?.value) {
        console.error(`Order ${order.id}: missing ef_id attribute`);
        return res.status(200).send('OK'); // Still 200 so Shopify doesn't retry
    }
    const efId = efIdAttr.value;

    // 4. Build conversions from line items
    const conversions = [];
    for (const item of order.line_items || []) {
        const variantId = String(item.variant_id);
        const eventId = EVENT_MAP[variantId];
        if (!eventId) continue;

        const amount = parseFloat(item.price) * item.quantity;
        conversions.push({ eventId, amount });
    }

    if (!conversions.length) {
        return res.status(200).send('OK');
    }

    // 5. Fire Everflow conversions
    for (const { eventId, amount } of conversions) {
        try {
            await fireEverflowConversion({
                offer_id: OFFER_ID,
                adv1: eventId,
                amount,
                transaction_id: efId,
            });
        } catch (err) {
            console.error('Everflow conversion failed:', err);
        }
    }

    res.status(200).send('OK');
});

async function fireEverflowConversion(data) {
    // Everflow's server-to-server conversion endpoint
    const params = new URLSearchParams({
        offer_id: data.offer_id,
        adv1: data.adv1,
        amount: data.amount,
        transaction_id: data.transaction_id,
    });
    const response = await fetch(`https://www.jh5th1trk.com/serving/conversion?${params}`);
    if (!response.ok) throw new Error(`Everflow responded with ${response.status}`);
    return response.json();
}