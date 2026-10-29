import { useEffect } from "react";
import { socket } from "../services/socket";
import "../styles/lobby.css";

function Lobby({
  roomCode,
  players = [],
  setPlayers,
  hostId,
  onBack,
  onGameStart,
}) {
  useEffect(() => {
    function handlePlayersUpdated(data) {
      if (data.roomCode === roomCode) {
        setPlayers(data.players || []);
      }
    }

    function handleGameStarted(data) {
      if (data.roomCode === roomCode) {
        setPlayers(data.players || []);
        onGameStart();
      }
    }

    function handleRoomError(message) {
      alert(message);
    }

    socket.on("players-updated", handlePlayersUpdated);
    socket.on("game-started", handleGameStarted);
    socket.on("room-error", handleRoomError);

    return () => {
      socket.off("players-updated", handlePlayersUpdated);
      socket.off("game-started", handleGameStarted);
      socket.off("room-error", handleRoomError);
    };
  }, [roomCode, setPlayers, onGameStart]);

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      alert("Room code copied!");
    } catch {
      alert("Unable to copy. Please copy the room code manually.");
    }
  }

  function handleStartGame() {
    if (players.length < 2) {
      alert("At least 2 players are required!");
      return;
    }

    socket.emit("start-game", roomCode);
  }

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <h1>Game Lobby</h1>

        <p>
          Room Code: <strong>{roomCode}</strong>
        </p>

        <button type="button" onClick={handleCopyCode}>
          Copy Code
        </button>

        <h3>Players ({players.length})</h3>

        <ul>
          {players.map((player) => (
            <li key={player.id}>
              {player.name}
              {player.id === hostId && " (Host)"}
            </li>
          ))}
        </ul>

        {hostId === socket.id && (
          <button type="button" onClick={handleStartGame}>
            Start Game
          </button>
        )}

        <button type="button" onClick={onBack}>
          Back to Home
        </button>
      </div>
    </div>
  );
}

export default Lobby;