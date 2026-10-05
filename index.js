import express from 'express';
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import readline from 'readline';

// --- EXPRESS SERVER FOR RENDER HEALTH CHECK ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('WhatsApp bot is running!');
});

app.listen(PORT, () => {
  console.log(`Express server is listening on port ${PORT}`);
});

// --- PAIRING CODE HELPER ---
const question = (text) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(text, (answer) => { rl.close(); resolve(answer); }));
};

// --- WHATSAPP BOT LOGIC ---
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false
  });

  // Request pairing code if not registered
  if (!sock.authState.creds.registered) {
    const phoneNumber = await question('Please enter your WhatsApp phone number (e.g., 2547XXXXXXXX): ');
    const code = await sock.requestPairingCode(phoneNumber.trim());
    console.log(`\n==============================`);
    console.log(`YOUR PAIRING CODE IS: ${code}`);
    console.log(`==============================\n`);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed, reconnecting...', shouldReconnect);
      if (shouldReconnect) {
        startBot();
      }
    } else if (connection === 'open') {
      console.log('Bot connected successfully!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Add your message handlers, commands, and status liking logic here
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;
    
    const messageContent = m.message.conversation || m.message.extendedTextMessage?.text;
    console.log(`Received message: ${messageContent}`);
  });
}

startBot();