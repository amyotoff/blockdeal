# Security Audit: Telegram + TON Auth Plan

## Executive Summary

The proposed direction is correct: Telegram `initData` should be the primary Mini App identity, and TON Connect with backend-verified `ton_proof` should be a separate wallet-ownership credential. The main residual risks are not in the official mechanisms themselves, but in the glue around them: cookie CSRF, Socket.IO authentication/origin handling, room invite authorization, replay/nonce handling, and treating client-submitted transaction hashes as proof.

This audit reviews `docs/auth-telegram-ton-sota-plan.md` and the current implementation shape in `server.ts`, `server/rooms.ts`, and `src/App.tsx`.

## Attack Surfaces

- Telegram Mini App auth bootstrap: raw `initData`, `auth_date`, `hash`, user object parsing.
- BlockDeal session: cookie flags, session storage, CSRF, fixation, replay, logout/revocation.
- Socket.IO: handshake auth, CORS/origin policy, event authorization, room join authorization.
- Room capability links: room id generation, guessing, invite forwarding, participant impersonation.
- TON wallet binding: `ton_proof` nonce, domain, timestamp, public key, address derivation, wallet conflicts.
- Contract signing semantics: whether in-app "signed" means UI acknowledgement or cryptographic intent.
- TON transaction anchoring: transaction hash submission, on-chain verification, sender wallet matching.
- Frontend runtime: third-party wallet SDKs, CSP, unsafe storage, XSS leading to auth replay.

## High Severity

### AUTH-SEC-001: Cookie auth plan needs explicit CSRF controls

Location: `docs/auth-telegram-ton-sota-plan.md:122-126`, `docs/auth-telegram-ton-sota-plan.md:141-165`, `docs/auth-telegram-ton-sota-plan.md:192-200`

Evidence: The plan uses an HttpOnly session cookie and proposes `SameSite=None` in production. It also defines state-changing endpoints: `/api/auth/logout`, `/api/ton/connect`, `/api/ton/disconnect`, and later room/transaction actions.

Impact: If cookies are sent cross-site, a malicious page can attempt state-changing requests from the victim browser. This can bind an attacker's wallet, disconnect a wallet, log out a user, or trigger room actions if any route accepts browser-simple requests.

Fix:

- Prefer `SameSite=Lax` for same-origin Telegram Mini App API calls unless a cross-site embedding requirement proves `None` is necessary.
- If `SameSite=None` is required, add CSRF protection to every cookie-authenticated state-changing route.
- Require `Content-Type: application/json` and a custom header such as `X-BlockDeal-CSRF`.
- Add Origin/Referer checks and Fetch Metadata checks as defense-in-depth.
- Do not use GET for any state-changing action.

Mitigation: Keep API same-origin with the app and do not enable credentialed CORS unless there is a specific trusted origin allowlist.

### AUTH-SEC-002: Socket.IO must not keep permissive CORS once sessions are introduced

Location: `server.ts:31-36`, `docs/auth-telegram-ton-sota-plan.md:173-187`, `docs/auth-telegram-ton-sota-plan.md:220-224`

Evidence: Current Socket.IO server allows `origin: '*'`. The plan says Socket.IO should authenticate via session cookie, but does not define an origin allowlist or handshake rejection behavior.

Impact: When cookies/credentials enter the socket handshake, permissive origins increase exposure to cross-site socket attempts, event abuse, and confusing browser behavior. Even without cookies, open Socket.IO origins allow arbitrary sites to drive room events if the server accepts them.

Fix:

- Configure Socket.IO `cors.origin` as an exact allowlist from `APP_ORIGIN` and dev localhost origins.
- Reject missing/invalid sessions in `io.use(async (socket, next) => ...)`.
- Attach `socket.data.user` after session validation and use it in all events.
- Validate `Origin` during websocket upgrades, not only HTTP routes.
- Rate-limit connection attempts and high-risk events per user/session/IP.

Mitigation: Until auth lands, keep rooms clearly non-authoritative and avoid displaying signatures as verified identity.

### AUTH-SEC-003: Authenticated user is not enough; room join needs authorization

Location: `docs/auth-telegram-ton-sota-plan.md:45`, `docs/auth-telegram-ton-sota-plan.md:181-190`, current capability link flow in `src/App.tsx:235-258`

