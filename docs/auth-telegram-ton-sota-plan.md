# BlockDeal Auth: Telegram Mini App + TON SOTA Plan

## Official Baseline

Telegram Mini App identity is based on `Telegram.WebApp.initData`. The client must send the raw `initData` query string to the backend, and the backend must validate the `hash` with HMAC-SHA-256 using the bot token-derived secret. Telegram explicitly warns not to trust `initDataUnsafe` for server decisions.

Source: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

Telegram also supports OpenID Connect with Authorization Code Flow and PKCE for non-Mini-App web login. This is useful for future public web or admin flows, but it is not the primary auth path inside the Mini App.

Source: https://core.telegram.org/bots/telegram-login

TON integrations should use TON Connect. TON docs describe it as the standard wallet connection protocol and the mandatory connection protocol for Telegram Mini Apps that integrate with TON.

Source: https://docs.ton.org/ecosystem/ton-connect/overview

Wallet ownership must be verified with `ton_proof` on the backend before a wallet address is trusted. The backend checks timestamp, domain, payload/nonce, signature, and public key.

Source: https://docs.ton.org/v3/guidelines/ton-connect/verifying-signed-in-users

## Target Architecture

Telegram is the primary identity provider. TON wallet is a verified credential attached to that Telegram user.

```text
Telegram Mini App
  -> POST /api/auth/telegram { initData }
Backend
  -> validate Telegram initData hash
  -> reject stale auth_date
  -> upsert user by telegram_user_id
  -> create BlockDeal session
  -> return HttpOnly session cookie + /api/me payload

Mini App
  -> GET /api/ton/proof-payload
  -> TON Connect request with ton_proof payload
  -> POST /api/ton/connect { account, proof }
Backend
  -> validate session
  -> validate nonce, domain, timestamp, signature
  -> bind wallet to current user
```

For BlockDeal rooms, participants should move from ephemeral `socket.id` identity to authenticated user identity. Socket id remains transport presence only. Room access must also be authorized through membership or invite tokens; a valid Telegram session alone is not enough to join a deal.

Security audit companion: `docs/auth-telegram-ton-security-audit.md`.

## Data Model

