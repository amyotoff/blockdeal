# BlockDeal

BlockDeal is a lightweight MVP for agreeing on a contract text with several participants and anchoring the final document hash on an EVM blockchain.

The product goal is simple:

- Create or open a shared contract room.
- Edit the agreement text together.
- Let participants mark their agreement.
- Lock the document when everyone has agreed.
- Compute a deterministic hash of the final text and participants.
- Send that hash to Sepolia as transaction data.
- Save the original text locally so the hash can be verified later.

This repository intentionally follows a KISS architecture: one React app, one Node server, one realtime layer, and a small room model.

## Status

Current state: MVP.

What works:

- Shared room links using hash routes like `#/room/<roomId>`.
- Realtime room sync with Socket.IO.
- Durable room state in SQLite.
- Editable contract text before final agreement.
- Participant list and agreement status.
- Document lock after all current participants agree.
- Hash calculation with `ethers.id(...)`.
- MetaMask/browser wallet transaction with the hash in transaction `data`.
- Sepolia Etherscan link after anchoring.
- Download of the final source text as `.txt`.
- Basic Telegram WebApp user name detection when opened inside Telegram.

Known MVP limitations:

- The default database is SQLite, so production deploys need a persistent disk/volume.
- The architecture assumes one Node server instance. Move the repository adapter to PostgreSQL before running multiple instances.
- Current agreement status is a UI consent flag, not a cryptographic wallet signature.
- Text collaboration is last-write-wins, not Google Docs-style conflict-free editing.
- There is no user authentication or room access control yet.
- The blockchain transaction proves that a hash existed at a point in time; it does not prove legal signature by itself.

## Tech stack

- React 19
- TypeScript
- Vite
- Express
- Socket.IO
- SQLite through `better-sqlite3`
- ethers
- lucide-react
- Tailwind Vite plugin
- npm

Current KISS recommendation:

- Keep React + Vite for the frontend.
- Keep Express + Socket.IO for the backend and realtime room events.
- Keep `ethers` for wallet and hash operations.
- Keep SQLite as the default persistence layer while the app runs as one Node server.
- Keep dependencies tied to current product behavior; remove unused template packages instead of carrying them forward.
- Avoid Redux/Zustand until local React state becomes painful.
- Avoid microservices, monorepo setup, GraphQL, queues, or smart contracts until the product requires them.
- Move to PostgreSQL only when multiple server instances, managed backups, or higher write concurrency become real product needs.

## How it works

The app has two main pieces:

- Frontend: `src/App.tsx`
- Backend: `server.ts`

The frontend opens a room from the URL hash, connects to the Socket.IO server, and sends room events.

Example client events:

```ts
socket.emit('join_room', roomId, userName);
socket.emit('update_text', roomId, newText);
socket.emit('toggle_sign', roomId);
socket.emit('set_tx_hash', roomId, txHash);
```

The server listens for these events, updates room state through the SQLite repository, and broadcasts the new room state to everyone in the same room.

Simple flow:

```text
User edits text
  -> browser sends update_text
  -> server updates the room
  -> server broadcasts text_updated
  -> other room participants see the update
```

When all participants agree, the server marks the room as locked. The frontend then computes a hash from the final contract payload and can send that hash to Sepolia through the user's browser wallet.

## Realtime choice

BlockDeal currently uses Socket.IO for realtime sync.

This is a good MVP choice because it gives us:

- Named client/server events.
- Room-based broadcasting.
- Automatic reconnect behavior.
- WebSocket transport with fallback behavior.
- A simple API that works well with the current one-server architecture.

It is not SOTA for serious collaborative text editing. The current text sync is last-write-wins. If simultaneous editing becomes a core feature, the recommended upgrade path is Yjs for the document text while keeping Socket.IO for room events like presence, agreement status, and transaction hash updates.

More detail: [`docs/Socket_SOTA.MD`](docs/Socket_SOTA.MD)

## Project structure

Current structure:

```text
blockdeal/
  docs/
    Socket_SOTA.MD
    architecture-kiss-proposal.md
  src/
    App.tsx
    index.css
    main.tsx
  .env.example
  .gitignore
  index.html
  metadata.json
  package-lock.json
  package.json
  server.ts
  data/
    .gitkeep
  tsconfig.json
  vite.config.ts
```

Recommended next structure:

```text
blockdeal/
  docs/
  src/
    app/
      App.tsx
    components/
      Header.tsx
      ContractEditor.tsx
      ParticipantsList.tsx
      HashPanel.tsx
      BottomActionBar.tsx
    hooks/
      useRoomRoute.ts
      useTelegramUser.ts
      useRoomSocket.ts
    lib/
      contractHash.ts
      downloadText.ts
      blockchain.ts
    types/
      room.ts
    main.tsx
    index.css
  server/
    index.ts
    rooms.ts
    storage/
      db.ts
      roomRepository.ts
      schema.sql
      sqliteRoomRepository.ts
    socketHandlers.ts
    types.ts
  index.html
  package.json
  tsconfig.json
  vite.config.ts
```

The goal is not to make the repo look bigger. The goal is to move separate responsibilities out of large files while keeping the app easy to understand.

## Local development

Prerequisites:

- Node.js
- npm
- MetaMask or another browser wallet for blockchain anchoring

Install dependencies:

```bash
npm install
```