Evidence: The plan prevents unauthenticated participants, but does not define who is allowed to join a room. Current rooms are reached by `#/room/<roomId>` and `join_room` accepts the room id directly.

Impact: Any authenticated Telegram user who obtains or guesses a room URL can become a participant or observer. If the room id is used as the only capability, leaked links become durable bearer credentials.

Fix:

- Separate `room_id` from `invite_token`.
- Generate invite tokens with `crypto.randomBytes`, not `Math.random`.
- Store invite purpose, role, max uses, creator, expiration, and optional intended Telegram user id.
- On `join_room`, require a valid invite or existing membership.
- Consider explicit counterparty acceptance before adding a signer to a deal.

Mitigation: Increase room ids to at least 128 bits of randomness and treat shared links as bearer secrets until proper invites exist.

### AUTH-SEC-004: TON proof nonce must be bound and consumed atomically

Location: `docs/auth-telegram-ton-sota-plan.md:89-98`, `docs/auth-telegram-ton-sota-plan.md:132-137`, `docs/auth-telegram-ton-sota-plan.md:201-203`, `docs/auth-telegram-ton-sota-plan.md:231-234`

Evidence: The plan has `auth_nonces` and says nonce is single-use, but does not specify atomic consume, binding fields, or replay race handling.

Impact: A proof payload can be replayed within its TTL, raced across requests, or used for the wrong purpose if nonce verification is only a read-before-write check.

Fix:

- Payload should encode or reference server state bound to `user_id`, `session_id`, `purpose`, `domain`, and expiry.
- Store only `sha256(nonce)` and consume with one atomic statement: update where `consumed_at IS NULL AND expires_at > now`.
- Reject if update count is not exactly 1.
- Delete or expire old nonces aggressively.
- Do not let one proof payload work for both wallet linking and transaction authorization.

Mitigation: Keep nonce TTL short, but do not rely on TTL alone.

### AUTH-SEC-005: Wallet public key and address must not be trusted from client fields

Location: `docs/auth-telegram-ton-sota-plan.md:75-87`, `docs/auth-telegram-ton-sota-plan.md:132-137`, `docs/auth-telegram-ton-sota-plan.md:157-160`

Evidence: `/api/ton/connect` accepts `{ account, proof }`, and `ton_wallets` stores address/public key/state init. The plan mentions deriving/verifying public key from `walletStateInit`, with chain fallback later.

Impact: If implementation trusts `account.publicKey`, `proof.public_key`, or `address` directly, an attacker can bind a wallet they do not control or exploit mismatches between address, state init, public key, and signature.

Fix:

- Verify the TON proof message exactly per TON Connect spec.
- Parse `walletStateInit` only for known standard wallet contracts.
- Derive wallet address from state init and compare it to the claimed address and chain.
- If falling back to on-chain `get_public_key`, query a trusted TON endpoint and verify the returned key.
- Verify domain length/value exactly, with no suffix matching.
- Reject chain mismatches and unsupported networks explicitly.

Mitigation: Initially support only mainnet or only testnet by env, not both silently.

### AUTH-SEC-006: Transaction hash must not be accepted as anchoring proof

Location: `server.ts:91-98`, `src/App.tsx:327-334`, `docs/auth-telegram-ton-sota-plan.md:236-241`

Evidence: Current implementation accepts a client-submitted tx hash and displays it as anchored. The plan says phase 4 will store chain, transaction hash, sender wallet, and payload hash, but does not make on-chain verification an acceptance criterion.

Impact: A malicious participant can submit any transaction hash and make the UI claim a deal is anchored even if the transaction is unrelated, failed, on the wrong chain, from the wrong sender, or contains the wrong payload.

Fix:

- Treat submitted transaction hash as `pending`, never verified.
- Verify chain, sender wallet, destination contract/address, message body/comment/payload hash, transaction success, and confirmation/finality before marking anchored.
- Backend should create the transaction intent and store expected payload hash before the wallet sends it.
- Only verified wallets of room participants should be allowed to anchor.

Mitigation: Until verification exists, label tx hashes as "submitted by client, unverified".

### AUTH-SEC-007: In-app `toggle_sign` does not prove cryptographic signing intent

Location: `server.ts:83-89`, `server/rooms.ts:49-60`, `docs/auth-telegram-ton-sota-plan.md:185-187`, `docs/auth-telegram-ton-sota-plan.md:220-224`

