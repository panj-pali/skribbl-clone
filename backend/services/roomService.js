const generateRoomCode = require("../utils/generateRoomCode");

const rooms = {};

const wordList = [
  "apple",
  "banana",
  "elephant",
  "computer",
  "house",
  "car",
  "pizza",
  "butterfly",
  "football",
  "guitar",
  "rainbow",
  "mountain",
  "Cat",
  "Dog",
  "Fish",
  "Duck",
  "Pig",
  "Cow",
  "Frog",
  "Bee",
  "Spider",
  "Monkey"
];

// GET RANDOM WORD OPTIONS
function getWordOptions(count = 3) {
  return [...wordList]
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
}

// CREATE ROOM
function createRoom(playerName, socketId, settings = {}) {
  let code = generateRoomCode();

  while (rooms[code]) {
    code = generateRoomCode();
  }

  const allowedDrawTimes = [60, 90, 120];
  const allowedRounds = [2, 3, 5];
  const allowedWordCounts = [1, 3, 5];
  const allowedPlayerLimits = [4, 8, 12];

  const drawTime = allowedDrawTimes.includes(
    Number(settings.drawTime)
  )
    ? Number(settings.drawTime)
    : 120;

  const roundsPerPlayer = allowedRounds.includes(
    Number(settings.rounds)
  )
    ? Number(settings.rounds)
    : 2;

  const wordCount = allowedWordCounts.includes(
    Number(settings.wordCount)
  )
    ? Number(settings.wordCount)
    : 3;

  const maxPlayers = allowedPlayerLimits.includes(
    Number(settings.maxPlayers)
  )
    ? Number(settings.maxPlayers)
    : 8;

  rooms[code] = {
    code,
    hostId: socketId,

    settings: {
      drawTime,
      roundsPerPlayer,
      wordCount,
      maxPlayers,
    },

    players: [
      {
        id: socketId,
        name: playerName,
        score: 0,
        attempts: 0,
        wrongAttempts: 0,
      },
    ],

    status: "waiting",
    drawerId: null,
    currentWord: null,
    wordOptions: [],
    guessedPlayers: [],
    round: 0,
    totalRounds: 0,
    roundEnding: false,
    winners: [],
  };

  return rooms[code];
}

// GET ROOM
function getRoom(roomCode) {
  if (typeof roomCode !== "string") return null;

  return rooms[roomCode.trim().toUpperCase()] || null;
}

// JOIN ROOM
function joinRoom(roomCode, playerName, socketId) {
  const room = getRoom(roomCode);

  if (!room) {
    return { error: "Room not found. Check the room code." };
  }

  if (room.status !== "waiting") {
    return { error: "Game has already started." };
  }

  if (room.players.some((player) => player.id === socketId)) {
    return { room };
  }

  if (room.players.length >= room.settings.maxPlayers) {
    return { error: "Room is full." };
  }

  room.players.push({
    id: socketId,
    name: playerName,
    score: 0,
    attempts: 0,
    wrongAttempts: 0,
  });

  return { room };
}

// START GAME
function startGame(roomCode, socketId) {
  const room = getRoom(roomCode);

  if (!room) {
    return { error: "Room not found." };
  }

  if (room.hostId !== socketId) {
    return { error: "Only the host can start the game." };
  }

  if (room.players.length < 2) {
    return { error: "At least 2 players are required." };
  }

  if (room.status !== "waiting") {
    return { error: "Game has already started." };
  }

  room.status = "playing";
  room.round = 1;

  // Total rounds = players × configured rounds per player
  room.totalRounds =
    room.players.length * room.settings.roundsPerPlayer;

  room.drawerId = room.players[0].id;
  room.currentWord = null;
  room.guessedPlayers = [];
  room.roundEnding = false;

  // Use configured number of word choices
  room.wordOptions = getWordOptions(
    room.settings.wordCount
  );

  room.winners = [];

  // Reset scores and attempts
  room.players.forEach((player) => {
    player.score = 0;
    player.attempts = 0;
    player.wrongAttempts = 0;
  });

  return { room };
}

