const {
  makeWASocket,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  delay,
  DisconnectReason,
} = require("baileys");
const readline = require("readline");
const P = require("pino");

interface ConnectionUpdate {
  connection: string;
  lastDisconnect?: {
    error?: {
      output?: {
        statusCode: number;
      };
    };
  };
}

// Logger setup
const logger = P({
  timestamp: () => `,"time":"${new Date().toJSON()}"`,
  destination: "./wa-logs.txt",
});
logger.level = "trace";

// Read line interface for interactive CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (text: string) =>
  new Promise((resolve) => rl.question(text, resolve));

// Start a connection
const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: state,
  });

  // Connection updates
  sock.ev.on("connection.update", async (update: ConnectionUpdate) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      // Use optional chaining to safely access deeply nested properties
      if (
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      ) {
        console.log("Disconnected, attempting reconnect...");
        startSock(); // Ensure `startSock` is appropriately defined to restart the connection
      } else {
        console.log("Connection closed. You are logged out.");
      }
    }

    if (connection === "open") {
      console.log("WhatsApp connection is open.");
    }
  });

  // Message reception and auto-reply
  // sock.ev.on("messages.upsert", async (m) => {
  sock.ev.on(
    "messages.upsert",
    async (m: {
      messages: {
        key: { fromMe: boolean; remoteJid: string };
        message?: {
          conversation?: string;
          extendedTextMessage?: { text?: string };
        };
      }[];
    }) => {
      const message = m.messages[0];
      if (!message.key.fromMe && message.message?.conversation) {
        console.log(`Received message: ${message.message.conversation}`);
        await sock.sendPresenceUpdate("composing", message.key.remoteJid);
        await delay(2000); // simulate typing delay
        await sock.sendPresenceUpdate("paused", message.key.remoteJid);
        await sock.sendMessage(message.key.remoteJid, {
          text: "Hello, I am an automated reply from your WhatsApp bot.",
        });
      }
    }
  );

  // Save updated credentials automatically
  sock.ev.on("creds.update", saveCreds);

  return sock;
};

startSock().catch((err) =>
  console.error("Failed to start the WhatsApp socket:", err)
);