Add these tables to `server/storage/schema.sql`:

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT,
  photo_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_auth_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE ton_wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  public_key TEXT,
  wallet_state_init TEXT,
  verified_at TEXT NOT NULL,
  last_proof_at TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  UNIQUE (chain, address),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE auth_nonces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  nonce_hash TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE room_invites (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  intended_telegram_user_id TEXT,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE agreement_signatures (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  ton_wallet_id TEXT,
  agreement_hash TEXT NOT NULL,
  signed_at TEXT NOT NULL,
  proof_type TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (ton_wallet_id) REFERENCES ton_wallets(id) ON DELETE SET NULL,
  UNIQUE (room_id, user_id, agreement_hash)
);

CREATE TABLE anchor_attempts (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ton_wallet_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  expected_payload_hash TEXT NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL,
  submitted_at TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (ton_wallet_id) REFERENCES ton_wallets(id) ON DELETE CASCADE
);
```

Update `participants` later to preserve authenticated signer identity:

```sql
ALTER TABLE participants ADD COLUMN user_id TEXT;
ALTER TABLE participants ADD COLUMN telegram_user_id TEXT;
ALTER TABLE participants ADD COLUMN ton_wallet_id TEXT;
ALTER TABLE participants ADD COLUMN signed_at TEXT;
ALTER TABLE participants ADD COLUMN joined_at TEXT;
```

## Backend Modules

Add focused modules rather than expanding `server.ts`:

- `server/auth/telegramInitData.ts`
  - parse raw query string
  - build Telegram data-check-string
  - derive secret with `HMAC_SHA256(bot_token, "WebAppData")`
  - compare hash with timing-safe compare
  - parse `user`
  - enforce `auth_date` max age

- `server/auth/session.ts`
  - create opaque random session token
  - store only `sha256(token)`
  - set `bd_session` HttpOnly with `Secure` in HTTPS production
  - default to `SameSite=Lax`; use `SameSite=None` only if Telegram embedding or deployment proves it is required
  - define idle TTL, absolute TTL, revocation, and session rotation on Telegram re-auth
  - provide Express middleware `requireSession`

- `server/auth/csrf.ts`
  - protect cookie-authenticated state-changing routes
  - require JSON content type, a custom header, and Origin/Referer validation
  - add Fetch Metadata checks where compatible

- `server/auth/users.ts`
  - upsert Telegram user
  - normalize Telegram id as string because Telegram ids can exceed 32-bit integer range

- `server/auth/rateLimit.ts`
  - rate-limit Telegram auth, TON proof generation, wallet connect, room joins, signing, and anchoring

- `server/ton/tonProof.ts`
  - generate one-time nonce
  - validate proof timestamp and app domain
  - assemble `ton-proof-item-v2/` message
  - verify Ed25519 signature
  - atomically consume nonce bound to `user_id`, `session_id`, `purpose`, `domain`, and expiry
  - derive/verify wallet address and public key from `walletStateInit`, with optional trusted on-chain fallback later

- `server/rooms/invites.ts`
  - create high-entropy invite tokens using `crypto.randomBytes`
  - store only token hashes
  - validate invite role, max uses, expiry, revocation, and optional intended Telegram user id

- `server/rooms/signatures.ts`
  - replace mutable `toggle_sign` semantics with append-only agreement signatures
  - store immutable `agreement_hash`, signer identity, proof type, and `signed_at`

- `server/ton/anchors.ts`
  - create server-authorized transaction intents
  - keep submitted transaction hashes as `pending`
  - verify transaction contents on-chain before marking an anchor as verified

## HTTP API

```text
POST /api/auth/telegram
Body: { initData: string }
Response: { user, wallet?, expiresAt }
Side effect: sets bd_session cookie

GET /api/me
Response: { user, wallets, session }

POST /api/auth/logout
Side effect: revokes session and clears cookie
CSRF: required

GET /api/ton/proof-payload
Requires: session
Response: { payload, expiresAt }

POST /api/ton/connect
Requires: session
Body: { account, proof }
Response: { wallet }
CSRF: required

POST /api/ton/disconnect
Requires: fresh session
Body: { walletId }
Response: { ok: true }
CSRF: required

POST /api/rooms/:roomId/invites
Requires: session + room membership
Body: { role, intendedTelegramUserId?, maxUses?, expiresAt? }
Response: { inviteUrl, expiresAt }
CSRF: required

POST /api/rooms/:roomId/join
Requires: session
Body: { inviteToken }
Response: { room }
CSRF: required

POST /api/rooms/:roomId/signatures
Requires: session + room membership
Body: { agreementHash, proofType }
Response: { signature }
CSRF: required

POST /api/rooms/:roomId/anchors
Requires: fresh session + verified wallet + room membership
Body: { walletId, agreementHash }
Response: { anchorIntent }
CSRF: required

POST /api/rooms/:roomId/anchors/:anchorId/submission
Requires: session + anchor owner
Body: { txHash }
Response: { anchorStatus: "pending" }
CSRF: required
```

## Frontend Flow

1. On app boot, call `Telegram.WebApp.ready()` and `expand()`.
2. If `window.Telegram?.WebApp?.initData` exists, call `POST /api/auth/telegram`.
3. Use `initDataUnsafe` only for optimistic display while `/api/me` loads.
4. Do not open room socket as an anonymous signer. If Telegram auth is unavailable, the user can view public/landing screens only.
5. Include credentials and CSRF/custom header in API calls that mutate state.
6. Include credentials in Socket.IO handshake and wait for authenticated socket state before joining rooms.
7. Join rooms only through existing membership or a valid invite token.
8. Add `TonConnectUIProvider` with public `tonconnect-manifest.json` served from the canonical `APP_ORIGIN`.
9. Before wallet connect, fetch `/api/ton/proof-payload` and pass it as `ton_proof`.
10. After connect, POST proof to `/api/ton/connect`; only then display wallet as verified.
11. Display submitted transaction hashes as pending until backend verification succeeds.

## Socket.IO Changes

Current `join_room(roomId, userName)` should become authenticated:

```text
socket handshake cookie -> session -> user
origin allowlist -> reject unknown browser origins
join_room(roomId, inviteToken?) -> requires membership or valid invite
sign_agreement(roomId, agreementHash) -> append-only signature by authenticated member
submit_anchor_tx(roomId, anchorId, txHash) -> allowed only for anchor owner; remains pending
```

This prevents users from impersonating counterparties by editing their name or rejoining with another socket id.

## Security Requirements

- `TELEGRAM_BOT_TOKEN` must exist in production.
- Reject missing or invalid `initData`.
- Reject stale `auth_date`; recommended initial TTL: 5-10 minutes.
- Reject future `auth_date` beyond a small clock-skew window.
- Never trust `initDataUnsafe` on backend.
- Never log raw `initData`, Telegram hashes, cookies, session tokens, proof payloads, or wallet signatures.
- Session cookie is opaque, HttpOnly, Secure in production.
- Default session cookie to `SameSite=Lax`; document and protect any `SameSite=None` deployment.
- Store only token hashes, not raw session tokens.
- Rotate session on Telegram re-auth.
- Protect cookie-authenticated state-changing routes with CSRF/custom-header and Origin checks.
- Restrict Socket.IO origins; no `origin: '*'` in production.
- Validate every HTTP body and Socket.IO event payload with schemas and size limits.
- Rate-limit auth, proof, room join, signing, text update, and anchoring actions.
- `ton_proof` nonce is single-use and short-lived; recommended TTL: 5 minutes.
- Atomically consume `ton_proof` nonce and bind it to user, session, purpose, domain, and expiry.
- Validate TON proof domain against configured app host.
- Validate TON proof timestamp; recommended max age: 15 minutes.
- Treat wallet address as non-authoritative until proof passes.
- Reject wallet linking if the wallet is already linked to another user unless an explicit recovery/unlink flow verifies both sides.
- Treat submitted transaction hashes as unverified until backend on-chain validation confirms the expected payload, sender, chain, and success status.
- Store Telegram ids as strings.

## Implementation Phases

### Phase 0: Security Baseline

- Add env vars to `.env.example`: `TELEGRAM_BOT_TOKEN`, `APP_ORIGIN`, `SESSION_SECRET`, `SESSION_COOKIE_SECURE`, `SESSION_SAMESITE`, `TON_NETWORK`.
- Add `helmet`, production security headers, `app.disable('x-powered-by')`, JSON body limits, and generic production error handling.
- Add request schema validation approach, preferably `zod`.
- Add CSRF/custom-header + Origin-check middleware for cookie-authenticated state-changing routes.
- Add strict CORS/Socket.IO origin allowlist from `APP_ORIGIN` and dev origins.
- Add rate-limit helper for auth, proof, room join, signing, text update, and anchoring.
- Add tests for CSRF rejection, origin rejection, body limit rejection, and invalid payload shapes.

### Phase 1: Telegram Auth Foundation

- Add schema tables: `users`, `sessions`.
- Implement Telegram initData validator.
- Implement session repository and middleware.
- Add `POST /api/auth/telegram`, `GET /api/me`, `POST /api/auth/logout`.
- Rotate session on every successful Telegram re-auth.
- Enforce no logging of raw auth material.
- Add unit tests with official-style validation vectors, bad hash, malformed user JSON, stale `auth_date`, future `auth_date`, and timing-safe compare behavior.

### Phase 2: Authenticated Rooms + Invite Authorization

- Extend participant model with `user_id`, `telegram_user_id`, `joined_at`, `signed_at`.
- Add `room_invites` table and invite repository.
- Replace `Math.random` room/invite generation with cryptographically strong random tokens.
- Authenticate Socket.IO handshake from session cookie.
- Reject Socket.IO connections from unknown origins and invalid sessions.
- Change `join_room` to derive participant name from authenticated user.
- Require existing membership or a valid invite token to join a room.
- Restrict `update_name` and text updates to authenticated room members.
- Add integration tests for impersonation prevention, invite replay/expiry, link guessing resistance, and reconnect behavior.

### Phase 3: Append-Only Agreement Signing

- Replace `toggle_sign` with `sign_agreement(roomId, agreementHash)`.
- Add `agreement_signatures` table.
- Freeze the exact payload used for `agreementHash` before signing.
- Store signer `user_id`, Telegram user id, optional verified wallet id, `proof_type`, and `signed_at`.
- Prevent display-name or text mutations from silently changing already-signed agreement meaning.
- Add tests for wrong hash, duplicate signature, non-member signing, post-signature mutation behavior, and finalized room behavior.

### Phase 4: TON Connect + ton_proof

- Install `@tonconnect/ui-react`, `@ton/ton`, `@ton/crypto`, `tweetnacl`, `buffer`.
- Add public `tonconnect-manifest.json`.
- Add `auth_nonces` and `ton_wallets` tables.
- Implement `/api/ton/proof-payload`.
- Implement `/api/ton/connect` with server-side proof verification.
- Consume nonces atomically and bind them to user, session, purpose, domain, and expiry.
- Verify domain, chain, address/state init, public key, timestamp, payload, and signature.
- Define wallet conflict policy: reject already-linked wallets without verified unlink/recovery.
- Display verified wallet in the room header/profile.
- Add tests for nonce reuse/race, wrong domain, wrong chain, wrong address/state init, wrong public key, stale proof, invalid signature, and wallet conflict.

### Phase 5: TON Actions + Verified Anchoring

- Replace current EVM Sepolia anchoring with TON-oriented transaction flow.
- Keep hash anchoring server-authorized: backend builds the payload/transaction intent, client signs/sends via TON Connect.
- Add `anchor_attempts` table.
- Store chain, expected payload hash, verified wallet, submitted transaction hash, and status.
- Submitted tx hashes start as `pending`.
- Backend verifies chain, sender wallet, destination, message body/payload hash, transaction success, and confirmation/finality before marking an anchor verified.
- Add tests for fake tx hash, wrong chain, wrong sender, wrong payload, failed transaction, and pending-to-verified transition.

## Acceptance Criteria

- A user cannot become a room participant without a valid Telegram Mini App auth session.
- A valid Telegram user cannot join a room without existing membership or a valid invite.
- A user cannot change another participant's signer identity by reconnecting or changing display name.
- Cookie-authenticated POST routes reject requests without CSRF/custom-header and valid Origin.
- Socket.IO rejects invalid sessions and unknown origins before any room event is accepted.
- Telegram auth fails on bad hash, missing user, malformed user JSON, stale `auth_date`, or future `auth_date`.
- Raw `initData`, proof payloads, signatures, session tokens, and cookies are never logged.
- Wallet address is shown as verified only after backend `ton_proof` validation.
- `ton_proof` cannot be replayed and fails on wrong domain, wrong chain, wrong address/state init, wrong public key, stale timestamp, and invalid signature.
- A wallet already linked to another user cannot be silently reassigned.
- Agreement signing stores immutable `agreement_hash`, `signed_at`, and signer identity.
- Submitted tx hash remains pending until backend verifies transaction contents on-chain.
- Rooms retain durable signer identity after socket disconnect.
- Rate limits and payload limits exist for auth, TON proof, socket joins, text updates, signing, and anchoring.
- Existing room tests remain green after migration.
