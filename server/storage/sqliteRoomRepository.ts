import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Participant, RoomState } from '../../src/types/room';
import { createRoom } from '../rooms';
import { initializeDatabase, openDatabase } from './db';
import type { RoomRepository } from './roomRepository';

interface RoomRow {
  text: string;
  hashed: 0 | 1;
  tx_hash: string;
}

interface ParticipantRow {
  id: string;
  name: string;
  signed: 0 | 1;
}

export class SqliteRoomRepository implements RoomRepository {
  private readonly db: SqliteDatabase;

  constructor(databasePathOrDb?: string | SqliteDatabase) {
    if (typeof databasePathOrDb === 'object' && databasePathOrDb) {
      this.db = databasePathOrDb;
    } else {
      this.db = openDatabase(typeof databasePathOrDb === 'string' ? databasePathOrDb : undefined);
    }
    initializeDatabase(this.db);
  }

  getRoom(roomId: string): RoomState | null {
    const room = this.db.prepare<[string], RoomRow>('SELECT text, hashed, tx_hash FROM rooms WHERE id = ?').get(roomId);
    if (!room) return null;

    const participants = this.db
      .prepare<[string], ParticipantRow>('SELECT id, name, signed FROM participants WHERE room_id = ? ORDER BY rowid')
      .all(roomId)
      .map((participant) => this.mapParticipant(participant));

    return {
      text: room.text,
      participants,
      hashed: Boolean(room.hashed),
      txHash: room.tx_hash,
    };
  }

  createRoom(roomId: string): RoomState {
    const room = createRoom();
    this.saveRoom(roomId, room);
    return room;
  }

  getOrCreateRoom(roomId: string): RoomState {
    return this.getRoom(roomId) ?? this.createRoom(roomId);
  }

  saveRoom(roomId: string, room: RoomState): void {
    const save = this.db.transaction((id: string, state: RoomState) => {
      const now = new Date().toISOString();

      this.db.prepare(`
        INSERT INTO rooms (id, text, hashed, tx_hash, created_at, updated_at)
        VALUES (@id, @text, @hashed, @txHash, @now, @now)
        ON CONFLICT(id) DO UPDATE SET
          text = excluded.text,
          hashed = excluded.hashed,
          tx_hash = excluded.tx_hash,
          updated_at = excluded.updated_at
      `).run({
        id,
        text: state.text,
        hashed: state.hashed ? 1 : 0,
        txHash: state.txHash,
        now,
      });

      this.db.prepare<[string]>('DELETE FROM participants WHERE room_id = ?').run(id);

      const insertParticipant = this.db.prepare(`
        INSERT INTO participants (room_id, id, name, signed, updated_at)
        VALUES (@roomId, @id, @name, @signed, @updatedAt)
      `);

      state.participants.forEach((participant) => {
        insertParticipant.run({
          roomId: id,
          id: participant.id,
          name: participant.name,
          signed: participant.signed ? 1 : 0,
          updatedAt: now,
        });
      });
    });

    save(roomId, room);
  }

  deleteRoom(roomId: string): boolean {
    const result = this.db.prepare<[string]>('DELETE FROM rooms WHERE id = ?').run(roomId);
    return result.changes > 0;
  }

  removeParticipantFromDraftRooms(socketId: string): string[] {
    const roomIds = this.db
      .prepare<[string], { room_id: string }>(`
        SELECT participants.room_id
        FROM participants
        INNER JOIN rooms ON rooms.id = participants.room_id
        WHERE participants.id = ? AND rooms.hashed = 0
        ORDER BY participants.room_id
      `)
      .all(socketId)
      .map((row) => row.room_id);

    if (roomIds.length === 0) return [];

    const removeParticipant = this.db.prepare<[string, string]>(`
      DELETE FROM participants
      WHERE id = ? AND room_id = ?
    `);

    roomIds.forEach((roomId) => {
      removeParticipant.run(socketId, roomId);
    });

    return roomIds;
  }

  close(): void {
    if (this.db.open) {
      this.db.close();
    }
  }

  private mapParticipant(participant: ParticipantRow): Participant {
    return {
      id: participant.id,
      name: participant.name,
      signed: Boolean(participant.signed),
    };
  }
}
