import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer as createHttpServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    }
  });

  // Simple in-memory state for rooms
  // room_id -> { text: string, participants: { id: string, name: string, signed: boolean }[], hashed: boolean, txHash: string }
  const rooms = new Map();

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join_room', (roomId, userName) => {
      socket.join(roomId);
      
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          text: 'Договор купли-продажи\n\nМодель R2-D2 (далее "Покупатель") и Сгибальщик Сгибающий Родригес, он же Бендер (далее "Продавец"), заключили настоящий договор о нижеследующем:\n\n1. Продавец обязуется передать в собственность Покупателю, а Покупатель обязуется принять и оплатить атомный аккумулятор емкостью 10 000 МВт·ч для домашних нужд.\n2. Товар должен быть доставлен в исправном состоянии, без следов взлома, кражи или воздействия алкоголя.\n3. В случае нарушения сроков поставки Продавец обязуется выплатить неустойку в размере 10 криптокредитов за каждый оборот вокруг Солнца, но оставляет за собой право потребовать от Покупателя блестящий зад.',
          participants: [],
          hashed: false,
          txHash: ''
        });
      }
      
      const room = rooms.get(roomId);
      
      // Add or update participant
      const existing = room.participants.find(p => p.id === socket.id);
      if (!existing) {
        room.participants.push({ id: socket.id, name: userName || 'Аноним', signed: false });
      }

      io.to(roomId).emit('room_state', room);
    });

    socket.on('update_text', (roomId, newText) => {
      const room = rooms.get(roomId);
      if (room && !room.hashed) {
        room.text = newText;
        // Broadcast to everyone else in the room
        socket.to(roomId).emit('text_updated', newText);
      }
    });

    socket.on('update_name', (roomId, newName) => {
      const room = rooms.get(roomId);
      if (room) {
        const p = room.participants.find(p => p.id === socket.id);
        if (p) {
          p.name = newName;
          io.to(roomId).emit('room_state', room);
        }
      }
    });

    socket.on('toggle_sign', (roomId) => {
      const room = rooms.get(roomId);
      if (room && !room.hashed) {
        const p = room.participants.find(p => p.id === socket.id);
        if (p) {
          p.signed = !p.signed;
          
          // Check if everyone signed
          const allSigned = room.participants.length > 1 && room.participants.every(part => part.signed);
          if (allSigned) {
            room.hashed = true;
          }
          
          io.to(roomId).emit('room_state', room);
        }
      }
    });

    socket.on('set_tx_hash', (roomId, txHash) => {
      const room = rooms.get(roomId);
      if (room) {
        room.txHash = txHash;
        io.to(roomId).emit('room_state', room);
      }
    });

    socket.on('disconnect', () => {
      // Find which room they were in and remove them
      rooms.forEach((room, roomId) => {
        const initialCount = room.participants.length;
        room.participants = room.participants.filter(p => p.id !== socket.id);
        if (room.participants.length !== initialCount) {
          io.to(roomId).emit('room_state', room);
        }
      });
    });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
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

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
