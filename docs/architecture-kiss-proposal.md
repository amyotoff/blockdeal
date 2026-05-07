# KISS architecture proposal for BlockDeal

## 1. Current state

BlockDeal is currently a compact MVP:

- Frontend: React + Vite in `src/App.tsx`.
- Realtime sync: Socket.IO client/server events.
- Backend: Express + Socket.IO in one `server.ts`.
- State: SQLite-backed room repository.
- Blockchain anchoring: client-side `ethers` transaction with document hash in `data`.
- Deployment shape: one Node process serving API, WebSocket, and Vite/static files.

This is a good MVP shape. The main architectural risk is not the stack itself, but that too much unrelated responsibility already lives in two large files:

- `src/App.tsx` owns routing, Telegram integration, socket lifecycle, document editing, signing UI, hashing, blockchain anchoring, and download logic.
- `server.ts` owns HTTP setup, Vite/static serving, Socket.IO event handling, room state, participant lifecycle, and document lock rules.

The KISS goal should be: keep one app and one server, but split responsibilities into small modules.

## 2. Recommended direction

Do not introduce a monorepo, microservices, queues, GraphQL, custom state framework, or a smart contract yet.

Keep the stack:

- React + Vite.
- TypeScript.
- Express.
- Socket.IO.
- ethers.
- npm.

Use a tiny persistence layer:

- SQLite for local/simple production persistence.
- `better-sqlite3` for a small synchronous adapter that matches the current room rules.
- PostgreSQL only when multiple Node instances, managed DB operations, or higher write concurrency are needed.

## 3. Proposed repo structure

Recommended simple structure:

```text
blockdeal/
  docs/
    architecture-kiss-proposal.md
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

This keeps the app small but makes ownership clearer:

- `src/app/App.tsx`: compose the screen.
- `src/components/*`: presentational UI blocks.
- `src/hooks/*`: browser and socket lifecycle.
- `src/lib/*`: pure helpers and external integrations.
- `src/types/*`: shared frontend types.
- `server/rooms.ts`: room state operations.
- `server/storage/*`: durable room repository.
- `server/socketHandlers.ts`: Socket.IO event wiring.
- `server/index.ts`: server bootstrap only.

## 4. First refactor to do

Start with the lowest-risk extraction:

1. Move shared interfaces from `src/App.tsx` into `src/types/room.ts`.
2. Move `computeHashPayload` and `getHash` into `src/lib/contractHash.ts`.
3. Move file download code into `src/lib/downloadText.ts`.
4. Move MetaMask transaction logic into `src/lib/blockchain.ts`.
5. Rename `server.ts` to `server/index.ts` only after the frontend cleanup lands.

This gives immediate readability without changing product behavior.

## 5. Server simplification

Create a tiny room service instead of editing the `Map` directly inside socket handlers.

Recommended server API:

```ts
createOrJoinRoom(roomId, socketId, userName)
updateRoomText(roomId, text)
updateParticipantName(roomId, socketId, name)
toggleParticipantSignature(roomId, socketId)
setRoomTxHash(roomId, txHash)
removeParticipant(socketId)
```

Keep the room service and SQLite repository synchronous. That keeps tests easy and avoids fake async complexity while the app runs as one Node process.

## 6. Speed of work

The fastest path is to improve feedback loops:

- Keep `npm run dev` as the single command for local development.
- Add `npm run typecheck` as an alias for `tsc --noEmit`.
- Add a tiny unit test setup only for pure logic, especially hashing and room state.
- Avoid broad end-to-end tests until the core flow stabilizes.
- Keep generated AI Studio config minimal and documented.

Suggested scripts:

```json
{
  "dev": "tsx server/index.ts",
  "build": "vite build",
  "start": "node dist-server/index.js",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

If server build output is not needed yet, keep `start` as a later task and use `tsx` for MVP deployment where acceptable.

## 7. Stack cleanup

Current dependencies include useful pieces, but a few deserve review:

- Keep `react`, `react-dom`, `vite`, `typescript`, `express`, `socket.io`, `socket.io-client`, `ethers`, `lucide-react`.
- Keep Tailwind only if the project will actually use Tailwind classes consistently.
- Remove `@google/genai` if Gemini is not used by the product flow.
- Remove `motion` until there is a real animation requirement.
- Avoid adding Zustand/Redux for now; socket state plus local React state is enough.

KISS rule: every dependency should answer a current product need, not a possible future one.

## 8. Persistence decision

SQLite is the default persistence layer. It gives durable rooms while keeping the app operationally small:

- One Node process.
- One SQLite file.
- No separate database server.
- Transactional room updates.

Current schema:

```text
rooms(id, text, hashed, tx_hash, created_at, updated_at)
participants(room_id, id, name, signed, updated_at)
```

The `participants` table uses `(room_id, id)` as its primary key so a socket can be removed from every room on disconnect.

Keep Socket.IO as the realtime layer. Do not add Redis or PostgreSQL until there are multiple Node instances.

## 9. Security and trust model

Keep this simple, but make the trust model explicit:

- Current signatures are consent flags, not cryptographic signatures.
- Any connected participant can edit while the room is unlocked.
- The blockchain transaction proves a hash existed at a time, not that all parties legally signed.

Near-term improvement:

- Rename UI copy from "подписано" to something like "согласовано", unless wallet signatures are added.
- Add optional wallet signature later with `signMessage(hashPayload)` if legal/identity strength matters.

## 10. Suggested implementation order

1. Frontend extraction: types, hash helper, download helper, blockchain helper.
2. Component split: editor, participants, hash panel, bottom action bar.
3. Server extraction: room service and socket handlers.
4. Dependency cleanup: remove unused packages after confirming product scope.
5. Add tests for `contractHash` and room service.
6. Move from SQLite to PostgreSQL only when deployment or scale requires it.

## 11. Architecture principle

The app should stay as one deployable service until there is a real scaling problem.

The right KISS architecture for BlockDeal is:

- One React app.
- One Node server.
- One realtime protocol.
- One simple room model.
- One SQLite repository for durable room state.
- Pure helpers for hash/download/blockchain actions.

That gives the team faster iteration now and leaves enough structure to grow without a painful rewrite.
