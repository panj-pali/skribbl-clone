
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
  },
});

app.get("/", (req, res) => {
  res.send("Draw & Guess backend is running!");
});

// Socket setup: io create hone ke BAAD
require("./config/Socket")(io);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
