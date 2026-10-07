// 1. Auto View Status and Auto-React Feature
    if (senderID?.endsWith('@broadcast') || m.key.remoteJid?.endsWith('@broadcast')) {
      const participant = m.key.participant || senderID;
      console.log(`👁️ Auto-viewing status update from: ${participant}`);
      
      // Mark the status as read
      await sock.readMessages([m.key]);

      // Array of reactions you want to use
      const emojis = ['❤️', '🥰', '🔥', '😎'];
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

      // Send the reaction to the status update
      await sock.sendMessage(senderID, {
        react: {
          text: randomEmoji,
          key: m.key
        }
      });
      
      console.log(`reacted with ${randomEmoji} to status from ${participant}`);
      return;
    }