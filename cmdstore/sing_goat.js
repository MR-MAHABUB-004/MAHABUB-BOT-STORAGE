const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");

const cacheDir = path.join(__dirname, "cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

const MAX_SIZE = 25 * 1024 * 1024; // Messenger attachment limit

const API_JSON =
  "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json";

const DL_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "*/*"
};

let API_CACHE = null;

async function getApiConfig() {
  if (API_CACHE) return API_CACHE;
  const res = await axios.get(API_JSON, { timeout: 15000 });
  if (!res.data || typeof res.data !== "object") throw new Error("API config invalid");
  API_CACHE = res.data;
  return API_CACHE;
}

async function getBaseApi() {
  const cfg = await getApiConfig();
  if (!cfg.api) throw new Error("API URL not found");
  return String(cfg.api).replace(/\/+$/, "");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Safe error-body printer (stream bodies are skipped)
const errBody = (err) => {
  const d = err?.response?.data;
  if (!d || typeof d.pipe === "function") return "";
  try {
    return typeof d === "string" ? d.slice(0, 300) : JSON.stringify(d).slice(0, 300);
  } catch {
    return "";
  }
};

// NEW: call ytmp3 API with retry -> returns the mp3 download URL
// Response: { status, developer, videoId, data: { downloadUrl } }
async function fetchMp3Link(BASE, youtubeUrl) {
  const apiUrl = `${BASE}/mahabub/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.get(apiUrl, { timeout: 120000 });
      const body = res.data;
      const links = [body?.data?.downloadUrl, body?.downloadUrl, body?.downloadLink]
        .filter((l, i, a) => typeof l === "string" && /^https?:\/\//i.test(l) && a.indexOf(l) === i);
      if (body?.status !== false && links.length) return links;
      lastErr = new Error("API returned no download link");
      console.error("[SING] Invalid API response:", JSON.stringify(body)?.slice(0, 500));
    } catch (e) {
      lastErr = e;
      console.error(`[SING] ytmp3 attempt ${attempt} failed:`, e?.response?.status || e?.code || "", e?.message);
    }
    if (attempt < 3) await sleep(attempt * 3000);
  }
  throw lastErr;
}

module.exports = {
  config: {
    name: "sing",
    version: "5.3",
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
      console.error("SONG SEARCH ERROR:", err?.response?.status, err?.message);
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      api.sendMessage("❌ **Search failed!**\nTry again later.", event.threadID);
    }
  },

  // ============================================================
  // REPLY HANDLER
  // ============================================================
  onReply: async ({ api, event, Reply }) => {
    if (String(event.senderID) !== String(Reply.author)) return;

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

    // Reject JSON/HTML error bodies saved as media
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
        headers: DL_HEADERS,
        validateStatus: (s) => s >= 200 && s < 300
      });

      const ctype = String(r.headers["content-type"] || "").toLowerCase();
      if (/text\/html|application\/json/.test(ctype)) {
        r.data.destroy();
        throw new Error(`Bad content-type: ${ctype}`);
      }

      const len = Number(r.headers["content-length"] || 0);
      if (len > MAX_SIZE) {
        r.data.destroy();
        const e = new Error("File too large");
        e.code = "TOO_BIG";
        throw e;
      }

      filePath = path.join(cacheDir, `${safeId}_${Date.now()}.${ext}`);
      await pipeline(r.data, fs.createWriteStream(filePath));

      const size = fs.statSync(filePath).size;
      if (size <= 0) throw new Error("File is empty");
      if (size > MAX_SIZE) {
        const e = new Error("File too large");
        e.code = "TOO_BIG";
        throw e;
      }
      if (looksLikeError(filePath)) throw new Error("Server returned an error body");
      return size;
    };

    try {
      const BASE = await getBaseApi();
      const safeId = String(videoId).replace(/[^a-zA-Z0-9_-]/g, "_");
      const title = video?.title || "Unknown Song";
      const channel = video?.author || "";

      let size = 0;
      let lastErr = null;

      // Each attempt fetches a fresh tokenized link (links can expire)
      // Get the link once; the file may still be converting, so retry the SAME link
      // with longer waits. Only request a fresh link after several failures.
      let mp3Urls = await fetchMp3Link(BASE, youtubeUrl);
      console.log("[SING] mp3 link hosts:", mp3Urls.map((u) => new URL(u).host).join(", "));

      outer: for (let attempt = 1; attempt <= 4; attempt++) {
        for (const mp3Url of mp3Urls) {
          try {
            size = await downloadFile(mp3Url, "mp3", safeId);
            lastErr = null;
            break outer;
          } catch (e) {
            lastErr = e;
            console.error(
              `[SING] attempt ${attempt} (${new URL(mp3Url).host}) failed:`,
              e?.response?.status || e?.code || "",
              e?.message,
              errBody(e)
            );
            cleanup();
            filePath = null;
            if (e.code === "TOO_BIG") break outer;
          }
        }
        if (attempt === 2) {
          try { mp3Urls = await fetchMp3Link(BASE, youtubeUrl); } catch (_) {}
        }
        if (attempt < 4) await sleep(4000);
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
      console.error(
        "[SING] DOWNLOAD ERROR:",
        err?.response?.status || err?.code || "",
        err?.message,
        errBody(err)
      );
      cleanup();
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      api.sendMessage(
        err?.code === "TOO_BIG"
          ? "❌ **File too large to send!** (max 25 MB)"
          : "❌ **Audio download error!**\nPlease try again later.",
        event.threadID
      );
    }
  }
};
