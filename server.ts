import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer as createHttpServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import {
  joinRoom,
  setRoomTxHash,
  toggleParticipantSign,
  updateParticipantName,
  updateRoomText,
} from './server/rooms';
import { SqliteRoomRepository } from './server/storage/sqliteRoomRepository';
import type { RoomRepository } from './server/storage/roomRepository';

interface BlockDealServerOptions {
  port?: number;
  host?: string;
  useVite?: boolean;
  databasePath?: string;
  roomRepository?: RoomRepository;
}

export async function createBlockDealServer(options: BlockDealServerOptions = {}) {
  // One Node process serves both the HTTP app and realtime Socket.IO events.
  const app = express();
  const port = options.port ?? 3000;
  const host = options.host ?? '0.0.0.0';
  const useVite = options.useVite ?? process.env.NODE_ENV !== 'production';
  
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    }
  });

  // KISS persistence: one repository keeps room state durable without leaking DB details
  // into the realtime event handlers.
  const roomRepository = options.roomRepository ?? new SqliteRoomRepository(options.databasePath);

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join_room', (roomId, userName) => {
      // Socket.IO rooms let us broadcast updates only to participants of this contract.
      socket.join(roomId);
      
      // Lazily create a contract room the first time a shared room link is opened.
      const room = roomRepository.getOrCreateRoom(roomId);
      
      // One browser socket maps to one current participant in the room.
      joinRoom(room, socket.id, userName);
      roomRepository.saveRoom(roomId, room);

      io.to(roomId).emit('room_state', room);
    });

    socket.on('update_text', (roomId, newText) => {
      const room = roomRepository.getRoom(roomId);
      if (room && updateRoomText(room, newText)) {
        roomRepository.saveRoom(roomId, room);
        // Before lock, text sync is intentionally simple last-write-wins realtime sync.
        socket.to(roomId).emit('text_updated', newText);
      }
    });

    socket.on('update_name', (roomId, newName) => {
      const room = roomRepository.getRoom(roomId);
      if (room && updateParticipantName(room, socket.id, newName)) {
        roomRepository.saveRoom(roomId, room);
        io.to(roomId).emit('room_state', room);
      }
    });

    socket.on('toggle_sign', (roomId) => {
      const room = roomRepository.getRoom(roomId);
      if (room && toggleParticipantSign(room, socket.id)) {
        roomRepository.saveRoom(roomId, room);
        io.to(roomId).emit('room_state', room);
      }
    });

    socket.on('set_tx_hash', (roomId, txHash) => {
      const room = roomRepository.getRoom(roomId);
      if (room) {
        // The client sends the blockchain transaction hash after wallet submission.
        setRoomTxHash(room, txHash);
        roomRepository.saveRoom(roomId, room);
        io.to(roomId).emit('room_state', room);
      }
    });

    socket.on('disconnect', () => {
      // A disconnected socket no longer counts as an active participant.
      roomRepository.removeParticipant(socket.id).forEach((roomId) => {
        io.to(roomId).emit('room_state', roomRepository.getRoom(roomId));
      });
    });
  });

  // In development, Vite handles frontend files through middleware.
  // In production, the same Node server serves the built static app.
  if (useVite) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return {
    app,
    httpServer,
    io,
    roomRepository,
    listen: () => new Promise<void>((resolve) => {
      httpServer.listen(port, host, () => {
        const address = httpServer.address();
        const actualPort = typeof address === 'object' && address ? address.port : port;
        console.log(`Server running on http://localhost:${actualPort}`);
        resolve();
      });
    }),
    close: () => new Promise<void>((resolve, reject) => {
      io.close();
      httpServer.close((error) => {
        roomRepository.close();
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    }),
  };
}

async function startServer() {
  const server = await createBlockDealServer();
  await server.listen();
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
