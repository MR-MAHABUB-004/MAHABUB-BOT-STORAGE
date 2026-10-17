const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");

const API_JSON =
  "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json";

const CACHE_DIR = path.join(__dirname, "cache");
const MAX_SIZE = 25 * 1024 * 1024;

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

module.exports = {
  config: {
    name: "ytmp3",
    aliases: ["ytaudio", "mp3"],
    version: "1.0.0",
    author: "MAHABUB",
    countDown: 10,
    role: 0,
    category: "media",
    description: "Download YouTube audio as MP3",
    guide: {
      en: "{pn} <YouTube URL>"
    }
  },

  onStart: async ({ api, event, args }) => {
    const youtubeUrl = args[0];

    if (
      !youtubeUrl ||
      !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(
        youtubeUrl
      )
    ) {
      return api.sendMessage(
        "❌ Please provide a valid YouTube URL.\n\n" +
          "Example:\n" +
          "ytmp3 https://www.youtube.com/watch?v=5PckoKSTlbU",
        event.threadID,
        event.messageID
      );
    }

    let filePath = null;

    const cleanup = () => {
      if (filePath) {
        const target = filePath;
        filePath = null;
        fs.unlink(target, () => {});
      }
    };

    try {
      api.setMessageReaction(
        "⏳",
        event.messageID,
        () => {},
        true
      );

      // Get API base URL
      const configResponse = await axios.get(API_JSON, {
        timeout: 15000
      });

      const BASE = String(
        configResponse.data?.api || ""
      ).replace(/\/+$/, "");

      if (!BASE) {
        throw new Error("API URL not found in APIURL.json");
      }

      // Request MP3 download information
      const response = await axios.get(
        `${BASE}/mahabub/ytmp3v3`,
        {
          params: { url: youtubeUrl },
          timeout: 120000
        }
      );

      const data = response.data;

      if (
        data?.status !== "success" ||
        typeof data?.download_url !== "string" ||
        !/^https?:\/\//i.test(data.download_url)
      ) {
        throw new Error(
          data?.message || "MP3 download URL not found"
        );
      }

      const title = data.title || "YouTube Audio";
      const author = data.author || "Unknown";
      const bitrate = data.bitrate || "Unknown";

      // Download actual audio file
      const audioResponse = await axios.get(
        data.download_url,
        {
          responseType: "stream",
          timeout: 180000,
          maxRedirects: 5,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
          },
          validateStatus: (status) =>
            status >= 200 && status < 300
        }
      );

      const contentType = String(
        audioResponse.headers["content-type"] || ""
      ).toLowerCase();

      if (
        /text\/html|application\/json/.test(contentType)
      ) {
        audioResponse.data.destroy();
        throw new Error(
          "Download URL returned an error page instead of audio"
        );
      }

      const contentLength = Number(
        audioResponse.headers["content-length"] || 0
      );

      if (contentLength > MAX_SIZE) {
        audioResponse.data.destroy();
        throw new Error("TOO_BIG");
      }

      const safeName = String(data.videoId || Date.now())
        .replace(/[^a-zA-Z0-9_-]/g, "_");

      filePath = path.join(
        CACHE_DIR,
        `${safeName}_${Date.now()}.mp3`
      );

      await pipeline(
        audioResponse.data,
        fs.createWriteStream(filePath)
      );

      const stats = fs.statSync(filePath);

      if (stats.size === 0) {
        throw new Error("Downloaded audio is empty");
      }

      if (stats.size > MAX_SIZE) {
        throw new Error("TOO_BIG");
      }

      // Send audio to Messenger
      api.sendMessage(
        {
          body:
            "🎵 𝗬𝗢𝗨𝗧𝗨𝗕𝗘 𝗔𝗨𝗗𝗜𝗢\n" +
            "━━━━━━━━━━━━━━━━━━\n" +
            `🎧 Title: ${title}\n` +
            `📺 Author: ${author}\n` +
            `🔊 Quality: ${bitrate}\n` +
            `📦 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n` +
            "━━━━━━━━━━━━━━━━━━\n" +
            "💚 MAHABUB-BOT",
          attachment: fs.createReadStream(filePath)
        },
        event.threadID,
        (error) => {
          if (error) {
            console.error("[YTMP3] Send error:", error);
          }

          cleanup();
        },
        event.messageID
      );

      api.setMessageReaction(
        "✅",
        event.messageID,
        () => {},
        true
      );
    } catch (error) {
      console.error(
        "[YTMP3] Error:",
        error.response?.status || "",
        error.message
      );

      cleanup();

      api.setMessageReaction(
        "❌",
        event.messageID,
        () => {},
        true
      );

      api.sendMessage(
        error.message === "TOO_BIG"
          ? "❌ Audio file is too large! Maximum size: 25 MB."
          : "❌ Audio download failed. Please try again later.",
        event.threadID,
        event.messageID
      );
    }
  }
};
