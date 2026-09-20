# Getting API Keys (for the trading agents)

Follow this to switch the agents from "no data" to **live paper trading**
(real market prices, fake money). Do this after deploying with
[`DEPLOYMENT.md`](./DEPLOYMENT.md). All keys go into the server's `.env` file —
**never commit them to git**.

---

## A. Alpaca — US stocks (required for the US-equity fleet)

Alpaca's market data needs a key even in paper mode, so the US-stock agents
stay inactive until you add these.

1. Go to **<https://alpaca.markets/>** and create a free account.
2. Log in. Make sure you are on the **Paper Trading** account (there's a
   Live/Paper switch in the dashboard — keep it on **Paper**). Paper accounts
   start with $100,000 of virtual money.
3. On the dashboard **Home**, find the **API Keys** box → **Generate New Key**
   (or "View"/"Regenerate").
4. Copy the **Key ID** and the **Secret Key**. ⚠️ The secret is shown **once** —
   copy it now.
5. Put them in `.env`:
   ```ini
   ALPACA_API_KEY=<your Key ID>
   ALPACA_API_SECRET=<your Secret Key>
   ALPACA_BASE_URL=https://paper-api.alpaca.markets
   ALPACA_DATA_URL=https://data.alpaca.markets
   ```
6. Restart the stack: `docker compose up -d --build`.
7. In the dashboard's **Trading Agents** panel, the Alpaca venue should now show
   **"market open"** or **"market closed"** instead of *"keys not set"*.

---

## B. Binance — crypto (OPTIONAL)

Paper crypto trading works with **no keys** (public market data + simulated
fills). Only add testnet keys if you want to exercise Binance's real *testnet*
order path (still fake money).

1. Go to **<https://testnet.binance.vision/>**.
2. Click **Log In with GitHub** and authorize.
3. Click **Generate HMAC_SHA256 Key**. Give it a label.
4. Copy the **API Key** and **Secret Key**.
5. Put them in `.env`:
   ```ini
   BINANCE_API_KEY=<your API Key>
   BINANCE_API_SECRET=<your Secret Key>
   BINANCE_BASE_URL=https://testnet.binance.vision
   ```
   > Testnet balances are fake and Binance resets them periodically — that's
   > normal.

---

## After adding keys

1. `docker compose up -d --build`
2. Log in as the owner account, open **Trading Agents**.
3. Click **▶ Start trading**, then toggle the agents you want **on**.
4. **Crypto agents trade immediately** (24/7). **US-stock agents trade during
   US market hours** (Mon–Fri, 9:30 AM–4:00 PM New York time) and stay idle
   otherwise — this is normal, not a bug.
5. Watch positions, P/L and the per-agent equity charts update live.

Use **⛔ Kill all** at any time to halt everything instantly.

---

## Going live with real money (later)

Only after you've watched the strategies behave in paper. See
[`DEPLOYMENT.md` §9](./DEPLOYMENT.md#9-going-live-real-money): set
`TRADING_MODE=live` + `LIVE_CONFIRM=I_UNDERSTAND_THE_RISKS`, use **live** keys
and live base URLs, and start with small allocations. Automated trading can and
does lose money — there is no guaranteed profit.

---

## Security reminders

- Keep keys only in `.env` on the server — never in git, chat, or screenshots.
- For **live** keys, enable **trading** permission but **disable withdrawals**.
- Rotate/regenerate keys if they're ever exposed.
