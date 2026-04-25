import { createServer } from "http";
import next from "next";
import { Server as SocketServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

// Next.js uses this hostname for internal URL construction — keep as localhost.
// The HTTP server binds to 0.0.0.0 separately below to accept LAN/VPS connections.
const app = next({ dev, hostname: "localhost", port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    await handle(req, res);
  });

  const io = new SocketServer(httpServer, {
    cors: {
      // In production, Socket.io runs on the same origin — no CORS needed.
      // In development, allow any origin so LAN devices (phones, tablets) can connect.
      origin: dev ? "*" : false,
      methods: ["GET", "POST"],
    },
  });

  // Store io on global so API routes can emit events
  (global as { io?: SocketServer }).io = io;

  io.on("connection", (socket) => {
    socket.on("join-hall", (hallId: number) => {
      socket.join(`hall-${hallId}`);
    });

    socket.on("join-results", () => {
      socket.join("results");
    });

    socket.on("join-conference", (conferenceId: number) => {
      socket.join(`conference-${conferenceId}`);
    });

    socket.on("disconnect", () => {
      // cleanup handled automatically by socket.io
    });
  });

  // Bind to 0.0.0.0 so the server accepts connections on all interfaces:
  // localhost, LAN (192.168.x.x), and any VPS/domain pointing to this machine.
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`> Ready on port ${port} (all interfaces)`);
  });
});