Evidence: The current signature action toggles a boolean. The plan moves it to authenticated users, but still describes `toggle_sign(roomId)` rather than signing an immutable agreement hash.

Impact: If BlockDeal presents this as durable agreement proof, an attacker with a stolen session, CSRF path, or compromised client can toggle a signature without wallet-level or Telegram-level re-confirmation. The signed state may also drift if mutable participant names/text are not frozen per signature.

Fix:

- Replace toggle semantics with append-only `sign_agreement(roomId, agreementHash)`.
- Store `signed_at`, `agreement_hash`, signer `user_id`, Telegram user id, and optional verified wallet id.
- Require the client to show the exact hash being signed.
- For high-value agreements, require fresh TON proof or wallet signature over the agreement hash.
- Do not allow changing signer display name after signing without invalidating the signature.

Mitigation: Copy should say "confirmed in app" until cryptographic signing is implemented.

## Medium Severity

### AUTH-SEC-008: Telegram `initData` replay and leakage controls need to be explicit

Location: `docs/auth-telegram-ton-sota-plan.md:114-120`, `docs/auth-telegram-ton-sota-plan.md:194-197`, current `src/App.tsx:240-245`

Evidence: The plan validates `hash` and stale `auth_date`, which is correct. It does not state that raw `initData` must never be logged or sent to third parties.

Impact: Anyone who obtains raw `initData` can replay it within the accepted time window. XSS, logs, analytics, crash reports, or overly broad request logging can turn Telegram auth material into bearer login material.

Fix:

- Never log raw `initData`, parsed `hash`, session tokens, proof payloads, or cookies.
- Enforce a small request body limit on `/api/auth/telegram`.
- Rate-limit auth attempts by IP and Telegram user id after validation.
- Reject future `auth_date` beyond a small clock-skew window.
- Use `crypto.timingSafeEqual` after verifying equal buffer length.
- Parse Telegram ids as strings.

Mitigation: Keep `auth_date` TTL at 5-10 minutes for login and rotate the app session on every successful Telegram auth.

### AUTH-SEC-009: API and socket payload validation is underspecified

Location: `docs/auth-telegram-ton-sota-plan.md:139-165`, `docs/auth-telegram-ton-sota-plan.md:179-188`, current event handlers in `server.ts:45-98`

Evidence: Routes and events are defined, but schemas and limits are not.

Impact: Malformed values can cause type confusion, DoS, oversized DB writes, invalid tx hashes, room id probing, or crashes. Socket events are especially easy to spam.

Fix:

- Add a validation library such as `zod` for every HTTP body and Socket.IO event.
- Limit room id/invite token format, text length, participant name length, tx hash/address formats, and proof payload size.
- Configure `express.json({ limit: "32kb" })` or smaller per auth route.
- Add socket event throttling for joins, text updates, signing, and tx submission.

Mitigation: Fail closed with generic errors and server-side structured logs without sensitive values.

### AUTH-SEC-010: Session lifecycle needs concrete expiry, revocation, and fixation rules

Location: `docs/auth-telegram-ton-sota-plan.md:65-73`, `docs/auth-telegram-ton-sota-plan.md:122-126`, `docs/auth-telegram-ton-sota-plan.md:198-200`

Evidence: The plan stores sessions and says rotate on Telegram re-auth, but does not define idle TTL, absolute TTL, revocation semantics, or concurrent session behavior.

Impact: Long-lived stolen cookies remain useful, stale sessions keep wallet powers, and account recovery/logout cannot reliably remove access.

Fix:

- Use at least 256-bit random opaque session tokens.
- Store only `sha256(token)`.
- Define idle TTL and absolute TTL.
- Rotate session on login/re-auth and privilege changes.
- Revoke on logout and provide "logout all devices" later.
- Require fresh session for wallet unlink, primary wallet changes, and anchoring.

Mitigation: Store minimal session metadata: created at, last used at, expires at, user agent hash, optional IP prefix for anomaly detection.

### AUTH-SEC-011: Frontend and server security headers are missing from the plan

Location: `docs/auth-telegram-ton-sota-plan.md:168-177`, current `server.ts:24-123`

Evidence: The plan does not mention Helmet, CSP, frame policy, referrer policy, body limits, or custom error handling.

