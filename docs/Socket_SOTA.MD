# Socket.IO and realtime sync SOTA

## 1. What "Realtime sync: Socket.IO client/server events" means

In BlockDeal, users can open the same room and see changes without refreshing the page.

Socket.IO is the realtime layer that keeps the browser and server connected. The frontend sends named events to the server, and the server broadcasts updates to everyone else in the same room.

Example from the current product flow:

```ts
socket.emit('join_room', roomId, userName);
socket.emit('update_text', roomId, newText);
socket.emit('toggle_sign', roomId);
socket.emit('set_tx_hash', roomId, txHash);
```

The server listens for these events:

```ts
socket.on('join_room', ...);
socket.on('update_text', ...);
socket.on('toggle_sign', ...);
socket.on('set_tx_hash', ...);
```

Simple mental model:

```text
User A edits text
  -> browser sends update_text
  -> server updates room state
  -> server broadcasts text_updated
  -> User B sees the new text
```

This is event sync, not full Google Docs-style collaborative editing.

## 2. What Socket.IO gives us

Socket.IO is useful because it gives us more than a raw WebSocket:

- Named events, such as `update_text` and `toggle_sign`.
- Rooms, so we can broadcast only to users in the same contract room.
- Automatic reconnect behavior.
- Fallback transport when WebSocket is unavailable.
- A simple client and server API.

That makes it a good KISS choice for the current MVP.

## 3. Current limitation in BlockDeal

Right now, document text sync is last-write-wins.

If two users edit the same text at the same time, the latest update that reaches the server wins. There is no merge algorithm, operation transform, CRDT, cursor sync, undo history, or conflict resolution.

For a contract MVP, this may be acceptable.

For a serious collaborative editor, this is not enough.

## 4. SOTA rating

SOTA depends on the problem:

- For simple realtime app events: Socket.IO is still strong.
- For collaborative text editing: Socket.IO alone is not SOTA.
- For offline-first collaborative documents: CRDT systems are closer to SOTA.
- For fastest production collaboration features: managed services are often best.

Practical rating for BlockDeal:

```text
Socket.IO for room events:        8/10
Socket.IO for text collaboration: 5/10
Socket.IO for current MVP:        8/10
```

## 5. Alternatives

| Option | What it is | SOTA level | Fit for BlockDeal |
|---|---|---:|---|
| Socket.IO | Event layer over WebSocket/fallback transports | 7/10 | Best current KISS choice |
| Native WebSocket / ws | Raw bidirectional socket connection | 6/10 | Leaner, but more manual work |
| Yjs + y-websocket | CRDT-based collaborative document sync | 9/10 | Best next step for real shared editing |
| Automerge | Local-first CRDT document sync | 9/10 | Powerful, but likely too heavy now |
| Liveblocks | Managed realtime collaboration platform | 9/10 | Fastest product-ready collab, with vendor dependency |
| Supabase Realtime | Managed realtime via Postgres changes, broadcast, presence | 8/10 | Good if we adopt Supabase/Postgres |
| PartyKit | Realtime room servers, often at the edge | 8/10 | Good for multiplayer-style room apps |
| Server-Sent Events | One-way server-to-client events | 4/10 | Not enough for two-way editing |
| WebTransport | Newer low-level transport over HTTP/3 | 8/10 transport, 3/10 app fit | Too low-level for this product now |

## 6. Recommended KISS path

Keep Socket.IO now.

Use it for:

- Room join/leave.
- Participant presence.
- Name changes.
- Agreement/signature status.
- Document lock state.
- Blockchain transaction hash broadcast.

Do not overbuild the realtime layer yet.

Upgrade only if the product needs true simultaneous editing.

## 7. If we upgrade later

Recommended upgrade path:

1. Keep Socket.IO for non-document room events.
2. Move contract text state to Yjs.
3. Use `y-websocket` or a custom Yjs provider for document updates.
4. Keep the final hash based on a deterministic snapshot of the Yjs document.
5. Add tests proving that the same final document always produces the same hash.

This avoids rewriting everything at once.

## 8. Decision

For BlockDeal today:

```text
Use Socket.IO.
Do not replace it yet.
Do not introduce CRDT until simultaneous editing becomes a real product requirement.
Design the code so text sync can be swapped later.
```

The important architectural move is to isolate realtime code behind a small hook or service:

```text
src/hooks/useRoomSocket.ts
server/socketHandlers.ts
server/rooms.ts
```

That gives us KISS now and a clean path to SOTA later.

## 9. References

- Socket.IO: https://socket.io/
- MDN WebSocket API: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- Yjs docs: https://docs.yjs.dev/
- y-websocket provider: https://docs.yjs.dev/ecosystem/connection-provider/y-websocket
- Automerge: https://automerge.org/
- Liveblocks docs: https://liveblocks.io/docs
- Supabase Realtime: https://supabase.com/docs/guides/realtime
- PartyKit docs: https://docs.partykit.io/
- MDN WebTransport API: https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API
