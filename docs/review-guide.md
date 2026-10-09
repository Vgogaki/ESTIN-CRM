# Reviewing the ESTIN CRM: a 30-minute guided tour

You're looking at the back office, trader portal and affiliate portal for a Cyprus-based trading **evaluation** firm: traders pay for a simulated account, a rules engine checks it against profit and loss limits, passing traders become "funded", and funded traders earn a share of simulated profit as real payouts. There is no live trading and no customer money in this copy.

**Everything here is fake demo data** (traders are `@demo.estin.test`). Click freely.

## Getting in
1. Open the address you were sent. A box asks for a username and password: use `reviewer` and the **site password** (sent separately).
2. Go to `/admin/login` on the same address and sign in with **your email and your admin password** (also sent separately).
3. Open **Your account** and turn on **two-factor**. Save the recovery codes.

The **Team** panel at the bottom of the left-hand menu shows who else is around ("Active now", "Active 12 min ago"). "Active" means they last did something, not that they are signed in; it refreshes about once a minute.

## The tour (Back office, left-hand menu)
1. **Pending tasks.** The system's to-do list, built automatically: a pass review (Chris), a KYC check (Elias), a funded trader with no verified KYC (Fiona), a breached trader awaiting an offer (Bianca), a support message (Alex).
2. **Traders**, then open a few:
   - **Chris:** passed the profit target. Advance him to the next phase and note the choice about resetting equity.
   - **Dana:** funded, KYC verified, with a €2,800 payout waiting. Approve or decline it in **Withdrawals**. The server refuses an approval if KYC isn't verified, or if you reviewed that trader's KYC yourself.
   - **Gus and Hana:** paid with the same card, so they're linked. See *Linked accounts* and the *Risk profile* card. Flags never block anything by themselves; an open high-severity flag blocks payout approval.
   - **Bianca:** breached; has a risk flag.
3. **Try the rules.** On a trader's page use **Manual override** (type a reason) to set equity below the loss limit and watch the account close itself.
4. **Challenge types.** Rules live on the product, not the account. Edit a live one and it creates a new version; existing accounts stay on the version they bought.
5. **Competitions** (Demo Cup): Gus has the best return but isn't ranked because he hasn't made enough trades. This is deliberate.
6. **Offers, Affiliates, Finance, Countries (empty by design; try the CSV upload), Support, Training, Email.**

## Seeing the trader and affiliate sides
- **Trader portal:** register at `/portal/register`. No email is really sent: read the verification link in **Back office → Email**. Then **Test tools → Grant test account** with your email, and sign in at `/portal`.
- **Affiliate portal:** **Affiliates → Demo Partner → Resend portal invite**, read the link in **Email**, set a password, sign in at `/affiliate/login`.

## What is deliberately not here yet
- **No trading platform:** equity is typed in by hand (the rules engine runs on it). Copy-trading detection waits on trade data.
- **No payment provider or payout rails:** orders arrive through the API; a payout can be approved but never marked paid.
- **No email delivery:** emails are recorded in Back office → Email.
- **Uploaded files are temporary** on this copy. **Test tools** is for demos only.
- Not yet independently security-reviewed. Admin two-factor exists but isn't compulsory yet. There is no audit-log viewer screen (the log is recorded and can't be edited).

Decisions already made and what is still open are in `docs/decisions.md` and `docs/deferred-items.md` in the repository.
