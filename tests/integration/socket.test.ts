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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(async () => {
  clients.forEach((client) => client.disconnect());
  clients = [];
  if (server) {
    await server.close();
    server = undefined;
  }
});

describe('Socket.IO room flow', () => {
  it('keeps the finalized signer set stable across disconnects and late viewers', async () => {
    const url = await startTestServer();
    const alice = connectClient(url);
    const bob = connectClient(url);
    const roomId = 'integration-room';

    const aliceJoined = once<RoomState>(alice, 'room_state', (room) => room.participants.length === 1);
    alice.emit('join_room', roomId, 'Alice');
    expect((await aliceJoined).participants[0].name).toBe('Alice');

    const bothJoinedForAlice = once<RoomState>(alice, 'room_state', (room) => room.participants.length === 2);
    const bothJoinedForBob = once<RoomState>(bob, 'room_state', (room) => room.participants.length === 2);
    bob.emit('join_room', roomId, 'Bob');
    expect((await bothJoinedForAlice).participants.map((participant) => participant.name)).toEqual(['Alice', 'Bob']);
    expect((await bothJoinedForBob).participants.map((participant) => participant.name)).toEqual(['Alice', 'Bob']);

    const textUpdated = once<string>(bob, 'text_updated');
    alice.emit('update_text', roomId, 'Updated agreement');
    expect(await textUpdated).toBe('Updated agreement');

    const aliceSigned = once<RoomState>(alice, 'room_state', (room) => room.participants.some((participant) => participant.name === 'Alice' && participant.signed));
    alice.emit('toggle_sign', roomId);
    expect((await aliceSigned).hashed).toBe(false);

    const lockedForAlice = once<RoomState>(alice, 'room_state', (room) => room.hashed);
    const lockedForBob = once<RoomState>(bob, 'room_state', (room) => room.hashed);
    bob.emit('toggle_sign', roomId);
    expect((await lockedForAlice).hashed).toBe(true);
    expect((await lockedForBob).hashed).toBe(true);

    alice.emit('update_text', roomId, 'Should not change');
    expect(server!.roomRepository.getRoom(roomId)!.text).toBe('Updated agreement');

    const txState = once<RoomState>(bob, 'room_state', (room) => room.txHash === '0xabc');
    alice.emit('set_tx_hash', roomId, '0xabc');
    expect((await txState).txHash).toBe('0xabc');

    alice.disconnect();
    await wait(25);
    expect(server!.roomRepository.getRoom(roomId)!.participants).toEqual([
      { id: expect.any(String), name: 'Alice', signed: true },
      { id: expect.any(String), name: 'Bob', signed: true },
    ]);

    const charlie = connectClient(url);
    const charlieState = once<RoomState>(charlie, 'room_state');
    charlie.emit('join_room', roomId, 'Charlie');
    expect(await charlieState).toEqual({
      text: 'Updated agreement',
      participants: [
        { id: expect.any(String), name: 'Alice', signed: true },
        { id: expect.any(String), name: 'Bob', signed: true },
      ],
      hashed: true,
      txHash: '0xabc',
    });
    expect(server!.roomRepository.getRoom(roomId)!.participants).toHaveLength(2);
  });

  it('still removes disconnected participants from draft rooms', async () => {
    const url = await startTestServer();
    const alice = connectClient(url);
    const bob = connectClient(url);
    const roomId = 'draft-room';

    const aliceJoined = once<RoomState>(alice, 'room_state', (room) => room.participants.length === 1);
    alice.emit('join_room', roomId, 'Alice');
    await aliceJoined;

    const bothJoined = once<RoomState>(bob, 'room_state', (room) => room.participants.length === 2);
    bob.emit('join_room', roomId, 'Bob');
    await bothJoined;

    const bobSeesDisconnect = once<RoomState>(bob, 'room_state', (room) => room.participants.length === 1);
    alice.disconnect();
    expect((await bobSeesDisconnect).participants).toEqual([
      { id: expect.any(String), name: 'Bob', signed: false },
    ]);
    expect(server!.roomRepository.getRoom(roomId)!.participants).toEqual([
      { id: expect.any(String), name: 'Bob', signed: false },
    ]);
  });
});
