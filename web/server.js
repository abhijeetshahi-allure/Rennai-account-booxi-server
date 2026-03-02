import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

const BOOXI_BASE_URL = process.env.BOOXI_BASE_URL || 'https://api.booxi.com/booking/v1';
const BOOXI_PARTNER_KEY = process.env.BOOXI_PARTNER_KEY || '';
const BOOXI_MERCHANT_ID = process.env.BOOXI_MERCHANT_ID || '';

// CORS for Customer Account UI extension (runs in web worker with null origin)
// Required: Access-Control-Allow-Origin: * per Shopify docs
app.use(cors({
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  credentials: false,
}));
// Ensure CORS headers on every response (including errors)
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
  next();
});

// Health check - hit /health or /apps/booxi/health to verify backend is reachable
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/apps/booxi/health', (req, res) => res.json({ ok: true, message: 'Booxi proxy is running' }));

// GET /apps/booxi/client?email=...
app.get('/apps/booxi/client', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({error: 'email query param required'});
    }
    if (!BOOXI_PARTNER_KEY || !BOOXI_MERCHANT_ID) {
      return res.status(500).json({error: 'BOOXI_PARTNER_KEY and BOOXI_MERCHANT_ID must be set'});
    }

    const url = `${BOOXI_BASE_URL}/client?email=${encodeURIComponent(email)}&merchantId=${encodeURIComponent(BOOXI_MERCHANT_ID)}`;
    const response = await fetch(url, {
      headers: {'Booxi-PartnerKey': BOOXI_PARTNER_KEY},
    });

    const data = await response.json();
    const clientId = data?.clients?.[0]?.id ?? null;
    res.json({clientId, clients: data?.clients ?? []});
  } catch (err) {
    console.error('Booxi client error:', err);
    res.status(500).json({error: err.message || 'Failed to fetch client'});
  }
});

// GET /apps/booxi/bookings?clientId=...&from=...&to=...
app.get('/apps/booxi/bookings', async (req, res) => {
  try {
    const {clientId, from, to} = req.query;
    if (!clientId || !from || !to) {
      return res.status(400).json({error: 'clientId, from, and to query params required'});
    }
    if (!BOOXI_PARTNER_KEY) {
      return res.status(500).json({error: 'BOOXI_PARTNER_KEY must be set'});
    }

    const url = `${BOOXI_BASE_URL}/booking?clientId=${encodeURIComponent(clientId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const response = await fetch(url, {
      headers: {'Booxi-PartnerKey': BOOXI_PARTNER_KEY},
    });

    const data = await response.json();
    res.json({bookings: data?.bookings ?? []});
  } catch (err) {
    console.error('Booxi bookings error:', err);
    res.status(500).json({error: err.message || 'Failed to fetch bookings'});
  }
});

app.listen(PORT, () => {
  console.log(`Booxi proxy server on port ${PORT}`);
});
