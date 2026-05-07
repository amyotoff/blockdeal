import { afterEach, describe, expect, it } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import { createBlockDealServer } from '../../server';
import type { RoomState } from '../../src/types/room';

let server: Awaited<ReturnType<typeof createBlockDealServer>> | undefined;
let clients: Socket[] = [];

function once<T>(socket: Socket, event: string, predicate: (value: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve) => {
    const listener = (value: T) => {
      if (!predicate(value)) return;

      socket.off(event, listener);
      resolve(value);
    };
    socket.on(event, listener);
  });
}

async function startTestServer() {
  server = await createBlockDealServer({ port: 0, host: '127.0.0.1', useVite: false, databasePath: ':memory:' });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected an ephemeral test port');
  }
  return `http://127.0.0.1:${address.port}`;
}

function connectClient(url: string): Socket {
  const socket = createClient(url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  clients.push(socket);
  return socket;
}

afterEach(async () => {
  clients.forEach((client) => client.disconnect());
  clients = [];
  if (server) {
    await server.close();
    server = undefined;
  }
});

describe('e2e realtime contract flow', () => {
  it('completes the MVP agreement lifecycle with mock tx data', async () => {
    const url = await startTestServer();
    const alice = connectClient(url);
    const bob = connectClient(url);
    const roomId = 'e2e-room';

    const aliceJoined = once<RoomState>(alice, 'room_state', (room) => room.participants.length === 1);
    alice.emit('join_room', roomId, 'Alice');
    expect((await aliceJoined).hashed).toBe(false);

    const bothJoined = once<RoomState>(bob, 'room_state', (room) => room.participants.length === 2);
    bob.emit('join_room', roomId, 'Bob');
    expect((await bothJoined).participants.map((participant) => participant.name)).toEqual(['Alice', 'Bob']);

    const bobSeesText = once<string>(bob, 'text_updated');
    alice.emit('update_text', roomId, 'Final delivery agreement');
    expect(await bobSeesText).toBe('Final delivery agreement');

    const aliceSigned = once<RoomState>(bob, 'room_state', (room) => room.participants.some((participant) => participant.name === 'Alice' && participant.signed));
    alice.emit('toggle_sign', roomId);
    expect((await aliceSigned).hashed).toBe(false);

    const locked = once<RoomState>(alice, 'room_state', (room) => room.hashed);
    bob.emit('toggle_sign', roomId);
    expect((await locked).hashed).toBe(true);

    alice.emit('update_text', roomId, 'Mutation after lock');
    expect(server!.roomRepository.getRoom(roomId)!.text).toBe('Final delivery agreement');

    const txHash = `0x${'a'.repeat(64)}`;
    const txStored = once<RoomState>(bob, 'room_state', (room) => room.txHash === txHash);
    alice.emit('set_tx_hash', roomId, txHash);
    expect((await txStored).txHash).toBe(txHash);
  });
});
