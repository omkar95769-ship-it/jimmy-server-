// Jimmy's own backend.
// - Keeps your ANTHROPIC_API_KEY on the server only (never sent to the browser/app).
// - Tracks each user's plan (free/premium) and a simple daily message count.
// - Free users get FREE_DAILY_LIMIT messages/day; premium users get PREMIUM_DAILY_LIMIT
//   (0 = unlimited). Wiring up real payments later just means setting plan='premium'
//   for a user after a successful Razorpay/Stripe payment — see the /api/admin/set-plan
//   stub below for where that goes.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || '20', 10);
const PREMIUM_DAILY_LIMIT = parseInt(process.env.PREMIUM_DAILY_LIMIT || '0', 10); // 0 = unlimited
const ADMIN_KEY = process.env.ADMIN_KEY || ''; // set this in .env before using /api/admin/*

// ---------- tiny JSON "database" (swap for real Postgres/Supabase once you have users) ----------
const DB_PATH = path.join(__dirname, 'users.json');
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch { return {}; }
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
function getUser(db, userId) {
  if (!db[userId]) db[userId] = { plan: 'free', usage: {} };
  return db[userId];
}

// ---------- usage check ----------
function checkAndIncrement(userId) {
  const db = loadDB();
  const user = getUser(db, userId);
  const day = todayKey();
  const used = user.usage[day] || 0;
  const limit = user.plan === 'premium' ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT;

  if (limit > 0 && used >= limit) {
    return { ok: false, plan: user.plan, used, limit };
  }
  user.usage[day] = used + 1;
  saveDB(db);
  return { ok: true, plan: user.plan, used: used + 1, limit };
}

// ---------- routes ----------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, model: MODEL });
});

// Main chat proxy. Body: { userId: "some-stable-id", messages: [{role:"user", content:"hi"}] }
app.post('/api/chat', async (req, res) => {
  const userId = String(req.body.userId || req.ip || 'anonymous');
  const messages = Array.isArray(req.body.messages) ? req.body.messages : null;
  if (!messages || !messages.length) {
    return res.status(400).json({ error: 'messages array is required' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server has no ANTHROPIC_API_KEY set. Copy .env.example to .env and fill it in.' });
  }

  const gate = checkAndIncrement(userId);
  if (!gate.ok) {
    return res.status(429).json({
      error: 'Daily free limit reached. Upgrade to premium for more.',
      plan: gate.plan,
      used: gate.used,
      limit: gate.limit
    });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages
      })
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data.error ? data.error.message : 'Upstream error' });
    }
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    res.json({ text, plan: gate.plan, used: gate.used, limit: gate.limit, raw: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Check a user's current plan/usage (frontend uses this to show "X/20 messages left today" etc.)
app.get('/api/usage/:userId', (req, res) => {
  const db = loadDB();
  const user = getUser(db, req.params.userId);
  saveDB(db);
  const used = user.usage[todayKey()] || 0;
  const limit = user.plan === 'premium' ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT;
  res.json({ plan: user.plan, used, limit });
});

// ---------- admin: flip a user to premium (call this from your payment webhook) ----------
// Protect it with a secret header so randoms can't upgrade themselves for free.
// Example (after Razorpay confirms payment success):
//   fetch(SERVER_URL + '/api/admin/set-plan', {
//     method: 'POST',
//     headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY },
//     body: JSON.stringify({ userId, plan: 'premium' })
//   });
app.post('/api/admin/set-plan', (req, res) => {
  if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Invalid or missing admin key' });
  }
  const { userId, plan } = req.body;
  if (!userId || !['free', 'premium'].includes(plan)) {
    return res.status(400).json({ error: 'userId and plan ("free" or "premium") are required' });
  }
  const db = loadDB();
  const user = getUser(db, userId);
  user.plan = plan;
  saveDB(db);
  res.json({ ok: true, userId, plan });
});

app.listen(PORT, () => {
  console.log('Jimmy server running on port ' + PORT + ' (model: ' + MODEL + ')');
});
