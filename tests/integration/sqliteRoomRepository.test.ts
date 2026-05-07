import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  joinRoom,
  setRoomTxHash,
  toggleParticipantSign,
  updateParticipantName,
  updateRoomText,
} from '../../server/rooms';
import { SqliteRoomRepository } from '../../server/storage/sqliteRoomRepository';

let tempDirs: string[] = [];

function createTempDbPath(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blockdeal-sqlite-'));
  tempDirs.push(tempDir);
  return path.join(tempDir, 'blockdeal.sqlite');
}

afterEach(() => {
  tempDirs.forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
  tempDirs = [];
});

describe('SqliteRoomRepository CRUD', () => {
  it('creates and reads a room with default contract state', () => {
    const repository = new SqliteRoomRepository(':memory:');

    const created = repository.createRoom('room-create');
    const stored = repository.getRoom('room-create');

    expect(created.text).toContain('Договор купли-продажи');
    expect(stored).toEqual(created);

    repository.close();
  });

  it('updates room text, participants, signatures, and tx hash', () => {
    const repository = new SqliteRoomRepository(':memory:');
    const room = repository.getOrCreateRoom('room-update');

    joinRoom(room, 'socket-1', 'Alice');
    joinRoom(room, 'socket-2', 'Bob');
    updateRoomText(room, 'Updated agreement');
    updateParticipantName(room, 'socket-2', 'Bobby');
    toggleParticipantSign(room, 'socket-1');
    toggleParticipantSign(room, 'socket-2');
    setRoomTxHash(room, '0xabc');
    repository.saveRoom('room-update', room);

    expect(repository.getRoom('room-update')).toEqual({
      text: 'Updated agreement',
      participants: [
        { id: 'socket-1', name: 'Alice', signed: true },
        { id: 'socket-2', name: 'Bobby', signed: true },
      ],
      hashed: true,
      txHash: '0xabc',
    });

    repository.close();
  });

  it('deletes a room and cascades participants', () => {
    const repository = new SqliteRoomRepository(':memory:');
    const room = repository.getOrCreateRoom('room-delete');

    joinRoom(room, 'socket-1', 'Alice');
    repository.saveRoom('room-delete', room);

    expect(repository.deleteRoom('room-delete')).toBe(true);
    expect(repository.getRoom('room-delete')).toBeNull();
    expect(repository.removeParticipantFromDraftRooms('socket-1')).toEqual([]);

    repository.close();
  });

  it('removes a disconnected participant from every room', () => {
    const repository = new SqliteRoomRepository(':memory:');
    const roomA = repository.getOrCreateRoom('room-a');
    const roomB = repository.getOrCreateRoom('room-b');

    joinRoom(roomA, 'socket-1', 'Alice');
    joinRoom(roomB, 'socket-1', 'Alice');
    joinRoom(roomB, 'socket-2', 'Bob');
    repository.saveRoom('room-a', roomA);
    repository.saveRoom('room-b', roomB);

    expect(repository.removeParticipantFromDraftRooms('socket-1')).toEqual(['room-a', 'room-b']);
    expect(repository.getRoom('room-a')!.participants).toEqual([]);
    expect(repository.getRoom('room-b')!.participants).toEqual([{ id: 'socket-2', name: 'Bob', signed: false }]);

    repository.close();
  });

  it('keeps finalized signer sets intact on disconnect cleanup', () => {
    const repository = new SqliteRoomRepository(':memory:');
    const room = repository.getOrCreateRoom('room-locked');

    joinRoom(room, 'socket-1', 'Alice');
    joinRoom(room, 'socket-2', 'Bob');
    toggleParticipantSign(room, 'socket-1');
    toggleParticipantSign(room, 'socket-2');
    repository.saveRoom('room-locked', room);

    expect(repository.removeParticipantFromDraftRooms('socket-1')).toEqual([]);
    expect(repository.getRoom('room-locked')!.participants).toEqual([
      { id: 'socket-1', name: 'Alice', signed: true },
      { id: 'socket-2', name: 'Bob', signed: true },
    ]);

    repository.close();
  });

  it('persists rooms across repository instances when using a database file', () => {
    const databasePath = createTempDbPath();
    const firstRepository = new SqliteRoomRepository(databasePath);
    const room = firstRepository.getOrCreateRoom('durable-room');

    joinRoom(room, 'socket-1', 'Alice');
    updateRoomText(room, 'Durable agreement');
    repositorySaveAndClose(firstRepository, 'durable-room', room);

    const secondRepository = new SqliteRoomRepository(databasePath);

    expect(secondRepository.getRoom('durable-room')).toEqual({
      text: 'Durable agreement',
      participants: [{ id: 'socket-1', name: 'Alice', signed: false }],
      hashed: false,
      txHash: '',
    });

    secondRepository.close();
  });
});

function repositorySaveAndClose(repository: SqliteRoomRepository, roomId: string, room: ReturnType<SqliteRoomRepository['getOrCreateRoom']>): void {
  repository.saveRoom(roomId, room);
  repository.close();
}
