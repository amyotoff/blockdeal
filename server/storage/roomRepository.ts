import type { RoomState } from '../../src/types/room';

export interface RoomRepository {
  getRoom(roomId: string): RoomState | null;
  createRoom(roomId: string): RoomState;
  getOrCreateRoom(roomId: string): RoomState;
  saveRoom(roomId: string, room: RoomState): void;
  deleteRoom(roomId: string): boolean;
  removeParticipantFromDraftRooms(socketId: string): string[];
  close(): void;
}
