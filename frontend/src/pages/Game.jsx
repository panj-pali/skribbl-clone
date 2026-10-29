
import { useEffect, useRef, useState } from "react";
import { socket } from "../services/socket";
import "../styles/Game.css";

function Game({ roomCode, players = [], onPlayersUpdated }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef(null);
  const choosingWordRef = useRef(false);
  const gameOverRef = useRef(false);
  const chatEndRef = useRef(null);

  const playersRef = useRef(players);
  const onPlayersUpdatedRef = useRef(onPlayersUpdated);

  playersRef.current = players;
  onPlayersUpdatedRef.current = onPlayersUpdated;

  const [brushColor, setBrushColor] = useState("#222222");
  const [brushSize, setBrushSize] = useState(5);

  const [wordOptions, setWordOptions] = useState([]);
  const [selectedWord, setSelectedWord] = useState("");
  const [wordLength, setWordLength] = useState(0);
  const [isChoosingWord, setIsChoosingWord] = useState(false);

  const [guess, setGuess] = useState("");
  const [message, setMessage] = useState("Connecting to game...");
  const [isDrawer, setIsDrawer] = useState(false);

  const [gameOver, setGameOver] = useState(false);
  const [winnerIds, setWinnerIds] = useState([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(1);
  const [remainingSeconds, setRemainingSeconds] = useState(null);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");

  function getPosition(event) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    if (!rect.width || !rect.height) return null;

    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function drawLine(x1, y1, x2, y2, color, size) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");

    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.strokeStyle = color || "#222222";
    context.lineWidth = Math.max(1, Number(size) || 5);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  }

  function startDrawing(event) {
    if (!isDrawer || !selectedWord || gameOver) return;

    const position = getPosition(event);
    if (!position) return;

    isDrawing.current = true;
    lastPoint.current = position;

    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    drawLine(
      position.x,
      position.y,
      position.x,
      position.y,
      brushColor,
      brushSize
    );

    socket.emit("drawing", {
      roomCode,
      x: position.x,
      y: position.y,
      lastX: position.x,
      lastY: position.y,
      color: brushColor,
      brushSize,
      isStart: true,
    });
  }

  function draw(event) {
    if (!isDrawer || !selectedWord || !isDrawing.current || gameOver) {
      return;
    }

    const position = getPosition(event);
    if (!position || !lastPoint.current) return;

    drawLine(
      lastPoint.current.x,
      lastPoint.current.y,
      position.x,
      position.y,
      brushColor,
      brushSize
    );

    socket.emit("drawing", {
      roomCode,
      x: position.x,
      y: position.y,
      lastX: lastPoint.current.x,
      lastY: lastPoint.current.y,
      color: brushColor,
      brushSize,
      isStart: false,
    });

    lastPoint.current = position;
  }

  function stopDrawing() {
    isDrawing.current = false;
    lastPoint.current = null;
  }

  function clearCanvas() {
    if (!isDrawer || !selectedWord || gameOver) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.getContext("2d").clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    socket.emit("clear-canvas", roomCode);
  }

  function handleSelectWord(word) {
    if (
      gameOver ||
      !isDrawer ||
      selectedWord ||
      isChoosingWord ||
      !wordOptions.includes(word)
    ) {
      return;
    }

    choosingWordRef.current = true;
    setIsChoosingWord(true);
    setWordOptions([]);
    setMessage("Selecting word...");

    socket.emit("select-word", { roomCode, word });
  }

  function handleSubmitGuess(event) {
    event.preventDefault();

    if (!guess.trim() || gameOver || remainingSeconds === 0) return;

    socket.emit("submit-guess", {
      roomCode,
      guess: guess.trim(),
    });

    setGuess("");
  }

  function handleSendChat(event) {
    event.preventDefault();

    const cleanMessage = chatInput.trim();

    if (!cleanMessage) {
      setChatError("Please enter a message.");
      return;
    }

    if (cleanMessage.length > 200) {
      setChatError("Message cannot exceed 200 characters.");
      return;
    }

    if (gameOver) {
      setChatError("The game has finished.");
      return;
    }

    setChatError("");

    socket.emit("send-chat-message", {
      roomCode,
      message: cleanMessage,
    });

    setChatInput("");
  }

  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    function handleGameStarted(data) {
      if (data.roomCode !== roomCode) return;

      choosingWordRef.current = false;
      gameOverRef.current = false;

      setIsChoosingWord(false);
      setGameOver(false);
      setWinnerIds([]);
      setIsDrawer(data.drawerId === socket.id);
      setCurrentRound(data.currentRound ?? data.round ?? 1);
      setTotalRounds(data.totalRounds ?? 1);
      setRemainingSeconds(null);
      setSelectedWord("");
      setWordLength(0);
      setWordOptions([]);
      setGuess("");

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.getContext("2d").clearRect(
          0,
          0,
          canvas.width,
          canvas.height
        );
      }

      setMessage(
        data.drawerId === socket.id
          ? "Choose a word to draw."
          : "Wait for the drawer to choose a word."
      );

      if (Array.isArray(data.players)) {
        onPlayersUpdatedRef.current?.({
          roomCode: data.roomCode,
          players: data.players,
          hostId: data.hostId,
        });
      }
    }

    function handleWordOptions(data) {
      if (data.roomCode && data.roomCode !== roomCode) return;
      if (choosingWordRef.current || gameOverRef.current) return;

      setWordOptions(data.wordOptions || []);
      setSelectedWord("");
      setWordLength(0);
      setMessage("Choose a word to draw.");
    }

    function handleWordSelected(data) {
      if (data.roomCode && data.roomCode !== roomCode) return;

      choosingWordRef.current = false;
      setIsChoosingWord(false);
      setSelectedWord(data.word);
      setWordOptions([]);
      setWordLength(data.word.length);
      setMessage(`Your word is: ${data.word}`);
    }

    function handleWordHint(data) {
      if (data.roomCode && data.roomCode !== roomCode) return;

      setWordLength(data.wordLength);
      setMessage(`Guess the word: ${data.wordLength} letters`);
    }

    function handleRemoteDrawing(data) {
      if (data.roomCode && data.roomCode !== roomCode) return;

      drawLine(
        data.isStart ? data.x : data.lastX,
        data.isStart ? data.y : data.lastY,
        data.x,
        data.y,
        data.color,
        data.brushSize
      );
    }

    function handleRemoteClear(data) {
      if (data?.roomCode && data.roomCode !== roomCode) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.getContext("2d").clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );
    }

    function handleGuessResult(data) {
      if (data.roomCode && data.roomCode !== roomCode) return;

      if (data.correct) {
        setMessage(
          data.alreadyGuessed
            ? "You have already guessed correctly!"
            : data.message ||
              `${data.playerName || "Player"} guessed correctly!`
        );
      } else {
        setMessage(
          data.message ||
            `${data.playerName || "Player"} made a guess. Try again!`
        );
      }
    }

    function handleTimerUpdate(data) {
      if (data.roomCode !== roomCode) return;
      setRemainingSeconds(data.remainingSeconds);
    }

    function handleRoundEnded(data) {
      if (data.roomCode !== roomCode) return;

      setRemainingSeconds(0);
      stopDrawing();

      setMessage(
        data.reason === "time-up"
          ? "⏰ Time's up! Next round starting..."
          : "Round complete! Next round starting..."
      );
    }

    function handleGameOver(data) {
      if (data.roomCode !== roomCode) return;

      choosingWordRef.current = false;
      gameOverRef.current = true;

      setIsChoosingWord(false);
      setGameOver(true);
      setIsDrawer(false);
      setWordOptions([]);
      setSelectedWord("");
      setGuess("");
      setRemainingSeconds(0);
      stopDrawing();

      const finalPlayers = Array.isArray(data.players)
        ? data.players
        : playersRef.current;

      onPlayersUpdatedRef.current?.({
        roomCode: data.roomCode,
        players: finalPlayers,
      });

      if (finalPlayers.length === 0) {
        setWinnerIds([]);
        setMessage("🏆 Game Over!");
        return;
      }

      const highestScore = Math.max(
        ...finalPlayers.map((player) => Number(player.score) || 0)
      );

      const winners = finalPlayers.filter(
        (player) => (Number(player.score) || 0) === highestScore
      );

      setWinnerIds(winners.map((player) => String(player.id)));

      setMessage(
        winners.length === 1
          ? `🏆 Game Over! ${winners[0].name} is the Winner!`
          : `🏆 It's a tie between ${winners
              .map((player) => player.name)
              .join(", ")}!`
      );
    }

    function handleGuessError(error) {
      setMessage(
        typeof error === "string"
          ? error
          : "Unable to submit your guess."
      );
    }

    function handleRoomError(error) {
      choosingWordRef.current = false;
      setIsChoosingWord(false);

      setMessage(
        typeof error === "string" ? error : "Something went wrong."
      );
    }

    function handlePlayersUpdated(data) {
      if (
        data.roomCode === roomCode &&
        onPlayersUpdatedRef.current
      ) {
        onPlayersUpdatedRef.current(data);
      }
    }

    function handleChatHistory(data) {
      if (data.roomCode !== roomCode) return;

      setChatMessages(
        Array.isArray(data.messages) ? data.messages : []
      );
    }

    function handleChatMessage(data) {
      if (data.roomCode !== roomCode) return;

      setChatMessages((previous) => {
        if (previous.some((item) => item.id === data.id)) {
          return previous;
        }

        return [...previous, data].slice(-100);
      });
    }

    function handleChatError(data) {
      setChatError(
        typeof data === "string"
          ? data
          : data?.message || "Unable to send message."
      );
    }

    function handleConnect() {
      if (roomCode) socket.emit("get-game-state", roomCode);
    }

    socket.on("game-started", handleGameStarted);
    socket.on("word-options", handleWordOptions);
    socket.on("word-selected", handleWordSelected);
    socket.on("word-hint", handleWordHint);
    socket.on("drawing", handleRemoteDrawing);
    socket.on("clear-canvas", handleRemoteClear);
    socket.on("guess-result", handleGuessResult);
    socket.on("timer-update", handleTimerUpdate);
    socket.on("round-ended", handleRoundEnded);
    socket.on("game-over", handleGameOver);
    socket.on("guess-error", handleGuessError);
    socket.on("room-error", handleRoomError);
    socket.on("players-updated", handlePlayersUpdated);
    socket.on("chat-history", handleChatHistory);
    socket.on("chat-message", handleChatMessage);
    socket.on("chat-error", handleChatError);
    socket.on("connect", handleConnect);

    if (socket.connected && roomCode) {
      socket.emit("get-game-state", roomCode);
    }

    return () => {
      socket.off("game-started", handleGameStarted);
      socket.off("word-options", handleWordOptions);
      socket.off("word-selected", handleWordSelected);
      socket.off("word-hint", handleWordHint);
      socket.off("drawing", handleRemoteDrawing);
      socket.off("clear-canvas", handleRemoteClear);
      socket.off("guess-result", handleGuessResult);
      socket.off("timer-update", handleTimerUpdate);
      socket.off("round-ended", handleRoundEnded);
      socket.off("game-over", handleGameOver);
      socket.off("guess-error", handleGuessError);
      socket.off("room-error", handleRoomError);
      socket.off("players-updated", handlePlayersUpdated);
      socket.off("chat-history", handleChatHistory);
      socket.off("chat-message", handleChatMessage);
      socket.off("chat-error", handleChatError);
      socket.off("connect", handleConnect);
    };
  }, [roomCode]);

  const timerDisplay =
    remainingSeconds === null
      ? "--:--"
      : `${Math.floor(remainingSeconds / 60)
          .toString()
          .padStart(2, "0")}:${(remainingSeconds % 60)
          .toString()
          .padStart(2, "0")}`;

  return (
    <div className="game-container">
      <header className="game-header">
        <h2>Draw &amp; Guess</h2>

        <p>
          Room Code: <strong>{roomCode}</strong>
        </p>

        <p>
          Round: <strong>{currentRound}</strong> / {totalRounds}
        </p>

        <p className="round-timer">
          ⏱️ Time left: <strong>{timerDisplay}</strong>
        </p>
      </header>

      <div className="game-layout">
        <main className="drawing-section">
          {gameOver && (
            <div className="winner-banner">
              <h2>🏆 Game Over!</h2>

              {players
                .filter((player) =>
                  winnerIds.includes(String(player.id))
                )
                .map((player) => (
                  <p key={player.id}>
                    🎉 {player.name} — Winner with{" "}
                    {player.score ?? 0} points!
                  </p>
                ))}
            </div>
          )}

          {isDrawer && wordOptions.length > 0 && !gameOver && (
            <div className="word-options">
              <h3>Choose a word</h3>

              {wordOptions.map((word) => (
                <button
                  key={word}
                  type="button"
                  disabled={isChoosingWord}
                  onClick={() => handleSelectWord(word)}
                >
                  {word}
                </button>
              ))}
            </div>
          )}

          {isChoosingWord && !gameOver && (
            <p>Please wait, selecting your word...</p>
          )}

          {isDrawer && selectedWord && !gameOver && (
            <p>
              Your word: <strong>{selectedWord}</strong>
            </p>
          )}

          <p className="game-message">{message}</p>

          <div className="drawing-tools">
            <label className="tool-control">
              <span>Color</span>
              <input
                type="color"
                value={brushColor}
                disabled={!isDrawer || !selectedWord || gameOver}
                onChange={(event) => setBrushColor(event.target.value)}
              />
            </label>

            <label className="tool-control brush-size-control">
              <span>Brush Size: {brushSize}px</span>
              <input
                type="range"
                min="1"
                max="25"
                step="1"
                value={brushSize}
                disabled={!isDrawer || !selectedWord || gameOver}
                onChange={(event) =>
                  setBrushSize(Number(event.target.value))
                }
              />
            </label>

            <button
              type="button"
              onClick={clearCanvas}
              disabled={!isDrawer || !selectedWord || gameOver}
            >
              Clear Canvas
            </button>
          </div>

          <canvas
            ref={canvasRef}
            width={700}
            height={450}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onLostPointerCapture={stopDrawing}
            style={{
              border: "2px solid #333",
              backgroundColor: "#fff",
              width: "100%",
              maxWidth: "700px",
              aspectRatio: "700 / 450",
              display: "block",
              touchAction: "none",
              cursor:
                isDrawer && selectedWord && !gameOver
                  ? "crosshair"
                  : "default",
            }}
          />

          {!isDrawer && !gameOver && (
            <form onSubmit={handleSubmitGuess}>
              <input
                type="text"
                placeholder={
                  wordLength > 0
                    ? `Guess the word (${wordLength} letters)...`
                    : "Guess the word..."
                }
                value={guess}
                onChange={(event) => setGuess(event.target.value)}
                disabled={remainingSeconds === 0}
              />

              <button
                type="submit"
                disabled={!guess.trim() || remainingSeconds === 0}
              >
                Submit Guess
              </button>
            </form>
          )}
        </main>

        <aside className="game-sidebar">
          <section className="players-section">
            <h3>Players ({players.length})</h3>

            {players.map((player) => (
              <div className="player-card" key={player.id}>
                <span>
                  {player.name}

                  {gameOver &&
                    winnerIds.includes(String(player.id)) && (
                      <strong> 🏆 Winner</strong>
                    )}

                  {player.id === socket.id && <small> (You)</small>}
                </span>

                <strong>{player.score ?? 0} points</strong>
              </div>
            ))}
          </section>

          <section className="chat-section">
            <h3>💬 Room Chat</h3>

            <div className="chat-messages" aria-live="polite">
              {chatMessages.map((item) => (
                <div
                  key={item.id}
                  className={
                    item.type === "system"
                      ? "chat-message system-message"
                      : "chat-message"
                  }
                >
                  {item.type === "system" ? (
                    <span>{item.message}</span>
                  ) : (
                    <>
                      <strong>
                        {item.senderName}
                        {item.senderId === socket.id ? " (You)" : ""}:
                      </strong>{" "}
                      <span>{item.message}</span>
                    </>
                  )}
                </div>
              ))}

              <div ref={chatEndRef} />
            </div>

            {chatError && (
              <p className="chat-error" role="alert">
                {chatError}
              </p>
            )}

            <form className="chat-form" onSubmit={handleSendChat}>
              <input
                type="text"
                placeholder="Type a message..."
                value={chatInput}
                maxLength={200}
                onChange={(event) => {
                  setChatInput(event.target.value);
                  setChatError("");
                }}
                disabled={gameOver}
              />

              <button
                type="submit"
                disabled={!chatInput.trim() || gameOver}
              >
                Send
              </button>
            </form>

            <small className="chat-counter">
              {chatInput.length}/200 characters
            </small>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default Game;
