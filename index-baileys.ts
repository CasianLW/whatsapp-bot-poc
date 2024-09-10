const fs = require("fs");
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const {
  makeWASocket,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const P = require("pino");

const app = express();
app.use(bodyParser.json());

const logger = P({
  timestamp: () => `,"time":"${new Date().toJSON()}"`,
  destination: "./wa-logs.txt",
});
logger.level = "trace";

const clients = {};

async function initializeWhatsApp(userId) {
  const { state, saveCreds } = await useMultiFileAuthState(
    `./auth_states/state_${userId}`
  );
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("connection.update", (update) => {
    if (update.connection === "close") {
      if (
        update.lastDisconnect &&
        update.lastDisconnect.error &&
        update.lastDisconnect.error.output &&
        update.lastDisconnect.error.output.statusCode !==
          DisconnectReason.loggedOut
      ) {
        console.log(`${userId} - Disconnected, attempting reconnect...`);
        initializeWhatsApp(userId);
      } else {
        console.log(`${userId} - Connection closed. Logged out.`);
        delete clients[userId];
        const authStatePath = path.join(`./auth_states/state_${userId}`);
        fs.rmdir(authStatePath, { recursive: true }, (err) => {
          if (err) {
            console.error(`Failed to delete auth state for ${userId}:`, err);
          }
          console.log(
            `Authentication state for ${userId} deleted successfully.`
          );
        });
      }
    }
    if (update.connection === "open") {
      console.log(`${userId} - WhatsApp connection is open.`);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  clients[userId] = sock;
}

app.post("/login/:userId", async (req, res) => {
  const userId = req.params.userId;
  if (clients[userId]) {
    return res.status(409).send("User already logged in.");
  }

  await initializeWhatsApp(userId);
  res.send("Login process started. Please scan QR from terminal.");
});

app.post("/send/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { destinataires, message } = req.body;

  if (!clients[userId]) {
    return res
      .status(404)
      .send("User is not logged in or session does not exist.");
  }

  const client = clients[userId];

  try {
    destinataires.forEach(async (number) => {
      const formattedNumber = `${number}@s.whatsapp.net`;
      await client.sendMessage(formattedNumber, { text: message });
    });
    res.send("Messages sent successfully.");
  } catch (error) {
    console.error(`Failed to send message for ${userId}:`, error);
    res.status(500).send("Failed to send messages.");
  }
});

app.post("/logout/:userId", async (req, res) => {
  const userId = req.params.userId;
  const client = clients[userId];

  if (!client) {
    return res
      .status(404)
      .send("User is not logged in or session does not exist.");
  }

  try {
    // Calling the logout method to properly close the session
    await client.logout(); // This method will log out the user and invalidate the session on the server

    // Clean up local resources
    delete clients[userId]; // Remove the client from the local tracking object
    console.log(`${userId} - Logged out and session terminated.`);

    // Delete the user's authentication state files
    const authStatePath = path.join(`./auth_states/state_${userId}`);
    // const authStatePath = path.join(__dirname, `./auth_states/state_${userId}`);
    fs.rmdir(authStatePath, { recursive: true }, (err) => {
      if (err) {
        console.error(`Failed to delete auth state for ${userId}:`, err);
        return res.status(500).send("Failed to clean up auth state.");
      }
      console.log(`Authentication state for ${userId} deleted successfully.`);
      res.send("Logged out and session cleaned up successfully.");
    });
  } catch (error) {
    console.error(`Failed to logout ${userId}:`, error);
    res.status(500).send("Failed to log out.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
