import { useCallback, useState } from "react";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";

import "./styles/Home.css";
import "./styles/lobby.css";

function App() {
  const [currentPage, setCurrentPage] = useState("home");
  const [roomCode, setRoomCode] = useState("");
  const [players, setPlayers] = useState([]);
  const [hostId, setHostId] = useState("");

  function goToLobby(data) {
    setRoomCode(data.roomCode);
    setPlayers(data.players || []);
    setHostId(data.hostId || "");
    setCurrentPage("lobby");
  }

  function goToHome() {
    setCurrentPage("home");
  }

  function goToGame() {
    setCurrentPage("game");
  }

  const handlePlayersUpdated = useCallback((data) => {
    if (data && Array.isArray(data.players)) {
      setPlayers(data.players);
    }

    if (data && data.hostId) {
      setHostId(data.hostId);
    }
  }, []);

  return (
    <div>
      {currentPage === "home" && (
        <Home onCreateRoom={goToLobby} />
      )}

      {currentPage === "lobby" && (
        <Lobby
          roomCode={roomCode}
          players={players}
          setPlayers={setPlayers}
          hostId={hostId}
          onBack={goToHome}
          onGameStart={goToGame}
        />
      )}

      {currentPage === "game" && (
        <Game
          roomCode={roomCode}
          players={players}
          onPlayersUpdated={handlePlayersUpdated}
        />
      )}
    </div>
  );
}

export default App;