Create local environment file:

```bash
cp .env.example .env.local
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

The app will create a room URL like:

```text
http://localhost:3000/#/room/abc1234
```

Share that URL with another browser session to test realtime sync.

## Environment variables

`.env.example` currently includes:

```text
APP_URL="MY_APP_URL"
SQLITE_PATH="./data/blockdeal.sqlite"
```

`APP_URL` is useful for hosted environments where the app needs to know its public URL.
`SQLITE_PATH` controls where the server stores durable room state. The default path is ignored by git except for `data/.gitkeep`.

## Pre-production backup plan

Before running BlockDeal with real users, add an automated SQLite backup job with remote object storage.

Recommended shape:

```text
SQLite backup API
  -> local timestamped .sqlite backup
  -> gzip
  -> S3-compatible object storage, for example Cloudflare R2, AWS S3, or Backblaze B2
```

Use the SQLite backup API exposed by `better-sqlite3` instead of copying `data/blockdeal.sqlite` directly while the server is running. Direct file copies can miss WAL data.

Suggested retention:

```text
hourly backups: keep 24 hours
daily backups: keep 14 days
weekly backups: keep 8 weeks
```

Required restore runbook:

```text
1. Stop the Node server.
2. Download the selected remote backup.
3. Decompress it if needed.
4. Replace the current SQLITE_PATH file with the backup file.
5. Start the Node server.
6. Run npm run smoke and manually open one known room.
```

Production note: keep the live SQLite file on persistent storage and keep backups outside the application host. Volume snapshots are useful as an extra safety layer, but they should not be the only backup mechanism.

## Scripts

```bash
npm run dev
```

Starts the Express + Socket.IO server with Vite middleware on port `3000`.

```bash
npm run build
```

Builds the frontend with Vite.

```bash
npm run preview
```

Runs Vite preview for the built frontend.

```bash
npm run lint
```

Runs TypeScript checking with `tsc --noEmit`.

```bash
npm run typecheck
```

Alias for TypeScript checking with `tsc --noEmit`.

```bash
npm run smoke
```

Runs the minimum smoke suite for the MVP: TypeScript checking plus a production frontend build.

```bash
npm run clean
```

Removes the `dist` directory.

## Blockchain anchoring

BlockDeal does not currently deploy or call a smart contract.

The anchoring flow is:

1. Build the final contract payload from text and participants.
2. Compute `ethers.id(payload)`.
3. Ask the browser wallet for an account.
4. Send a zero-value transaction to the user's own address.
5. Put the document hash into the transaction `data`.
6. Store and display the transaction hash in the room.

This records the hash on-chain without storing private contract text publicly.

Important: the original text file must be kept. The blockchain stores the hash, not the readable agreement.

## Trust model

The MVP trust model is intentionally minimal:

- Participants are identified by socket connection and display name.
- Agreement is a room state flag.
- The final hash commits to the room text and participant names/statuses.
- The on-chain transaction provides timestamped public evidence of the hash.

For stronger trust later, consider:

- Wallet-based identity.
- `signMessage(...)` signatures from each participant.
- Immutable agreement snapshots.
- Explicit room invitations or access tokens.

## Recommended KISS roadmap

1. Extract frontend types into `src/types/room.ts`.
2. Extract hash logic into `src/lib/contractHash.ts`.
3. Extract download logic into `src/lib/downloadText.ts`.
4. Extract wallet transaction logic into `src/lib/blockchain.ts`.
5. Split UI into small components.
6. Move server room state operations into `server/rooms.ts`.
7. Move Socket.IO event wiring into `server/socketHandlers.ts`.
8. Add small unit tests for hash generation and room rules.
9. Remove unused dependencies after confirming product scope.
10. Move SQLite access behind additional service methods if room workflows become more complex.

Detailed proposal: [`docs/architecture-kiss-proposal.md`](docs/architecture-kiss-proposal.md)

## Future options

Potential upgrades, only when product needs are clear:

- Yjs for real simultaneous document editing.
- PostgreSQL when running multiple server instances or when managed database operations become necessary.
- Redis only when running multiple server instances.
- Wallet signatures for stronger agreement proof.
- Smart contract only if on-chain verification becomes a product requirement.
- Telegram-specific launch and sharing flow if Telegram becomes the main distribution channel.

## Repository notes

This project originated from an AI Studio template, but the repo is now being shaped as a focused BlockDeal MVP.

Keep future changes small and behavior-oriented. Prefer extracting clear modules over adding new frameworks.

Unused AI Studio template dependencies have been removed from the active product setup. Add AI/Gemini packages back only when a concrete product flow needs them.

## Project rules

`README.md` is the source of truth for project rules, architecture direction, local workflow, and current product assumptions.

When making a meaningful code change, opening a PR, or adding a new feature, update this README in the same change if the behavior, setup, architecture, dependencies, roadmap, trust model, or developer workflow changes.

Before implementation work, contributors and agents should read the relevant README sections and keep changes aligned with the KISS direction described here.

Code comments should explain architecture boundaries, product rules, and non-obvious behavior. Avoid comments that merely restate the next line of code.

Every new feature must include automated tests and smoke coverage appropriate to its risk. For the current MVP, minimum smoke coverage is `npm run smoke`; when feature logic is extracted into pure modules, add focused unit tests for that logic.
