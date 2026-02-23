const axios = require("axios");
const fs = require("fs");
const path = require("path");

const cacheDir = path.join(__dirname, "cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

let BASE_API = null;

async function getBaseApi() {
  if (BASE_API) return BASE_API;

  const res = await axios.get(
    "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json"
  );

  BASE_API = res.data.api;
  return BASE_API;
}

function deleteAfterTimeout(filePath, timeout = 15000) {
  setTimeout(() => {
    if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
  }, timeout);
}

module.exports = {
  config: {
    name: "song",
    aliases: ["music"],
    version: "5.1",
    author: "@𝐌𝐑᭄﹅ 𝐌𝐀𝐇𝐀𝐁𝐔𝐁﹅ メꪜ",
    countDown: 5,
    role: 0,
    shortDescription: "Auto best match song download",
    longDescription: "Search → auto select → edit message → send audio",
    category: "media",
    guide: "{pn} <song name>",
  },

  onStart: async ({ api, event, args }) => {
    if (!args.length) {
      return api.sendMessage(
        "❌ | Song name dao!\nExample: song toh phir aao",
        event.threadID,
        event.messageID
      );
    }

    const query = args.join(" ");
    let searchMsg;

    try {
      searchMsg = await api.sendMessage(
        `🔍 Searching for "${query}"...`,
        event.threadID
      );

      const BASE = await getBaseApi();

      const searchUrl = `${BASE}/mahabub/ytsearch?q=${encodeURIComponent(query)}`;
      const { data } = await axios.get(searchUrl);

      if (!data?.status || !data.results?.length)
        throw new Error("No results found");

      const best = data.results[0];
      const videoId = best.videoId;

      const mp3Url = `${BASE}/mahabub/ytmp3v2?url=${videoId}`;
      const mp3Res = await axios.get(mp3Url);

      if (!mp3Res.data?.status || !mp3Res.data?.data?.link)
        throw new Error("Audio link not found");

      const songData = mp3Res.data.data;
      const filePath = path.join(cacheDir, `${videoId}.mp3`);

      const audioStream = await axios.get(songData.link, {
        responseType: "stream",
      });

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filePath);
        audioStream.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      /* ✅ EDIT MESSAGE WITH FULL INFO */
      await api.editMessage(
        `🎶 𝗡𝗢𝗪 𝗣𝗟𝗔𝗬𝗜𝗡𝗚\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `🎵 Title: ${songData.title}\n` +
        `⏱ Duration: ${Math.floor(songData.duration)} sec\n` +
        `📦 Size: ${(songData.filesize / 1024 / 1024).toFixed(2)} MB\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `⬇ Sending audio...`,
        searchMsg.messageID
      );

      /* 🎵 SEND ONLY AUDIO (NO EXTRA TEXT) */
      await api.sendMessage(
        {
          attachment: fs.createReadStream(filePath),
        },
        event.threadID,
        () => deleteAfterTimeout(filePath, 10000),
        event.messageID
      );

    } catch (err) {
      console.error("Song Error:", err.message);

      if (searchMsg?.messageID) {
        api.editMessage(
          `❌ Failed: ${err.message}`,
          searchMsg.messageID
        );
      }
    }
  },
};
