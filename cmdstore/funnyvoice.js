const axios = require("axios");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");

const AUDIO_URL =
  "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/voicepack/funny.mp3";

const CACHE_DIR = path.join(os.tmpdir(), "mahabub-bot-funnyvoice");
const AUDIO_PATH = path.join(CACHE_DIR, "funny.mp3");

module.exports = {
  config: {
    name: "funnyvoice",
    aliases: ["fv", "funny"],
    version: "2.0.0",
    author: "Mahabub",
    countDown: 3,
    role: 0,
    description: "Send a funny voice audio",
    category: "fun",
    guide: "{pn}"
  },

  onStart: async function ({ api, event, message }) {
    try {
      await fs.ensureDir(CACHE_DIR);

      // Download MP3 if it does not exist or is empty
      if (
        !(await fs.pathExists(AUDIO_PATH)) ||
        (await fs.stat(AUDIO_PATH)).size === 0
      ) {
        const response = await axios.get(AUDIO_URL, {
          responseType: "arraybuffer",
          timeout: 30000,
          headers: {
            "User-Agent": "MAHABUB-BOT/2.0"
          }
        });

        if (!response.data || response.data.length === 0) {
          throw new Error("MP3 file is empty.");
        }

        await fs.writeFile(AUDIO_PATH, Buffer.from(response.data));
      }

      const stats = await fs.stat(AUDIO_PATH);

      if (!stats.size) {
        throw new Error("Downloaded audio file is empty.");
      }

      const audioStream = fs.createReadStream(AUDIO_PATH);

      audioStream.on("error", (err) => {
        console.error("[FUNNYVOICE] Audio stream error:", err);
      });

      api.sendMessage(
        {
          body: "😂 𝗙𝗨𝗡𝗡𝗬 𝗩𝗢𝗜𝗖𝗘 🎤",
          attachment: audioStream
        },
        event.threadID,
        (err) => {
          if (err) {
            console.error("[FUNNYVOICE] Send error:", err);
          }
        },
        event.messageID
      );
    } catch (error) {
      console.error("[FUNNYVOICE] Error:", error);

      return message.reply(
        "❌ Funny voice পাঠানো যায়নি!\n" +
        (error.message || String(error))
      );
    }
  }
};