// SELECT WORD
function selectWord(roomCode, socketId, word) {
  const room = getRoom(roomCode);

  if (!room) {
    return { error: "Room not found." };
  }

  if (room.status !== "playing" || room.roundEnding) {
    return { error: "The round is not active." };
  }

  if (room.drawerId !== socketId) {
    return { error: "Only the drawer can select a word." };
  }

  if (room.currentWord) {
    return { error: "A word has already been selected." };
  }

  if (
    typeof word !== "string" ||
    !room.wordOptions.includes(word)
  ) {
    return { error: "Invalid word selection." };
  }

  room.currentWord = word;
  room.guessedPlayers = [];

  return { room };
}

// CHECK GUESS
function checkGuess(roomCode, socketId, guess) {
  const room = getRoom(roomCode);

  if (!room) {
    return { error: "Room not found." };
  }

  if (
    room.status !== "playing" ||
    !room.currentWord ||
    room.roundEnding
  ) {
    return { error: "The round is not active." };
  }

  if (socketId === room.drawerId) {
    return { error: "The drawer cannot guess the word." };
  }

  const player = room.players.find(
    (item) => item.id === socketId
  );

  if (!player) {
    return { error: "Player not found in this room." };
  }

  // Prevent repeated guesses after a correct answer
  if (room.guessedPlayers.includes(socketId)) {
    return {
      correct: false,
      alreadyGuessed: true,
      roundComplete: false,
      room,
    };
  }

  player.attempts += 1;

  const correct =
    typeof guess === "string" &&
    guess.trim().toLowerCase() ===
      room.currentWord.toLowerCase();

  // WRONG GUESS: deduct 5 points
  if (!correct) {
    player.wrongAttempts += 1;
    player.score -= 5;

    return {
      correct: false,
      alreadyGuessed: false,
      roundComplete: false,
      message: "Wrong answer! -5 points. Try again!",
      pointsDeducted: 5,
      playerName: player.name,
      attempts: player.attempts,
      wrongAttempts: player.wrongAttempts,
      room,
    };
  }

  // CORRECT GUESS: player gets 10 points
  player.score += 10;

  // Drawer gets 5 points
  const drawer = room.players.find(
    (item) => item.id === room.drawerId
  );

  if (drawer) {
    drawer.score += 5;
  }

  room.guessedPlayers.push(socketId);
  room.roundEnding = true;

  return {
    correct: true,
    alreadyGuessed: false,
    roundComplete: true,
    message: `Congratulations, ${player.name}! You earned 10 points!`,
    playerName: player.name,
    pointsEarned: 10,
    drawerPointsEarned: drawer ? 5 : 0,
    attempts: player.attempts,
    wrongAttempts: player.wrongAttempts,
    room,
  };
}

// NEXT ROUND OR WINNER
function startNextRound(roomCode) {
  const room = getRoom(roomCode);

  if (
    !room ||
    room.status !== "playing" ||
    !room.roundEnding
  ) {
    return { error: "Cannot start the next round." };
  }

  // FINISH GAME
  if (room.round >= room.totalRounds) {
    room.status = "finished";
    room.currentWord = null;
    room.wordOptions = [];
    room.guessedPlayers = [];

    const sortedPlayers = [...room.players].sort(
      (a, b) => b.score - a.score
    );

    const highestScore = sortedPlayers[0]?.score ?? 0;

    room.winners = sortedPlayers.filter(
      (player) => player.score === highestScore
    );

    const message =
      room.winners.length > 1
        ? `It's a tie! Congratulations ${room.winners
            .map((player) => player.name)
            .join(" and ")}!`
        : `Congratulations ${
            room.winners[0]?.name || "Player"
          }! You are the winner!`;

    return {
      room,
      gameOver: true,
      winners: room.winners,
      highestScore,
      message,
    };
  }

  // NEXT DRAWER
  const currentIndex = room.players.findIndex(
    (player) => player.id === room.drawerId
  );

  if (currentIndex === -1) {
    return { error: "Current drawer not found." };
  }

  const nextIndex =
    (currentIndex + 1) % room.players.length;

  room.round += 1;
  room.drawerId = room.players[nextIndex].id;
  room.currentWord = null;
  room.guessedPlayers = [];
  room.roundEnding = false;

  // Use configured word count in every round
  room.wordOptions = getWordOptions(
    room.settings.wordCount
  );

  return {
    room,
    gameOver: false,
  };
}

// EXPORT FUNCTIONS
module.exports = {
  createRoom,
  getRoom,
  joinRoom,
  startGame,
  selectWord,
  checkGuess,
  startNextRound,
};