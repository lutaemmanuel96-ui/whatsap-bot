import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import axios from 'axios';

const DB_FILE = 'jason.json';

function loadMemory() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
      return {};
    }
  }
  const defaults = { 
    "hi": "Hello! I am your automated WhatsApp bot.", 
    "help": "Commands:\n- lyrics [song name]\n- learn [trigger] | [reply]" 
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(defaults, null, 2));
  return defaults;
}

function saveMemory(memory) {
  fs.writeFileSync(DB_FILE, JSON.stringify(memory, null, 2));
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ Bot connected successfully via QR Code!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const m = messages[0];
    if (!m.message) return;
    
    const senderID = m.key.remoteJid;

    // 1. Auto View Status and Auto-React Feature
    if (senderID === 'status@broadcast' || senderID?.endsWith('@broadcast')) {
      try {
        await sock.readMessages([m.key]);
        const emojis = ['❤️', '🥰', '🔥', '😎'];
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

        await sock.sendMessage(senderID, {
          react: { text: randomEmoji, key: m.key }
        });
      } catch (e) {}
      return;
    }

    if (type !== 'notify') return;
    if (m.key.fromMe) return;

    // 2. Auto Read Incoming Regular Messages
    await sock.readMessages([m.key]);

    const messageText = 
      m.message.conversation || 
      m.message.extendedTextMessage?.text || 
      '';

    if (!messageText) return;
    const lowerText = messageText.toLowerCase().trim();

    // 3. Learn Command
    if (lowerText.startsWith('learn ')) {
      const payload = messageText.slice(6).trim();
      const parts = payload.split('|');
      
      if (parts.length === 2) {
        const trigger = parts[0].trim().toLowerCase();
        const reply = parts[1].trim();
        
        const memory = loadMemory();
        memory[trigger] = reply;
        saveMemory(memory);

        await sock.sendMessage(senderID, { 
          text: `✅ Learned! When anyone says "${trigger}", I will reply: "${reply}"` 
        });
      } else {
        await sock.sendMessage(senderID, { 
          text: `❌ Invalid format. Use: *learn [trigger] | [response]*` 
        });
      }
      return;
    }

    // 4. Lyrics Command (Updated to use lrclib.net)
    if (lowerText.startsWith('lyrics ')) {
      const query = messageText.slice(7).trim();
      try {
        const res = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
        if (res.data && res.data.length > 0) {
          const track = res.data[0];
          const lyricsContent = track.plainLyrics || track.syncedLyrics || 'Lyrics content empty.';
          const replyMessage = `🎵 *${track.trackName}* - *${track.artistName}*:\n\n${lyricsContent.slice(0, 1500)}`;
          await sock.sendMessage(senderID, { text: replyMessage });
        } else {
          await sock.sendMessage(senderID, { text: `Sorry, couldn't find lyrics for "${query}".` });
        }
      } catch (err) {
        await sock.sendMessage(senderID, { text: '❌ Error fetching lyrics right now.' });
      }
      return;
    }

    // 5. Dynamic Auto-Reply from database (Only replies if it matches a learned word)
    const memory = loadMemory();
    if (memory[lowerText]) {
      await sock.sendMessage(senderID, { text: memory[lowerText] });
    }
  });
}

startBot();