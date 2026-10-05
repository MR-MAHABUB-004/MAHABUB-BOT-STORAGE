const axios = require("axios");
const fs = require("fs");
const path = require("path");

const cacheDir = path.join(__dirname, "cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

let BASE_API = null;

async function getBaseApi() {
  if (BASE_API) return BASE_API;
  const res = await axios.get(
    "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json",
    { timeout: 15000 }
  );
  if (!res.data?.api) throw new Error("API URL not found");
  BASE_API = String(res.data.api).replace(/\/+$/, "");
  return BASE_API;
}

module.exports = {
  config: {
    name: "sing",
    version: "4.8",
    author: "@𝐌𝐑᭄﹅ 𝐌𝐀𝐇𝐀𝐁𝐔𝐁﹅ メꪜ",
    countDown: 5,
    role: 0,
    longDescription: {
      en: "🎶 Search song → reply number → auto download → auto unsend → auto delete"
    },
    category: "media",
    guide: {
      en: "{pn} <song name>\nExample: sing toh phir aao"
    }
  },

  // ============================================================
  // SONG SEARCH
  // ============================================================
  onStart: async ({ api, args, event }) => {
    if (!args.length) {
      return api.sendMessage(
        "❌ **Song name dao na!**\n\n📌 Example:\n➤ `sing toh phir aao`",
        event.threadID,
        event.messageID
      );
    }

    api.setMessageReaction("⏳", event.messageID, () => {}, true);

    try {
      const BASE = await getBaseApi();
      const query = encodeURIComponent(args.join(" "));

      const response = await axios.get(
        `${BASE}/mahabub/ytsearch?q=${query}`,
        { timeout: 30000 }
      );
      const data = response.data;

      if (
        !data ||
        !data.status ||
        !Array.isArray(data.results) ||
        data.results.length === 0
      ) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        return api.sendMessage(
          "🚫 **No results found!**\nTry another keyword 🎧",
          event.threadID
        );
      }

      const results = data.results.slice(0, 10);

      let body =
        "🎧✨ **SONG SEARCH RESULTS** ✨🎧\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        `🔎 **Query:** ${data.query || args.join(" ")}\n\n`;

      const attachments = [];

      for (let i = 0; i < results.length; i++) {
        const item = results[i];
        body += `🎵 **${i + 1}.** ${item.title || "Unknown"}\n`;

        try {
          const thumbnail =
            item?.thumbnails?.high ||
            item?.thumbnails?.medium ||
            item?.thumbnails?.default ||
            item?.thumbnail;

          if (thumbnail) {
            const image = await axios.get(thumbnail, {
              responseType: "stream",
              timeout: 15000
            });
            attachments.push(image.data);
          }
        } catch (err) {
          // Thumbnail failed — continue
        }
      }

      body +=
        "\n━━━━━━━━━━━━━━━━━━━\n" +
        `📝 **Reply with a number (1-${results.length})**\n` +
        "⬇️ To download audio 🎶";

      api.sendMessage(
        {
          body,
          attachment: attachments.length > 0 ? attachments : undefined
        },
        event.threadID,
        (err, info) => {
          if (err) {
            console.error("Search message error:", err);
            return;
          }
          if (!info?.messageID) return;

          global.GoatBot.onReply.set(info.messageID, {
            commandName: "sing",
            author: event.senderID,
            results,
            searchMsgID: info.messageID
          });
        },
        event.messageID
      );

      api.setMessageReaction("🎶", event.messageID, () => {}, true);
    } catch (err) {
      console.error("SONG SEARCH ERROR:", err?.response?.data || err);
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      api.sendMessage("❌ **Search failed!**\nTry again later.", event.threadID);
    }
  },

  // ============================================================
  // REPLY HANDLER
  // ============================================================
  onReply: async ({ api, event, Reply }) => {
    if (event.senderID !== Reply.author) return;

    const choice = parseInt(String(event.body || "").trim(), 10);

    if (Number.isNaN(choice) || choice < 1 || choice > Reply.results.length) {
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      return api.sendMessage(
        "⚠️ **Invalid number!**\n" +
          `Reply between 1-${Reply.results.length} 🔢`,
        event.threadID,
        event.messageID
      );
    }

    if (Reply.searchMsgID) {
      try {
        api.unsendMessage(Reply.searchMsgID);
      } catch (err) {
        console.error("Unsend search message error:", err);
      }
    }

    const video = Reply.results[choice - 1];
    const videoId = video?.videoId || video?.id;

    if (!videoId) {
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      return api.sendMessage("❌ **Video ID not found!**", event.threadID);
    }

    const youtubeUrl = `https://youtube.com/watch?v=${videoId}`;

    api.setMessageReaction("⏳", event.messageID, () => {}, true);

    let filePath = null;

    const cleanup = () => {
      if (filePath && fs.existsSync(filePath)) fs.unlink(filePath, () => {});
    };

    try {
      const BASE = await getBaseApi();

      const apiUrl = `${BASE}/mahabub/ytdl?url=${youtubeUrl}`;

      const response = await axios.get(apiUrl, { timeout: 120000 });

      // Handles both: { status, data:{...} } and wrapped { data:{ status, data:{...} } }
      const root = response.data?.data?.data ? response.data.data : response.data;
      const info = root?.data;

      // NEW: status is boolean true, link is data.audio
      if (!root || root.status !== true || !info?.audio) {
        console.error("[SING] Invalid API response:", root);
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        return api.sendMessage(
          "❌ **Download failed!**\nAPI did not return an audio link.",
          event.threadID
        );
      }

      const downloadLink = info.audio;

      // API title can be a URL, so prefer search result title
      const apiTitle =
        info.title && !/^https?:\/\//i.test(info.title) ? info.title : null;
      const title = video?.title || apiTitle || "Unknown Song";

      const safeVideoId = String(videoId).replace(/[^a-zA-Z0-9_-]/g, "_");
      filePath = path.join(cacheDir, `${safeVideoId}_${Date.now()}.mp3`);

      const audioResponse = await axios.get(downloadLink, {
        responseType: "stream",
        timeout: 180000,
        maxRedirects: 5
      });

      const writer = fs.createWriteStream(filePath);
      audioResponse.data.pipe(writer);
      audioResponse.data.on("error", () => writer.destroy());

      writer.on("finish", () => {
        try {
          if (!fs.existsSync(filePath)) throw new Error("File not found");
          const stats = fs.statSync(filePath);
          if (stats.size <= 0) throw new Error("File is empty");

          api.sendMessage(
            {
              body:
                "🎶 **NOW PLAYING** 🎶\n" +
                "━━━━━━━━━━━━━━━━━━━\n" +
                `🎵 **Title:** ${title}\n` +
                `📦 **Size:** ${(stats.size / 1024 / 1024).toFixed(2)} MB\n` +
                "━━━━━━━━━━━━━━━━━━━\n" +
                "💿 **MAHABUB-BOT** ✨",
              attachment: fs.createReadStream(filePath)
            },
            event.threadID,
            (err) => {
              if (err) console.error("[SING] Send audio error:", err);
              cleanup();
            },
            event.messageID
          );

          api.setMessageReaction("🎵", event.messageID, () => {}, true);
        } catch (err) {
          console.error("[SING] Audio processing error:", err);
          cleanup();
          api.setMessageReaction("❌", event.messageID, () => {}, true);
          api.sendMessage("❌ **Audio processing failed!**", event.threadID);
        }
      });

      writer.on("error", (err) => {
        console.error("[SING] File write error:", err);
        cleanup();
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        api.sendMessage("❌ **Audio download error!**", event.threadID);
      });
    } catch (err) {
      console.error("[SING] DOWNLOAD ERROR:", err?.response?.data || err);
      cleanup();
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      api.sendMessage(
        "❌ **Audio download error!**\nPlease try again later.",
        event.threadID
      );
    }
  }
};
