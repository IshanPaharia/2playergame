const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Room storage
// roomCode -> { id, players: [{id, name, score}], state, numbers: {playerId: number}, roundNumber, roundStartTime }
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing characters like O, 0, I, 1
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    let currentRoomCode = null;
    let currentPlayerName = null;

    // Create a new room
    socket.on('create-room', ({ playerName }) => {
      let roomCode;
      do {
        roomCode = generateRoomCode();
      } while (rooms.has(roomCode));

      const newRoom = {
        id: roomCode,
        players: [{ id: socket.id, name: playerName, score: 0 }],
        state: 'waiting', // waiting, inputting, countdown, playing, round-end, game-end
        numbers: {},
        roundNumber: 1,
        roundStartTime: null,
      };

      rooms.set(roomCode, newRoom);
      currentRoomCode = roomCode;
      currentPlayerName = playerName;

      socket.join(roomCode);
      socket.emit('room-created', { roomCode, player: newRoom.players[0] });
      console.log(`Room created: ${roomCode} by ${playerName}`);
    });

    // Join an existing room
    socket.on('join-room', ({ roomCode, playerName }) => {
      const code = roomCode.toUpperCase().trim();
      const room = rooms.get(code);

      if (!room) {
        socket.emit('error-msg', 'Room not found. Check the code and try again.');
        return;
      }

      if (room.players.length >= 2) {
        socket.emit('error-msg', 'This room is full (max 2 players).');
        return;
      }

      const newPlayer = { id: socket.id, name: playerName, score: 0 };
      room.players.push(newPlayer);
      room.state = 'inputting'; // Transition to inputting since 2 players are now here

      currentRoomCode = code;
      currentPlayerName = playerName;

      socket.join(code);
      io.to(code).emit('game-started', {
        roomCode: code,
        players: room.players,
        state: room.state,
        roundNumber: room.roundNumber
      });
      console.log(`Player ${playerName} joined room: ${code}`);
    });

    // Player submits their secret number
    socket.on('submit-number', ({ roomCode, number }) => {
      const room = rooms.get(roomCode);
      if (!room) return;

      const numValue = parseInt(number, 10);
      if (isNaN(numValue) || numValue < 0 || numValue > 100) {
        socket.emit('error-msg', 'Invalid number. Must be between 0 and 100.');
        return;
      }

      // Record player's number
      room.numbers[socket.id] = numValue;
      
      // Let other player know that this player is ready
      socket.to(roomCode).emit('opponent-ready');

      // Check if both players have submitted
      const submittedIds = Object.keys(room.numbers);
      if (submittedIds.length === 2 && room.players.length === 2) {
        room.state = 'countdown';
        io.to(roomCode).emit('state-update', { state: 'countdown' });

        // Start countdown
        let count = 3;
        io.to(roomCode).emit('countdown-tick', count);

        const interval = setInterval(() => {
          count--;
          if (count > 0) {
            io.to(roomCode).emit('countdown-tick', count);
          } else {
            clearInterval(interval);
            room.state = 'playing';
            room.roundStartTime = Date.now();

            // Reveal numbers to both players
            const p1 = room.players[0];
            const p2 = room.players[1];
            const num1 = room.numbers[p1.id];
            const num2 = room.numbers[p2.id];

            io.to(roomCode).emit('round-started', {
              numbers: [
                { playerId: p1.id, playerName: p1.name, value: num1 },
                { playerId: p2.id, playerName: p2.name, value: num2 }
              ]
            });
          }
        }, 1000);
      }
    });

    // Player submits a sum guess
    socket.on('submit-guess', ({ roomCode, guess }) => {
      const room = rooms.get(roomCode);
      if (!room || room.state !== 'playing') return;

      const guessValue = parseInt(guess, 10);
      const p1 = room.players[0];
      const p2 = room.players[1];
      const num1 = room.numbers[p1.id];
      const num2 = room.numbers[p2.id];
      const correctSum = num1 + num2;

      if (guessValue === correctSum) {
        // Correct answer! First one wins the round
        room.state = 'round-end';
        const solveTime = (Date.now() - room.roundStartTime) / 1000; // in seconds

        // Find winning player and increment score
        const winner = room.players.find(p => p.id === socket.id);
        winner.score++;

        // Check for match winner (first to 3 score wins)
        let gameWinnerId = null;
        if (winner.score >= 3) {
          room.state = 'game-end';
          gameWinnerId = winner.id;
        }

        io.to(roomCode).emit('round-completed', {
          winnerId: socket.id,
          winnerName: winner.name,
          solveTime: solveTime.toFixed(2),
          scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
          numbers: [
            { name: p1.name, value: num1 },
            { name: p2.name, value: num2 }
          ],
          sum: correctSum,
          gameWinnerId
        });

        console.log(`Round completed in room ${roomCode}. Winner: ${winner.name} (Time: ${solveTime.toFixed(2)}s)`);
      } else {
        // Incorrect answer!
        socket.emit('guess-wrong');
      }
    });

    // Request to start next round
    socket.on('request-next-round', ({ roomCode }) => {
      const room = rooms.get(roomCode);
      if (!room || (room.state !== 'round-end' && room.state !== 'playing')) return;

      room.numbers = {};
      room.roundNumber++;
      room.state = 'inputting';

      io.to(roomCode).emit('game-started', {
        roomCode: room.id,
        players: room.players,
        state: room.state,
        roundNumber: room.roundNumber
      });
      console.log(`Starting round ${room.roundNumber} in room ${roomCode}`);
    });

    // Restart/Rematch request
    socket.on('request-rematch', ({ roomCode }) => {
      const room = rooms.get(roomCode);
      if (!room || room.state !== 'game-end') return;

      // Reset room variables
      room.players.forEach(p => p.score = 0);
      room.numbers = {};
      room.roundNumber = 1;
      room.state = 'inputting';

      io.to(roomCode).emit('game-started', {
        roomCode: room.id,
        players: room.players,
        state: room.state,
        roundNumber: room.roundNumber
      });
      console.log(`Rematch started in room ${roomCode}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      if (currentRoomCode) {
        const room = rooms.get(currentRoomCode);
        if (room) {
          // Remove player from room
          room.players = room.players.filter(p => p.id !== socket.id);
          
          if (room.players.length === 0) {
            // Delete room if empty
            rooms.delete(currentRoomCode);
            console.log(`Room ${currentRoomCode} deleted because it's empty.`);
          } else {
            // Inform remaining player
            room.state = 'waiting';
            room.numbers = {};
            room.roundNumber = 1;
            room.players[0].score = 0; // Reset score

            io.to(currentRoomCode).emit('opponent-disconnected', {
              msg: `${currentPlayerName || 'Your opponent'} has disconnected. Game reset.`
            });
            console.log(`Opponent left room: ${currentRoomCode}. Remaining player: ${room.players[0].name}`);
          }
        }
      }
    });
  });

  httpServer.once('error', (err) => {
    console.error(err);
    process.exit(1);
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
