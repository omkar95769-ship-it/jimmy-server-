# Jimmy Server

Jimmy ka apna backend — tumhari Claude API key yahi par rehti hai (browser/app me kabhi nahi jaati),
aur har user ka free/premium plan + daily usage yahi track karta hai.

## Local me chalana

```
cd server
npm install
cp .env.example .env
```

`.env` kholo aur apni asli key daalo:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Phir:

```
npm start
```

Server `http://localhost:3000` pe chalega. Check karo: `http://localhost:3000/api/health`

## Endpoints

- `POST /api/chat` — body: `{ "userId": "any-stable-id", "messages": [{"role":"user","content":"hi"}] }`
  Jimmy ka web/Android/Linux build isi endpoint ko call karega, direct Anthropic API ko nahi.
- `GET /api/usage/:userId` — abhi tak kitne messages use hue, aur plan kya hai.
- `POST /api/admin/set-plan` — kisi user ko premium banana (header `x-admin-key` chahiye, `.env` me `ADMIN_KEY` set karo).
  Yeh woh jagah hai jaha payment webhook (Razorpay/Stripe) hit karega jab payment success ho.

## Free vs Premium

`.env` me `FREE_DAILY_LIMIT` aur `PREMIUM_DAILY_LIMIT` set karo (0 = unlimited). Naya user by default
`plan: "free"` pe start hota hai (`users.json` me store hota hai — chhote scale ke liye theek hai,
growth hone par isko Postgres/Supabase me badal dena).

## Deploy karna (free/cheap hosting)

1. [Render](https://render.com) ya [Railway](https://railway.app) pe account banao.
2. Naya "Web Service" banao, is `server/` folder ko (ya pure GitHub repo ko) connect karo.
3. Build command: `npm install`, Start command: `npm start`.
4. Environment variables wahi daalo jo `.env.example` me hain (`ANTHROPIC_API_KEY` sabse zaroori).
5. Deploy hone ke baad jo URL mile (jaise `https://jimmy-server.onrender.com`), usko Jimmy ke frontend
   (web/Android/Linux build) me "server URL" ki jagah daal do.

## Agla step: real payments

Abhi `/api/admin/set-plan` ek manual switch hai. Jab Razorpay/Stripe subscription lagaoge, unka
"payment success" webhook isi endpoint ko call karega — poora loop automatic ho jaayega:
user payment karega → webhook `/api/admin/set-plan` ko hit karega → uska plan 'premium' ho jaayega →
agli hi `/api/chat` request se unlimited/zyada limit mil jaayegi.
