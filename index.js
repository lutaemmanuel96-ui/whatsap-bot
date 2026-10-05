import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import axios from 'axios';
import { ADDRGETNETWORKPARAMS } from 'dns/promises';

let replies = JSON.parse(fs.readFileSync('./replies.json', 'utf-8'));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({ auth: state });

    sock.ev.on('connection.update', async (update) => {
        const { qr, connection } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            startBot();
        } else if (connection === 'open') {
            console.log('🤖 Bot is online!');
            await sock.sendPresenceUpdate('available');
            setInterval(async () => {
                await sock.sendPresenceUpdate('available');
            }, 60000);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        // Auto-like statuses
        if (m.key.remoteJid === 'status@broadcast') {
            const emojis = ['❤', '🔥'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            
            await sock.sendMessage('status@broadcast', {
                react: {
                    text: randomEmoji,
                    key: m.key
                }
            }, { statusJidList: [m.key.participant] });
            return;
        }

        if (m.key.fromMe) return;

        const sender = m.key.remoteJid;
        const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
        if (!text) return;

        const cleanText = text.toLowerCase().trim();
        const args = text.trim().split(" ");
        const command = args[0].toLowerCase();

        // Silent learning command: !learn keyword | response
        if (command === '!learn') {
            const content = text.replace('!learn', '').trim();
            const [key, ...responseParts] = content.split('|');
            if (!key || responseParts.length === 0) return;

            replies[key.trim().toLowerCase()] = responseParts.join('|').trim();
            fs.writeFileSync('./replies.json', JSON.stringify(replies, null, 2));
            await sock.sendMessage(sender, { text: "Saved." });
            return;
        }

        // SONG LYRICS SEARCH COMMAND: !lyrics [song name]
        if (command === '!lyrics') {
            const query = text.replace('!lyrics', '').trim();
            if (!query) {
                await sock.sendMessage(sender, { text: "⚠️ Usage: !lyrics [song name]" });
                return;
            }

            try {
                const res = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
                
                if (res.data && res.data.length > 0) {
                    const track = res.data[0];
                    const trackName = track.trackName || query;
                    const artistName = track.artistName || "Unknown Artist";
                    
                    let lyricsText = track.plainLyrics;

                    // If plain lyrics aren't available, strip timestamps from synced lyrics
                    if (!lyricsText && track.syncedLyrics) {
                        lyricsText = track.syncedLyrics.replace(/\[\d{2}:\d{2}\.\d{2}\]/g, '').trim();
                    }

                    if (!lyricsText) {
                        await sock.sendMessage(sender, { text: `❌ Found "${trackName}" by ${artistName}, but no lyrics text is available for it.` });
                        return;
                    }

                    const messageContent = `🎵 *${trackName}* by *${artistName}*\n\n${lyricsText.slice(0, 1500)}`;
                    await sock.sendMessage(sender, { text: messageContent });
                } else {
                    await sock.sendMessage(sender, { text: `❌ Could not find lyrics for "${query}". Try adding the artist name (e.g. !lyrics faded Alan Walker).` });
                }
            } catch (err) {
                console.log("Lyrics error:", err.message);
                await sock.sendMessage(sender, { text: `❌ Error fetching lyrics. Please try another song.` });
            }
            return;
        }

        // Reply if known, otherwise stay silent
        if (replies[cleanText]) {
            await sock.sendMessage(sender, { text: replies[cleanText] });
        }
    });
}

startBot();
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('WhatsApp bot is running!');
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});