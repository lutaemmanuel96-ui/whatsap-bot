import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import axios from 'axios';

const DB_FILE = 'jason.json'; // Your existing JSON memory file

// Helper to load or initialize learned auto-replies
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
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\nScan this QR code with WhatsApp:');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('\n✅ Bot connected successfully, auto-features and learning active!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Message Handler
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const m = messages[0];
    if (!m.message) return;
    
    const senderID = m.key.remoteJid;

    // 1. Auto View Status and Auto-React Feature
    if (senderID?.endsWith('@broadcast') || m.key.remoteJid?.endsWith('@broadcast')) {
      const participant = m.key.participant || senderID;
      console.log(`👁️ Auto-viewing status update from: ${participant}`);
      
      await sock.readMessages([m.key]);

      const emojis = ['❤️', '🥰', '🔥', '😎'];
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

      await sock.sendMessage(senderID, {
        react: {
          text: randomEmoji,
          key: m.key
        }
      });
      
      console.log(`Reacted with ${randomEmoji} to status from ${participant}`);
      return;
    }

    if (m.key.fromMe) return;

    // 2. Auto Read Messages Feature
    await sock.readMessages([m.key]);

    const messageText = 
      m.message.conversation || 
      m.message.extendedTextMessage?.text || 
      '';

    if (!messageText) return;
    const lowerText = messageText.toLowerCase().trim();
    console.log(`[Incoming] From ${senderID}: "${messageText}"`);

    // 3. Learn Command ("learn keyword | response")
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
          text: `✅ Learned successfully! When anyone says "${trigger}", I will now reply: "${reply}"` 
        });
      } else {
        await sock.sendMessage(senderID, { 
          text: `❌ Invalid format. Use: *learn [trigger] | [response]*` 
        });
      }
      return;
    }

    // 4. Get Song Lyrics Command ("lyrics [song name]")
    if (lowerText.startsWith('lyrics ')) {
      const query = messageText.slice(7).trim();
      await sock.sendMessage(senderID, { text: `🔍 Searching lyrics for: *${query}*...` });

      try {
        const res = await axios.get(`https://api.lyrics.ovh/v1/search?q=${encodeURIComponent(query)}`);
        if (res.data && res.data.data && res.data.data.length > 0) {
          const track = res.data.data[0];
          const lyricsRes = await axios.get(`https://api.lyrics.ovh/v1/${track.artist.name}/${track.title}`);
          
          const lyricsContent = lyricsRes.data.lyrics || 'Lyrics found, but content is empty.';
          const replyMessage = `🎵 *${track.title}* - *${track.artist.name}*:\n\n${lyricsContent.slice(0, 1500)}`;
          await sock.sendMessage(senderID, { text: replyMessage });
        } else {
          await sock.sendMessage(senderID, { text: `Sorry, couldn't find lyrics for "${query}".` });
        }
      } catch (err) {
        await sock.sendMessage(senderID, { text: '❌ Error fetching lyrics right now. Try again later.' });
      }
      return;
    }

    // 5. Dynamic Auto-Reply from jason.json database
    const memory = loadMemory();
    if (memory[lowerText]) {
      await sock.sendMessage(senderID, { text: memory[lowerText] });
    } else {
      await sock.sendMessage(senderID, { 
        text: `I received: "${messageText}". Type *help* or teach me using *learn [word] | [reply]*!` 
      });
    }
  });
}

startBot();