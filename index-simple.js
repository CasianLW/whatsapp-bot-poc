const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
require("dotenv").config();

const app = express();
app.use(express.json());

// Initialize the WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
});

client.on("qr", (qr) => {
  console.log("Scan the QR code below to log in to WhatsApp:");
  qrcode.generate(qr, { small: true });
});

// Log a message when the client is ready
client.on("ready", () => {
  console.log("WhatsApp Client is ready!");
});

// Log any errors to the console
client.on("auth_failure", (message) => {
  console.error("Authentication failure:", message);
});

client.on("disconnected", (reason) => {
  console.log("Client was logged out", reason);
});

// Handle any unhandled client errors
client.on("error", (error) => {
  console.error("Client error:", error);
});

// Start the WhatsApp client with error handling
client.initialize().catch((error) => {
  console.error("Error initializing WhatsApp client:", error);
});

client.on("message", async (message) => {
  if (message.body === "Hello") {
    console.log("message 'Hi' sent: ");
    console.log(message.author);
    await message.reply("Hi!");
  }
});

// Define the /test route to send a message
app.post("/test", async (req, res) => {
  try {
    const number = "33678087207"; // Replace this with the actual number
    const chatId = number + "@c.us"; // WhatsApp ID format
    await client.sendMessage(chatId, "Hello from the test API!");
    res.send("Message sent to " + number);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error sending message");
  }
});

// Define the /complex route to handle multiple recipients
app.post("/complex", async (req, res) => {
  const { destinataires, message } = req.body;

  if (!Array.isArray(destinataires) || !message) {
    return res.status(400).send("Invalid request format");
  }

  try {
    for (const number of destinataires) {
      const chatId = number + "@c.us"; // WhatsApp ID format
      await client.sendMessage(chatId, message);
    }
    res.send("Messages sent successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error sending messages");
  }
});

// Start the Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
