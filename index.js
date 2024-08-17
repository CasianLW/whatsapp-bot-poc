const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
require("dotenv").config();

const app = express();
app.use(express.json());

// Store clients for each user
const clients = {};

// Endpoint for user to login and initialize their WhatsApp client
app.post("/login/:userId", (req, res) => {
  const userId = req.params.userId;

  if (!clients[userId]) {
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: userId }), // Each user has a unique clientId
    });

    // Handle QR code generation
    client.on("qr", (qr) => {
      console.log(`QR for ${userId}:`);
      qrcode.generate(qr, { small: true });
      res.send(`QR Code for ${userId} generated. Scan it with WhatsApp.`);
    });

    // Log when client is ready
    client.on("ready", () => {
      console.log(`Client for ${userId} is ready!`);
    });

    // Handle incoming messages
    client.on("message", (message) => {
      console.log(`Message received from ${userId}: ${message.body}`);
      if (message.body === "Urgence") {
        message.reply(
          "Call 112 is the single emergency calls number, available nationwide, which can be called from all public telephone networks. Calls are taken 24/7"
        );
      } else {
        message.reply("I'm just a bot, please contact a human.");
      }
    });

    // Error handling
    client.on("error", (error) => {
      console.error(`Client error for ${userId}:`, error);
    });

    // Initialize the client and store it
    client.initialize();
    clients[userId] = client;
  } else {
    res.send(`Client for ${userId} is already initialized.`);
  }
});

// Endpoint to send a message using the user's WhatsApp account
app.post("/send/:userId", async (req, res) => {
  //   console.log("clients:");
  //   console.log(clients);
  const userId = req.params.userId;
  const { destinataires, message } = req.body;

  if (!clients[userId]) {
    return res.status(400).send(`Client for ${userId} is not initialized.`);
  }

  if (!Array.isArray(destinataires) || !message) {
    return res
      .status(400)
      .send(
        "Invalid request format. Make sure to send an array of numbers and a message."
      );
  }

  try {
    for (let number of destinataires) {
      // Ensure the number is in international format without special characters
      number = number.replace(/[^0-9]/g, ""); // Remove non-numeric characters

      if (number.startsWith("0")) {
        return res
          .status(400)
          .send(
            `Invalid number format for ${number}. Must be in international format.`
          );
      }

      const chatId = number + "@c.us"; // WhatsApp ID format

      // Send the message to the recipient
      await clients[userId].sendMessage(chatId, message);
    }

    res.send(`Messages sent successfully by ${userId}`);
  } catch (error) {
    console.error(`Error sending messages for ${userId}:`, error);
    res.status(500).send("Error sending messages");
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
