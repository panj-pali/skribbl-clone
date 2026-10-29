import { useState, useEffect } from "react";
import { socket } from "../services/socket";

function Home({ onCreateRoom }) {
const [playerName, setPlayerName] = useState("");
const [roomCode, setRoomCode] = useState("");

const [showSettings, setShowSettings] = useState(false);

const [drawTime, setDrawTime] = useState(120);
const [roundsPerPlayer, setRoundsPerPlayer] = useState(2);
const [wordCount, setWordCount] = useState(3);
const [maxPlayers, setMaxPlayers] = useState(8);

useEffect(() => {
function handleRoomCreated(data) {
console.log("Room created data:", data);
onCreateRoom(data);
}

function handleRoomJoined(data) {
  console.log("Room joined data:", data);
  onCreateRoom(data);
}

function handleRoomError(message) {
  alert(message);
}

socket.on("room-created", handleRoomCreated);
socket.on("room-joined", handleRoomJoined);
socket.on("room-error", handleRoomError);

return () => {
  socket.off("room-created", handleRoomCreated);
  socket.off("room-joined", handleRoomJoined);
  socket.off("room-error", handleRoomError);
};

}, [onCreateRoom]);

function handleCreateRoom() {
if (!playerName.trim()) {
alert("Please enter your name");
return;
}

if (!socket.connected) {
  socket.connect();
}

socket.emit("create-room", {
  playerName: playerName.trim(),
  settings: {
    drawTime: Number(drawTime),
    roundsPerPlayer: Number(roundsPerPlayer),
    wordCount: Number(wordCount),
    maxPlayers: Number(maxPlayers),
  },
});

}

function handleJoinRoom() {
if (!playerName.trim() || !roomCode.trim()) {
alert("Please enter your name and room code");
return;
}

if (!socket.connected) {
  socket.connect();
}

socket.emit("join-room", {
  playerName: playerName.trim(),
  roomCode: roomCode.trim().toUpperCase(),
});

}

return (
<div className="home-container">
<div className="home-card">
<h1>🎨 Draw & Guess</h1>
<p>Draw it. Guess it. Win together!</p>

    <label>Your Name</label>
    <input
      type="text"
      placeholder="Enter your name"
      value={playerName}
      onChange={(event) => setPlayerName(event.target.value)}
      maxLength={20}
    />

    <div className="room-settings">
      <button
        type="button"
        className="settings-toggle"
        onClick={() => setShowSettings(!showSettings)}
        aria-expanded={showSettings}
      >
        <span>⚙️ Room Settings</span>
        <span>{showSettings ? "▲" : "▼"}</span>
      </button>

      {showSettings && (
        <div className="settings-content">
          <div className="setting-group">
            <label>Drawing Time</label>
            <select
              value={drawTime}
              onChange={(event) =>
                setDrawTime(event.target.value)
              }
            >
              <option value={60}>60 seconds</option>
              <option value={90}>90 seconds</option>
              <option value={120}>120 seconds</option>
            </select>
          </div>

          <div className="setting-group">
            <label>Rounds Per Player</label>
            <select
              value={roundsPerPlayer}
              onChange={(event) =>
                setRoundsPerPlayer(event.target.value)
              }
            >
              <option value={2}>2 rounds</option>
              <option value={3}>3 rounds</option>
              <option value={5}>5 rounds</option>
            </select>
          </div>

          <div className="setting-group">
            <label>Word Choices</label>
            <select
              value={wordCount}
              onChange={(event) =>
                setWordCount(event.target.value)
              }
            >
              <option value={1}>1 word</option>
              <option value={3}>3 words</option>
              <option value={5}>5 words</option>
            </select>
          </div>

          <div className="setting-group">
            <label>Maximum Players</label>
            <select
              value={maxPlayers}
              onChange={(event) =>
                setMaxPlayers(event.target.value)
              }
            >
              <option value={4}>4 players</option>
              <option value={8}>8 players</option>
              <option value={12}>12 players</option>
            </select>
          </div>
        </div>
      )}
    </div>

    <button onClick={handleCreateRoom}>
      Create Room
    </button>

    <h4>OR JOIN A ROOM</h4>

    <input
      type="text"
      placeholder="Enter room code"
      value={roomCode}
      onChange={(event) => setRoomCode(event.target.value)}
      maxLength={10}
    />

    <button onClick={handleJoinRoom}>
      Join Room
    </button>
  </div>
</div>
);
}

export default Home;