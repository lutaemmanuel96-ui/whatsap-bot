import express from 'express';
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('WhatsApp bot is running!');
});

app.listen(PORT, () => {
  console.log(`Express server is listening on port ${PORT}`);
});

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false
  });

  if (!sock.authState.creds.registered) {
    const phoneNumber = "254759295183"; 
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n==============================`);
        console.log(`YOUR PAIRING CODE IS: ${code}`);
        console.log(`==============================\n`);
      } catch (error) {
        console.error("Error getting pairing code:", error);
      }
    }, 4000);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed, reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        setTimeout(() => startBot(), 5000);
      }
    } else if (connection === 'open') {
      console.log('Bot connected successfully!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;
    const messageContent = m.message.conversation || m.message.extendedTextMessage?.text;
    console.log(`Received message: ${messageContent}`);
  });
}

startBot();