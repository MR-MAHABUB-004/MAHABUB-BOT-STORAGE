const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

const MAX_SIZE = 25 * 1024 * 1024; // Messenger attachment limit (~25MB)
const CACHE_DIR = path.join(__dirname, "cache");
const DL_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };

const API_JSON =
  "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json";

let BASE_API = null;

async function getBaseApi() {
  if (BASE_API) return BASE_API;
  const res = await axios.get(API_JSON, { timeout: 15000 });
  if (!res.data?.api) throw new Error("API URL not found");
  BASE_API = String(res.data.api).replace(/\/+$/, "");
  return BASE_API;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(fn, retries = 3, delay = 2000) {
  let lastErr;
  for (let i = 1; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err.code === "TOO_BIG") throw err; // no point retrying
      if (i < retries) await wait(delay);
    }
  }
  throw lastErr;
}

async function downloadFile(url, filePath) {
  const res = await axios.get(url, {
    responseType: "stream",
    headers: DL_HEADERS,
    timeout: 120000,
    maxRedirects: 5
  });

  const len = Number(res.headers["content-length"] || 0);
  if (len > MAX_SIZE) {
    res.data.destroy();
    const e = new Error("File too large");
    e.code = "TOO_BIG";
    throw e;
  }

  try {
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);
      res.data.on("error", reject);
      writer.on("error", reject);
      writer.on("finish", resolve);
      res.data.pipe(writer);
    });

    const { size } = await fs.stat(filePath);
    if (size === 0) throw new Error("Empty file");
    if (size > MAX_SIZE) {
      const e = new Error("File too large");
      e.code = "TOO_BIG";
      throw e;
    }
  } catch (err) {
    await fs.remove(filePath).catch(() => {});
    throw err;
  }
}

module.exports = {
  config: {
    name: "auto",
    version: "5.5",
    author: "MR᭄﹅ MAHABUB﹅ メꪜ",
    countDown: 5,
    role: 0,
    shortDescription: "Auto video downloader",
    category: "media"
  },

  onStart: async function ({ api, event }) {
    return api.sendMessage("📥 Send the link to download the video 🎥", event.threadID);
  },

  onChat: async function ({ api, event }) {
    const { threadID, messageID, senderID } = event;

    // Ignore empty messages and the bot's own messages
    if (!event.body) return;
    if (senderID == api.getCurrentUserID()) return;

    const linkMatch = event.body.trim().match(/(https?:\/\/[^\s]+)/);
    if (!linkMatch) return;

    const videoLink = linkMatch[0];

    // Unique file per request (no clashes when several links arrive at once)
    await fs.ensureDir(CACHE_DIR);
    let filePath = path.join(CACHE_DIR, `auto_${threadID}_${Date.now()}.mp4`);

    api.setMessageReaction("♻", messageID, () => {}, true);

    try {
      const apiBaseURL = await retry(() => getBaseApi());

      const response = await retry(() =>
        axios.get(`${apiBaseURL}/mahabub/dl`, {
          params: { url: videoLink },
          headers: { "User-Agent": "Mozilla/5.0" },
          timeout: 60000
        })
      );

      const data = response.data || {};
      const { platform, title } = data;
      const videoURL = data.hd || data.sd;
      const audioURL = data.mp3;

      if (data.status && data.status !== "success") throw new Error("API error");

      // Prefer video; fall back to audio if only mp3 is returned
      const downloadURL = videoURL || audioURL;
      if (!downloadURL) {
        api.setMessageReaction("✖", messageID, () => {}, true);
        return;
      }
      if (!videoURL) filePath = filePath.replace(/\.mp4$/, ".mp3");

      const quality = videoURL ? (data.hd ? "HD" : "SD") : "MP3";
      const caption =
        `✅ 𝗗𝗼𝘄𝗻𝗹𝗼𝗮𝗱𝗲𝗱!\n\n` +
        `📌 Platform: ${platform || "Unknown"}\n` +
        `🎬 Title: ${title || "No Title"}\n` +
        `📥 Quality: ${quality}`;

      try {
        await retry(() => downloadFile(downloadURL, filePath));
      } catch (err) {
        if (err.code === "TOO_BIG") {
          // Too big for Messenger: send the direct link instead
          api.setMessageReaction("✔", messageID, () => {}, true);
          return api.sendMessage(
            `${caption}\n\n⚠️ File is too large to send.\n🔗 ${downloadURL}`,
            threadID
          );
        }
        throw err;
      }

      api.setMessageReaction("✔", messageID, () => {}, true);
      await api.sendMessage(
        { body: caption, attachment: fs.createReadStream(filePath) },
        threadID,
        () => fs.remove(filePath).catch(() => {})
      );
    } catch (err) {
      console.error("[auto] failed:", err.message, "| status:", err.response?.status, "| url:", err.config?.url);
      await fs.remove(filePath).catch(() => {});
      api.setMessageReaction("❌", messageID, () => {}, true);
      // No error message shown in chat
    }
  }
};