Impact: XSS has unusually high blast radius because it can steal raw `initData` during login, drive authenticated fetches, and manipulate wallet connection UI. Missing headers also increase clickjacking and MIME sniffing risk.

Fix:

- Add `helmet()` early in Express middleware.
- Disable `x-powered-by`.
- Add CSP compatible with Vite/React production and TON Connect endpoints.
- Configure `frame-ancestors` deliberately. If Telegram embedding constraints require exceptions, document exact allowed ancestors.
- Add generic production error responses.

Mitigation: Avoid third-party scripts; prefer bundled SDK packages over remote script tags.

### AUTH-SEC-012: Wallet linking conflict policy is missing

Location: `docs/auth-telegram-ton-sota-plan.md:75-87`, `docs/auth-telegram-ton-sota-plan.md:157-165`

Evidence: `ton_wallets` has `UNIQUE (chain, address)`, but no product/security policy for a wallet already linked to another user.

Impact: Automatic reassignment can become account takeover; silent rejection can become confusing support debt; multiple linked accounts can make ownership-based authorization ambiguous.

Fix:

- If a wallet is already linked, reject linking unless the existing user performs a verified unlink or account recovery flow.
- Store wallet link history/audit events.
- Enforce exactly one primary wallet per user per chain with application logic or partial unique index where supported.

Mitigation: Return a generic "wallet already linked" error without exposing the other account identity.

## Low Severity / Design Hygiene

### AUTH-SEC-013: OIDC future path needs a separate threat model

Location: `docs/auth-telegram-ton-sota-plan.md:9-11`

Evidence: OIDC is correctly scoped as future external web/admin auth, but the plan does not yet define redirect URI allowlists, state, nonce, PKCE verifier storage, or JWKS validation.

Impact: If OIDC is later added casually, redirect/callback and token validation bugs become likely.

Fix: Keep OIDC out of the Mini App implementation phase. When added, design it as a separate flow with state, nonce, PKCE, exact redirect allowlists, JWKS validation, issuer/audience/expiry checks, and no open redirects.

### AUTH-SEC-014: TON manifest availability and metadata can become a phishing edge

Location: `docs/auth-telegram-ton-sota-plan.md:175`, `docs/auth-telegram-ton-sota-plan.md:229`

Evidence: The plan adds `tonconnect-manifest.json`, but does not define hosting and cache requirements.

Impact: A stale or wrong manifest can make wallets show misleading app identity, and users may approve wallet requests for the wrong app.

Fix:

- Serve manifest over HTTPS from the canonical `APP_ORIGIN`.
- Use a stable PNG/ICO icon, correct app name, and exact app URL.
- Avoid dev/demo manifest URLs in production.
- Add deployment check that manifest is reachable and matches the configured origin.

## Required Changes To The SOTA Plan

1. Add CSRF strategy before implementing cookie sessions.
2. Add strict Socket.IO origin allowlist and authenticated handshake middleware.
3. Add room invite/membership authorization, not just authenticated users.
4. Add atomic nonce consume semantics and bind nonce to user/session/purpose.
5. Add exact TON proof verification requirements: domain, chain, address, state init, public key, signature.
6. Add verified anchoring status; client tx hash alone is never proof.
7. Replace `toggle_sign` with append-only signing of immutable agreement hashes.
8. Add zod schemas and payload limits for all HTTP and socket inputs.
9. Add rate limits for auth, proof, join, sign, and anchor actions.
10. Add Helmet/CSP/error-handling production baseline.

## Security Acceptance Criteria

- Cookie-authenticated POST routes reject requests without CSRF/custom-header and valid Origin.
- Socket.IO rejects invalid sessions before any room event is accepted.
- Socket.IO origin is allowlisted; no `origin: '*'` in production.
- Joining a room requires existing membership or a valid invite token.
- `initData` is never logged and fails on bad hash, stale/future `auth_date`, and malformed user JSON.
- `ton_proof` fails on nonce reuse, wrong domain, wrong chain, wrong address/state init, wrong public key, stale timestamp, and invalid signature.
- A wallet already linked to another user cannot be silently reassigned.
- Submitted tx hash remains pending until backend verifies transaction contents on-chain.
- Signing stores immutable `agreement_hash`, `signed_at`, and signer identity.
- Rate limits and payload size limits exist for auth, TON proof, socket joins, text updates, signing, and anchoring.
