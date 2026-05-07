import { describe, expect, it } from 'vitest';
import {
  canLockRoom,
  createRoom,
  joinRoom,
  removeParticipantFromRooms,
  setRoomTxHash,
  toggleParticipantSign,
  updateRoomText,
} from '../../server/rooms';

describe('room state rules', () => {
  it('creates a room with default unlocked state', () => {
    const room = createRoom();

    expect(room.text).toContain('Договор купли-продажи');
    expect(room.participants).toEqual([]);
    expect(room.hashed).toBe(false);
    expect(room.txHash).toBe('');
  });

  it('joins anonymous participants when no name is provided', () => {
    const room = createRoom();

    joinRoom(room, 'socket-1', '');

    expect(room.participants).toEqual([{ id: 'socket-1', name: 'Аноним', signed: false }]);
  });

  it('does not lock a room with only one signer', () => {
    const room = createRoom();
    joinRoom(room, 'socket-1', 'Alice');

    toggleParticipantSign(room, 'socket-1');

    expect(canLockRoom(room)).toBe(false);
    expect(room.hashed).toBe(false);
  });

  it('locks the room after all participants sign', () => {
    const room = createRoom();
    joinRoom(room, 'socket-1', 'Alice');
    joinRoom(room, 'socket-2', 'Bob');

    toggleParticipantSign(room, 'socket-1');
    toggleParticipantSign(room, 'socket-2');

    expect(room.participants.every((participant) => participant.signed)).toBe(true);
    expect(room.hashed).toBe(true);
  });

  it('prevents text changes after the room is locked', () => {
    const room = createRoom();
    joinRoom(room, 'socket-1', 'Alice');
    joinRoom(room, 'socket-2', 'Bob');
    toggleParticipantSign(room, 'socket-1');
    toggleParticipantSign(room, 'socket-2');

    const changed = updateRoomText(room, 'Changed after lock');

    expect(changed).toBe(false);
    expect(room.text).not.toBe('Changed after lock');
  });

  it('stores a blockchain transaction hash', () => {
    const room = createRoom();

    setRoomTxHash(room, '0xabc');

    expect(room.txHash).toBe('0xabc');
  });

  it('removes a disconnected participant from all rooms', () => {
    const rooms = new Map([
      ['room-a', createRoom()],
      ['room-b', createRoom()],
    ]);
    joinRoom(rooms.get('room-a')!, 'socket-1', 'Alice');
    joinRoom(rooms.get('room-b')!, 'socket-1', 'Alice');
    joinRoom(rooms.get('room-b')!, 'socket-2', 'Bob');

    const changedRooms = removeParticipantFromRooms(rooms, 'socket-1');

    expect(changedRooms).toEqual(['room-a', 'room-b']);
    expect(rooms.get('room-a')!.participants).toEqual([]);
    expect(rooms.get('room-b')!.participants).toEqual([{ id: 'socket-2', name: 'Bob', signed: false }]);
  });
});
