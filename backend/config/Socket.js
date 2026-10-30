const {
  createRoom,
  getRoom,
  joinRoom,
  startGame,
  selectWord,
  checkGuess,
  startNextRound,
  getLeaderboard,
} = require("../services/roomService");

const ROUND_DURATION = 120;
const MAX_CHAT_LENGTH = 200;
const MAX_CHAT_HISTORY = 100;

module.exports = function (io) {
  const roundTimers = new Map();
  const roundEndTimeouts = new Map();
  const endingRounds = new Set();
  const chatHistories = new Map();

  // ---------------- CHAT HELPERS ----------------

  function getChatHistory(roomCode) {
    if (!chatHistories.has(roomCode)) {
      chatHistories.set(roomCode, []);
    }

    return chatHistories.get(roomCode);
  }

  function addChatMessage(roomCode, messageData) {
    const history = getChatHistory(roomCode);

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      roomCode,
      timestamp: Date.now(),
      ...messageData,
    };

    history.push(message);

    if (history.length > MAX_CHAT_HISTORY) {
      history.splice(0, history.length - MAX_CHAT_HISTORY);
    }

    io.to(roomCode).emit("chat-message", message);

    return message;
  }

  function addSystemMessage(room, message) {
    if (!room) return;

    addChatMessage(room.code, {
      type: "system",
      senderId: null,
      senderName: "System",
      message,
    });
  }

  // ---------------- ROOM HELPERS ----------------

  function sendPlayersUpdated(room) {
    io.to(room.code).emit("players-updated", {
      roomCode: room.code,
      players: room.players,
      hostId: room.hostId,
      settings: room.settings || {},
    });
  }

  function sendGameStarted(room) {
    io.to(room.code).emit("game-started", {
      roomCode: room.code,
      players: room.players,
      hostId: room.hostId,
      drawerId: room.drawerId,
      round: room.round,
      currentRound: room.round,
      totalRounds: room.totalRounds,
      settings: room.settings || {},
    });
  }

  function sendGameStartedToPlayer(socket, room) {
    socket.emit("game-started", {
      roomCode: room.code,
      players: room.players,
      hostId: room.hostId,
      drawerId: room.drawerId,
      round: room.round,
      currentRound: room.round,
      totalRounds: room.totalRounds,
      settings: room.settings || {},
    });
  }

  // ---------------- WORD HINT HELPERS ----------------

  function createMaskedWord(room) {
    if (!room || !room.currentWord) return "";

    const revealed = room.revealedIndices || [];

    return room.currentWord
      .split("")
      .map((letter, index) => {
        if (letter === " ") return " ";
        if (revealed.includes(index)) return letter.toUpperCase();
        return "-";
      })
      .join("");
  }

  function sendWordHint(room, target = room.code) {
    if (!room || !room.currentWord) return;

    io.to(target).emit("word-hint", {
      roomCode: room.code,
      wordLength: room.currentWord.length,
      maskedWord: createMaskedWord(room),
    });
  }

  function revealNextLetter(room) {
    if (!room || !room.currentWord || room.roundEnding) return;

    if (!Array.isArray(room.revealedIndices)) {
      room.revealedIndices = [];
    }

    const unrevealed = [];

    for (let i = 0; i < room.currentWord.length; i++) {
      if (
        room.currentWord[i] !== " " &&
        !room.revealedIndices.includes(i)
      ) {
        unrevealed.push(i);
      }
    }

    if (unrevealed.length === 0) return;

    const randomIndex = Math.floor(
      Math.random() * unrevealed.length
    );

    room.revealedIndices.push(unrevealed[randomIndex]);

    io.to(room.code).emit("word-hint", {
      roomCode: room.code,
      wordLength: room.currentWord.length,
      maskedWord: createMaskedWord(room),
    });
  }

  // ---------------- TIMER HELPERS ----------------

  function clearRoundTimer(roomCode) {
    const timer = roundTimers.get(roomCode);

    if (timer) {
      clearInterval(timer.interval);
      roundTimers.delete(roomCode);
    }
  }

  function clearRoundEndTimeout(roomCode) {
    const timeout = roundEndTimeouts.get(roomCode);

    if (timeout) {
      clearTimeout(timeout);
      roundEndTimeouts.delete(roomCode);
    }
  }

  function startRoundTimer(room) {
    clearRoundTimer(room.code);

    const duration =
      Number(room.settings?.drawTime) || ROUND_DURATION;

    const endsAt = Date.now() + duration * 1000;

    function emitTime() {
      const remainingSeconds = Math.max(
        0,
        Math.ceil((endsAt - Date.now()) / 1000)
      );

      io.to(room.code).emit("timer-update", {
        roomCode: room.code,
        remainingSeconds,
      });

      return remainingSeconds;
    }

    emitTime();

    const interval = setInterval(() => {
      const currentRoom = getRoom(room.code);

      if (!currentRoom || currentRoom.status !== "playing") {
        clearRoundTimer(room.code);
        return;
      }

      if (currentRoom.roundEnding) {
        clearRoundTimer(room.code);
        return;
      }

      if (emitTime() <= 0) {
        clearRoundTimer(room.code);
        endRound(room.code, "time-up");
      }
    }, 1000);

    roundTimers.set(room.code, {
      interval,
      endsAt,
    });
  }

  // ---------------- ROUND END ----------------

  function endRound(roomCode, reason) {
    if (endingRounds.has(roomCode)) return;

    const room = getRoom(roomCode);

    if (!room || room.status !== "playing") return;

    endingRounds.add(roomCode);
    room.roundEnding = true;

    clearRoundTimer(roomCode);
    clearRoundEndTimeout(roomCode);

    const endMessage =
      reason === "time-up"
        ? "Time is up! The round has ended."
        : "A player guessed the word! The round has ended.";

    addSystemMessage(room, endMessage);

    io.to(room.code).emit("round-ended", {
      roomCode: room.code,
      round: room.round,
      totalRounds: room.totalRounds,
      players: room.players,
      reason,
    });

    io.to(room.code).emit("leaderboard-updated", {
      roomCode: room.code,
      round: room.round,
      totalRounds: room.totalRounds,
      leaderboard: getLeaderboard(room.code),
      isFinalRound: room.round >= room.totalRounds,
    });

    const timeout = setTimeout(() => {
      roundEndTimeouts.delete(roomCode);

      const currentRoom = getRoom(roomCode);

      if (!currentRoom || currentRoom.status !== "playing") {
        endingRounds.delete(roomCode);
        return;
      }

      const result = startNextRound(roomCode);

      if (!result || result.error) {
        endingRounds.delete(roomCode);

        console.error(
          "Next round error:",
          result?.error || "Unable to start next round"
        );

        return;
      }

      const nextRoom = result.room;

      // Reset round-specific drawing and hint history.
      nextRoom.revealedIndices = [];
      nextRoom.drawHistory = [];

      endingRounds.delete(roomCode);

      // ---------------- GAME OVER ----------------

      if (nextRoom.status === "finished") {
        clearRoundTimer(roomCode);

        const highestScore = Math.max(
          0,
          ...nextRoom.players.map(
            (player) => Number(player.score) || 0
          )
        );

        addSystemMessage(
          nextRoom,
          "Game over! Check the final scores."
        );

        io.to(nextRoom.code).emit("leaderboard-updated", {
          roomCode: nextRoom.code,
          round: nextRoom.round,
          totalRounds: nextRoom.totalRounds,
          leaderboard: getLeaderboard(nextRoom.code),
          isFinalRound: true,
        });

        io.to(nextRoom.code).emit("game-over", {
          roomCode: nextRoom.code,
          players: nextRoom.players,
          winners: nextRoom.winners || [],
          highestScore,
        });

        sendPlayersUpdated(nextRoom);
        return;
      }

      // ---------------- NEXT ROUND ----------------

      addSystemMessage(
        nextRoom,
        `Round ${nextRoom.round} of ${nextRoom.totalRounds} has started.`
      );

      sendGameStarted(nextRoom);

      io.to(nextRoom.code).emit("clear-canvas", {
        roomCode: nextRoom.code,
      });

      io.to(nextRoom.drawerId).emit("word-options", {
        roomCode: nextRoom.code,
        wordOptions: nextRoom.wordOptions || [],
      });

      sendPlayersUpdated(nextRoom);
    }, 5000);

    roundEndTimeouts.set(roomCode, timeout);
  }

  // ---------------- CONNECTION ----------------

  io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    // ---------------- CREATE ROOM ----------------

    socket.on("create-room", (data) => {
      let playerName;
      let settings = {};

      if (typeof data === "string") {
        playerName = data;
      } else if (data && typeof data === "object") {
        playerName = data.playerName;
        settings = data.settings || {};
      }

      if (
        typeof playerName !== "string" ||
        !playerName.trim()
      ) {
        socket.emit("room-error", "Please enter your name.");
        return;
      }

      const room = createRoom(
        playerName.trim(),
        socket.id,
        settings
      );

      if (!room || room.error) {
        socket.emit(
          "room-error",
          room?.error || "Unable to create room."
        );
        return;
      }

      socket.join(room.code);

      socket.emit("room-created", {
        roomCode: room.code,
        players: room.players,
        hostId: room.hostId,
        settings: room.settings || {},
      });

      addSystemMessage(
        room,
        `${room.players[0]?.name || "A player"} created the room.`
      );

      console.log("Room created:", room.code, room.settings);
    });

    // ---------------- JOIN ROOM ----------------

    socket.on("join-room", (data) => {
      if (
        !data ||
        typeof data.playerName !== "string" ||
        !data.playerName.trim() ||
        typeof data.roomCode !== "string" ||
        !data.roomCode.trim()
      ) {
        socket.emit(
          "room-error",
          "Enter your name and room code."
        );
        return;
      }

      const result = joinRoom(
        data.roomCode.trim().toUpperCase(),
        data.playerName.trim(),
        socket.id
      );

      if (!result || result.error) {
        socket.emit(
          "room-error",
          result?.error || "Unable to join room."
        );
        return;
      }

      const room = result.room;

      socket.join(room.code);

      sendPlayersUpdated(room);

      socket.emit("room-joined", {
        roomCode: room.code,
        players: room.players,
        hostId: room.hostId,
        settings: room.settings || {},
      });

      const joinedPlayer = room.players.find(
        (player) => player.id === socket.id
      );

      addSystemMessage(
        room,
        `${joinedPlayer?.name || "A player"} joined the room.`
      );
    });

    // ---------------- START GAME ----------------

    socket.on("start-game", (roomCode) => {
      const roomBeforeStart = getRoom(roomCode);

      if (
        !roomBeforeStart ||
        !socket.rooms.has(roomBeforeStart.code)
      ) {
        socket.emit("room-error", "You are not in this room.");
        return;
      }

      const result = startGame(roomCode, socket.id);

      if (!result || result.error) {
        socket.emit(
          "room-error",
          result?.error || "Unable to start game."
        );
        return;
      }

      const room = result.room;
      room.revealedIndices = [];
      room.drawHistory = [];

      addSystemMessage(room, "The game has started!");

      sendGameStarted(room);

      io.to(room.drawerId).emit("word-options", {
        roomCode: room.code,
        wordOptions: room.wordOptions || [],
      });

      sendPlayersUpdated(room);

      console.log("GAME STARTED:", {
        roomCode: room.code,
        drawerId: room.drawerId,
        wordOptions: room.wordOptions,
      });
    });

    // ---------------- RESTORE GAME STATE ----------------

    socket.on("get-game-state", (roomCode) => {
      const room = getRoom(roomCode);

      if (!room || !socket.rooms.has(room.code)) {
        console.log("STATE RESTORE FAILED:", {
          roomCode,
          socketId: socket.id,
          reason: "Room not found or socket not in room",
        });

        return;
      }

      console.log("RESTORING GAME STATE:", {
        roomCode: room.code,
        socketId: socket.id,
        drawerId: room.drawerId,
        status: room.status,
        roundEnding: room.roundEnding,
        currentWord: Boolean(room.currentWord),
        wordOptions: room.wordOptions,
      });

      socket.emit("chat-history", {
        roomCode: room.code,
        messages: getChatHistory(room.code),
      });

      if (room.status === "finished") {
        socket.emit("leaderboard-updated", {
          roomCode: room.code,
          round: room.round,
          totalRounds: room.totalRounds,
          leaderboard: getLeaderboard(room.code),
          isFinalRound: true,
        });

        socket.emit("game-over", {
          roomCode: room.code,
          players: room.players,
          winners: room.winners || [],
          highestScore: Math.max(
            0,
            ...room.players.map(
              (player) => Number(player.score) || 0
            )
          ),
        });

        return;
      }

      if (room.status === "waiting") {
        sendPlayersUpdated(room);
        return;
      }

      sendGameStartedToPlayer(socket, room);

      socket.emit("drawing-history", {
        roomCode: room.code,
        strokes: Array.isArray(room.drawHistory) ? room.drawHistory : [],
      });

      if (room.roundEnding) {
        socket.emit("round-ended", {
          roomCode: room.code,
          round: room.round,
          totalRounds: room.totalRounds,
          players: room.players,
          reason: "round-ending",
        });

        socket.emit("leaderboard-updated", {
          roomCode: room.code,
          round: room.round,
          totalRounds: room.totalRounds,
          leaderboard: getLeaderboard(room.code),
          isFinalRound: room.round >= room.totalRounds,
        });

        return;
      }

      if (socket.id === room.drawerId) {
        if (room.currentWord) {
          socket.emit("word-selected", {
            roomCode: room.code,
            word: room.currentWord,
          });
        } else {
          socket.emit("word-options", {
            roomCode: room.code,
            wordOptions: room.wordOptions || [],
          });
        }
      } else if (room.currentWord) {
        sendWordHint(room, socket.id);
      }

      const timer = roundTimers.get(room.code);

      if (timer) {
        socket.emit("timer-update", {
          roomCode: room.code,
          remainingSeconds: Math.max(
            0,
            Math.ceil((timer.endsAt - Date.now()) / 1000)
          ),
        });
      }

      sendPlayersUpdated(room);
    });

    // ---------------- REAL-TIME CHAT ----------------

    socket.on("send-chat-message", (data) => {
      if (
        !data ||
        typeof data.roomCode !== "string" ||
        typeof data.message !== "string"
      ) {
        return;
      }

      const room = getRoom(data.roomCode);

      if (!room || !socket.rooms.has(room.code)) {
        socket.emit("chat-error", {
          message: "You are not in this room.",
        });
        return;
      }

      const player = room.players.find(
        (item) => item.id === socket.id
      );

      if (!player) {
        socket.emit("chat-error", {
          message: "Player not found in this room.",
        });
        return;
      }

      const message = data.message.trim();

      if (!message) {
        socket.emit("chat-error", {
          message: "Message cannot be empty.",
        });
        return;
      }

      if (message.length > MAX_CHAT_LENGTH) {
        socket.emit("chat-error", {
          message: `Message cannot exceed ${MAX_CHAT_LENGTH} characters.`,
        });
        return;
      }

      if (room.status === "finished") {
        socket.emit("chat-error", {
          message: "The game has finished.",
        });
        return;
      }

      addChatMessage(room.code, {
        type: "player",
        senderId: socket.id,
        senderName: player.name,
        message,
      });
    });

    // ---------------- SELECT WORD ----------------

    socket.on("select-word", (data) => {
      if (!data || typeof data.roomCode !== "string") return;

      const result = selectWord(
        data.roomCode,
        socket.id,
        data.word
      );

      if (!result || result.error) {
        socket.emit(
          "room-error",
          result?.error || "Unable to select word."
        );
        return;
      }

      const room = result.room;

      room.revealedIndices = [];
      room.drawHistory = [];

      io.to(room.drawerId).emit("word-selected", {
        roomCode: room.code,
        word: room.currentWord,
      });

      sendWordHint(room);

      startRoundTimer(room);
    });

    // ---------------- DRAWING ----------------

    socket.on("drawing", (data) => {
      if (!data || typeof data.roomCode !== "string") return;

      const room = getRoom(data.roomCode);

      if (!room || !socket.rooms.has(room.code)) return;
      if (room.status !== "playing") return;
      if (socket.id !== room.drawerId || !room.currentWord) return;
      if (room.roundEnding) return;

      const validNumbers = [
        data.x,
        data.y,
        data.lastX,
        data.lastY,
        data.brushSize,
      ].every(Number.isFinite);

      if (
        !validNumbers ||
        data.brushSize < 1 ||
        data.brushSize > 25
      ) {
        return;
      }

      if (
        typeof data.color !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(data.color)
      ) {
        return;
      }

      // Keep a server-side drawing history so Undo works for every player.
      if (!Array.isArray(room.drawHistory)) room.drawHistory = [];

      const segment = {
        x: data.x,
        y: data.y,
        lastX: data.lastX,
        lastY: data.lastY,
        isStart: data.isStart === true,
      };

      if (segment.isStart || room.drawHistory.length === 0) {
        room.drawHistory.push({
          strokeId: data.strokeId || `${Date.now()}-${Math.random()}`,
          color: data.color,
          brushSize: data.brushSize,
          segments: [segment],
        });
      } else {
        const currentStroke = room.drawHistory[room.drawHistory.length - 1];
        currentStroke.segments.push(segment);
      }

      // Prevent unbounded memory growth during a long round.
      if (room.drawHistory.length > 500) {
        room.drawHistory.shift();
      }

      socket.to(room.code).emit("drawing", {
        roomCode: room.code,
        strokeId: data.strokeId,
        x: data.x,
        y: data.y,
        lastX: data.lastX,
        lastY: data.lastY,
        color: data.color,
        brushSize: data.brushSize,
        isStart: segment.isStart,
      });
    });

    // ---------------- CLEAR CANVAS ----------------

    socket.on("clear-canvas", (roomCode) => {
      const room = getRoom(roomCode);

      if (!room || !socket.rooms.has(room.code)) return;
      if (room.status !== "playing") return;
      if (socket.id !== room.drawerId || !room.currentWord) return;
      if (room.roundEnding) return;

      room.drawHistory = [];
      socket.to(room.code).emit("clear-canvas", {
        roomCode: room.code,
      });
    });

    // ---------------- UNDO LAST STROKE ----------------

    socket.on("undo-drawing", (roomCode) => {
      const room = getRoom(roomCode);

      if (!room || !socket.rooms.has(room.code)) return;
      if (room.status !== "playing") return;
      if (socket.id !== room.drawerId || !room.currentWord) return;
      if (room.roundEnding) return;

      if (!Array.isArray(room.drawHistory)) room.drawHistory = [];
      if (room.drawHistory.length === 0) {
        socket.emit("undo-result", {
          roomCode: room.code,
          success: false,
          message: "Nothing to undo.",
        });
        return;
      }

      room.drawHistory.pop();

      // Send the complete remaining history so every canvas stays identical.
      io.to(room.code).emit("drawing-history", {
        roomCode: room.code,
        strokes: room.drawHistory,
      });
    });

    // ---------------- SUBMIT GUESS ----------------

    socket.on("submit-guess", (data) => {
      if (
        !data ||
        typeof data.roomCode !== "string" ||
        typeof data.guess !== "string" ||
        !data.guess.trim()
      ) {
        return;
      }

      const room = getRoom(data.roomCode);

      if (!room || !socket.rooms.has(room.code)) {
        socket.emit("guess-error", "You are not in this room.");
        return;
      }

      if (room.status !== "playing" || room.roundEnding) {
        return;
      }

      const result = checkGuess(
        room.code,
        socket.id,
        data.guess.trim()
      );

      if (!result || result.error) {
        socket.emit(
          "guess-error",
          result?.error || "Unable to check your answer."
        );
        return;
      }

      const player = room.players.find(
        (item) => item.id === socket.id
      );

      io.to(room.code).emit("guess-result", {
        roomCode: room.code,
        playerId: socket.id,
        playerName: player?.name,
        correct: result.correct,
        alreadyGuessed: result.alreadyGuessed,
        message:
          result.message ||
          (result.correct
            ? "Correct answer!"
            : result.alreadyGuessed
            ? "You have already guessed correctly."
            : "Wrong answer! -5 points. Try again!"),
        pointsDeducted: result.pointsDeducted || 0,
      });

      // Reveal one random letter only after a genuine wrong guess
      if (!result.correct && !result.alreadyGuessed) {
        revealNextLetter(room);
      }

      if (result.correct && !result.alreadyGuessed) {
        addSystemMessage(
          room,
          `${player?.name || "A player"} guessed the word correctly!`
        );
      }

      sendPlayersUpdated(room);
if (result.roundComplete) {
  endRound(room.code, "correct-guess");
}
    });

    // ---------------- DISCONNECT ----------------

    socket.on("disconnect", () => {
      console.log("Player disconnected:", socket.id);
    });
  });
};