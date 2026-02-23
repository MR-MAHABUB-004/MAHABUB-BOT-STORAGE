const axios = require("axios");
const fs = require("fs");
const path = require("path");
const ytSearch = require("yt-search");

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
    version: "5.2",
    author: "@𝐌𝐑᭄﹅ 𝐌𝐀𝐇𝐀𝐁𝐔𝐁﹅ メꪜ",
    countDown: 5,
    role: 0,
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
      /* 🔍 Searching */
      searchMsg = await api.sendMessage(
        `🔍 Searching for "${query}"...`,
        event.threadID
      );

      /* 🔎 YT SEARCH (npm) */
      const ytResult = await ytSearch(query);
      if (!ytResult.videos.length) throw new Error("No YouTube result");

      const top = ytResult.videos[0];
      const videoId = top.videoId;
      const title = `${top.title} (youtube)`;

      /* ✅ EDIT → FOUND */
      await api.editMessage(
        `✅ Found: ${title}\n⬇ Sending...`,
        searchMsg.messageID
      );

      /* 🌐 CALL API */
      const BASE = await getBaseApi();
      const apiUrl = `${BASE}/mahabub/ytmp3v2?url=${videoId}`;
      const { data } = await axios.get(apiUrl);

      if (!data?.status || !data?.data?.link)
        throw new Error("Audio link not found");

      const songData = data.data;
      const filePath = path.join(cacheDir, `${videoId}.mp3`);

      /* ⬇ DOWNLOAD */
      const stream = await axios.get(songData.link, {
        responseType: "stream",
      });

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filePath);
        stream.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      /* 🎶 FINAL EDIT MESSAGE */
      await api.editMessage(
        `🎶 ${title}\n` +
        `⏱ Duration: ${Math.floor(songData.duration)} sec\n` +
        `📦 Size: ${(songData.filesize / 1024 / 1024).toFixed(2)} MB\n\n` +
        `✨ Enjoy your music`,
        searchMsg.messageID
      );

      /* 🎵 SEND AUDIO ONLY */
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
        api.editMessage(`❌ Failed: ${err.message}`, searchMsg.messageID);
      }
    }
  },
};
