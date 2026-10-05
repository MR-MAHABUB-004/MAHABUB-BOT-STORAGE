const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");

const cacheDir = path.join(__dirname, "cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

const API_JSON =
  "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json";

let BASE_API = null;
let YTDL_API = null;

async function getBaseApi() {
  if (BASE_API) return BASE_API;
  const res = await axios.get(API_JSON, { timeout: 15000 });
  if (!res.data?.api) throw new Error("API URL not found");
  BASE_API = String(res.data.api).replace(/\/+$/, "");
  return BASE_API;
}

async function getYtdlApi() {
  if (YTDL_API) return YTDL_API;
  const res = await axios.get(API_JSON, { timeout: 15000 });
  if (!res.data?.ytdlapi) throw new Error("YTDL API URL not found");
  YTDL_API = String(res.data.ytdlapi).replace(/\/+$/, "");
  return YTDL_API;
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
  Accept: "*/*"
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  config: {
    name: "sing",
    version: "5.0",
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

      const response = await axios.get(`${BASE}/mahabub/ytsearch?q=${query}`, {
        timeout: 30000
      });
      const data = response.data;
      console.log("[SING] Search response:", JSON.stringify(data)?.slice(0, 1500));

      // Tolerant parsing: find the results array wherever it is
      const pick = (d) =>
        [
          d?.videos,
          d?.data?.videos,
          d?.results,
          d?.data?.results,
          d?.data,
          d?.result,
          d?.data?.data,
          d?.items,
          Array.isArray(d) ? d : null
        ].find((x) => Array.isArray(x) && x.length > 0);

      const rawList = pick(data);

      if (!rawList) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        return api.sendMessage(
          "🚫 **No results found!**\nTry another keyword 🎧",
          event.threadID
        );
      }

      // Normalize each item
      const results = rawList.slice(0, 10).map((it) => {
        const url = it.url || it.link || "";
        const idFromUrl = (url.match(/[?&]v=([\w-]{11})/) ||
          url.match(/youtu\.be\/([\w-]{11})/) ||
          [])[1];
        return {
          ...it,
          videoId: it.videoId || it.video_id || it.id || idFromUrl,
          title: it.title || it.name || "Unknown",
          thumbnail: it.thumbnail || it.thumb || it.image
        };
      });

      let body =
        "🎧✨ **SONG SEARCH RESULTS** ✨🎧\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        `🔎 **Query:** ${data.query || args.join(" ")}\n\n`;

      results.forEach((item, i) => {
        const meta = [item.duration && `⏱ ${item.duration}`, item.author]
          .filter(Boolean)
          .join(" • ");
        body += `🎵 **${i + 1}.** ${item.title}\n`;
        if (meta) body += `     ${meta}\n`;
      });

      // Fetch thumbnails in parallel, keep result order, skip failures
      const thumbs = await Promise.all(
        results.map(async (item) => {
          const thumbnail =
            item?.thumbnails?.high ||
            item?.thumbnails?.medium ||
            item?.thumbnails?.default ||
            item?.thumbnail;
          if (!thumbnail) return null;
          try {
            const image = await axios.get(thumbnail, {
              responseType: "stream",
              timeout: 15000
            });
            return image.data;
          } catch (err) {
            return null;
          }
        })
      );
      const attachments = thumbs.filter(Boolean);

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
        "⚠️ **Invalid number!**\n" + `Reply between 1-${Reply.results.length} 🔢`,
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

    // Reject JSON/HTML error bodies saved as media, without trusting content-type
    const looksLikeError = (file) => {
      const size = fs.statSync(file).size;
      if (size > 50 * 1024) return false;
      const head = fs.readFileSync(file, { encoding: "utf8" }).slice(0, 200).trim();
      return /^[{<]/.test(head) || /error|expired|forbidden/i.test(head);
    };

    const downloadFile = async (url, ext, safeId) => {
      const r = await axios.get(url, {
        responseType: "stream",
        timeout: 180000,
        maxRedirects: 5,
        headers: HEADERS,
        validateStatus: (s) => s >= 200 && s < 300
      });

      filePath = path.join(cacheDir, `${safeId}_${Date.now()}.${ext}`);
      await pipeline(r.data, fs.createWriteStream(filePath));

      const size = fs.statSync(filePath).size;
      if (size <= 0) throw new Error("File is empty");
      if (looksLikeError(filePath)) throw new Error("Server returned an error body");
      return size;
    };

    try {
      const BASE = await getYtdlApi();
      const apiUrl = `${BASE}/mahabub/ytdl?url=${encodeURIComponent(youtubeUrl)}`;
      const response = await axios.get(apiUrl, { timeout: 120000 });
      const body = response.data;

      // New format: { developer, status, data: { title, thumb, video, video_hd, audio, quality, channel } }
      const info = [body?.data?.data, body?.data, body].find(
        (x) => x && typeof x === "object" && (x.audio || x.mp3 || x.video_hd || x.video)
      );

      if (!info || body?.status === false) {
        console.error("[SING] Invalid API response:", JSON.stringify(body)?.slice(0, 800));
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        return api.sendMessage(
          "❌ **Download failed!**\nAPI did not return a download link.",
          event.threadID
        );
      }

      const apiTitle =
        info.title && !/^https?:\/\//i.test(info.title) ? info.title : null;
      const title = apiTitle || video?.title || "Unknown Song";
      const channel = info.channel || video?.author || "";
      const safeId = String(videoId).replace(/[^a-zA-Z0-9_-]/g, "_");

      // Audio first, then video as fallback (video/video_hd are often identical, so dedupe)
      const seen = new Set();
      const sources = [
        { url: info.audio || info.mp3, ext: "mp3" },
        { url: info.video_hd, ext: "mp4" },
        { url: info.video, ext: "mp4" }
      ].filter((s) => s.url && !seen.has(s.url) && seen.add(s.url));

      let size = 0;
      let lastErr = null;

      outer: for (const src of sources) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            size = await downloadFile(src.url, src.ext, safeId);
            lastErr = null;
            break outer;
          } catch (e) {
            lastErr = e;
            console.error(
              `[SING] ${src.ext} attempt ${attempt} failed:`,
              e?.response?.status || "",
              e?.message
            );
            cleanup();
            filePath = null;
            await sleep(attempt * 3000);
          }
        }
      }

      if (lastErr || !filePath) throw lastErr || new Error("No file downloaded");

      api.sendMessage(
        {
          body:
            "🎶 **NOW PLAYING** 🎶\n" +
            "━━━━━━━━━━━━━━━━━━━\n" +
            `🎵 **Title:** ${title}\n` +
            (channel ? `📺 **Channel:** ${channel}\n` : "") +
            `📦 **Size:** ${(size / 1024 / 1024).toFixed(2)} MB\n` +
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
