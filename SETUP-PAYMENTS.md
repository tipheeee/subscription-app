# Switching on payments for Yanju

Do the steps in order. Use **Paystack test mode** first, so no real money moves while you check everything works.

**Never paste a secret key into a chat, into GitHub, or into the app files.** Secret keys go only into the Cloudflare "Secrets" boxes in Step 3.

---

## Step 1. Paystack account
1. Go to paystack.com and create an account.
2. Make sure the switch at the top says **Test mode**.
3. Open **Settings > API Keys & Webhooks**.
4. Copy the **Test Secret Key** (it starts with `sk_test_`). Keep it somewhere private for Step 3.

## Step 2. Supabase
1. Open your Supabase project, then **SQL Editor > New query**.
2. Open the file `supabase-payments.sql`, copy everything, paste it in, and tap **Run**. You should see "Success". (This creates the table that remembers each payment.)
3. Open **Project Settings > API**. Copy two things for Step 3:
   - the **Project URL** (looks like `https://xxxx.supabase.co`)
   - the **service_role** key. This one is very powerful. Treat it like a password. It must never go into config.js or GitHub.
4. Your **anon** key is the long public key already inside config.js.

### Also for invites (referrals)
Do the same with the file `supabase-referrals.sql`: SQL Editor > New query > paste > Run. It creates the two tables for the invite-a-friend system.

### Also for points
Do the same with the file `supabase-points.sql`. It creates the table that keeps each person's points. Until you run it, invites still work but the points card says points aren't switched on, and payments are never affected.

## Step 3. Cloudflare (the payments server)
1. Cloudflare dashboard > **Workers & Pages > Create > Create Worker**. Name it `yanju-payments`. Tap **Deploy**.
2. Tap **Edit code**. Delete everything in the editor. Open `worker-payments.js`, copy everything, paste it in, and tap **Deploy**.
3. Go to the Worker's **Settings > Variables and Secrets**. Add these five. Spelling must be exact:

| Name | Type | Value |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | Secret | your `sk_test_...` key |
| `SUPABASE_SERVICE_KEY` | Secret | the service_role key |
| `SUPABASE_URL` | Text | your Project URL |
| `SUPABASE_ANON_KEY` | Text | the anon key from config.js |
| `SITE_URL` | Text | your app address, starting with https:// and **no slash at the end** |

4. Tap **Deploy** again. Copy the Worker's address (it ends in `.workers.dev`).
5. **Check everything is set up right:** open your Worker address followed by `/api/pay/status` in your browser (for example `https://yanju-payments.yourname.workers.dev/api/pay/status`). It shows each setting as OK or says exactly which one is wrong. It never shows a secret. You want to see `"ready": true`, and `"points_table": "ok"` once you have run the points file.
6. Also open that address followed by `/api/pay/prices`. You should see a list of prices.

## Step 4. Tell Paystack where to send payment news
1. In Paystack: **Settings > API Keys & Webhooks**.
2. In **Test Webhook URL**, paste: `YOUR-WORKER-ADDRESS/api/pay/webhook` and save.
   Example: `https://yanju-payments.yourname.workers.dev/api/pay/webhook`

## Step 5. Connect the app
1. Upload the new app files to GitHub (the list is in the chat).
2. On GitHub, open `config.js`, tap the pencil to edit, and set `payApi` to your Worker address, with no slash at the end:
   `payApi: "https://yanju-payments.yourname.workers.dev",`
3. Commit. Wait for Cloudflare to redeploy your site.

## Step 6. Test with fake money
1. Open your app, **sign in** (payments need an account), go to **Plans**.
2. Choose Premium, 1 month, tap **Pay with Paystack**.
3. On the Paystack page, use a Paystack test card. Paystack lists its test cards in its docs (search "Paystack test cards"). The common one is `4084 0840 8408 4081`, any future expiry, CVV `408`, PIN `0000`, OTP `123456`.
4. You should land back on the Plans page with "Payment received", and "You are on Premium until ...".
5. Check the same account on another device or after a refresh. The plan should still be there.
6. Also try: the free trial (on a fresh account with a confirmed email), and **Buy 3 reports**, then open **Business report** and tap **Use 1 report credit**.

## Step 7. Go live
1. In Paystack, finish business verification (they will ask for your ID and bank details). Then switch to **Live mode**.
2. Copy the **Live Secret Key** (`sk_live_...`). In Cloudflare, replace the `PAYSTACK_SECRET_KEY` secret with it.
3. In Paystack, paste the same webhook address into the **Live Webhook URL**.
4. Make one real ₦1,000 payment yourself to check, and confirm the plan switches on.

## If something goes wrong
- **Paid, but plan didn't switch on:** wait a minute and refresh. The webhook usually fixes it by itself. If it doesn't, check Cloudflare > your Worker > **Logs**.
- **"Payments aren't switched on yet":** `payApi` in config.js is empty, or one of the five Cloudflare values is missing.
- **The Pay button says "Sign in again", or a settings message:** open `/api/pay/status` on your Worker address. It names the setting that is wrong. Fix it in Cloudflare (Settings > Variables and Secrets), tap Deploy, and try again.
- **Fees:** Paystack takes a small cut of each payment. Check their current rates against a ₦1,000 price.

---

# Logos for apps (Logo.dev)
This finds logos for apps the app does not already know. It is optional. Without it, unknown apps show a letter, as before.

1. Go to logo.dev and create a free account. Copy two keys from the dashboard:
   - the **publishable** key (starts with `pk_`)
   - the **secret** key (starts with `sk_`). Never paste it into chat, GitHub or the app files.
2. Cloudflare > your `yanju-payments` Worker > **Settings > Variables and Secrets**. Add:

| Name | Type | Value |
|---|---|---|
| `LOGO_DEV_PUBLISHABLE_KEY` | Secret | your `pk_...` key |
| `LOGO_DEV_SECRET_KEY` | Secret | your `sk_...` key |

3. Open the Worker's **Edit code**, replace everything with the new `worker-payments.js`, and tap **Deploy**.
4. Check: open your Worker address followed by `/api/pay/status`. You should see `"logos": "set"`.
5. Upload the new app files to GitHub. The page shows the "Logos provided by Logo.dev" credit in the footer; the free plan asks for it.
6. In the app, edit any subscription. You will see a **Website** box and a **Find logo** button.

Matching is careful on purpose: a logo is used on its own only when exactly one brand has that exact name. Otherwise the app shows a letter, and the person taps **Find logo** and picks the right one.
