const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");

const cacheDir = path.join(__dirname, "cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

const MAX_SIZE = 25 * 1024 * 1024;

const API_JSON =
  "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json";

// ------------------------------------------------------------
// Download headers (same browser fingerprint as the ytmp3v3 API).
// NOTE: "accept-encoding" is intentionally NOT set. Asking for zstd/br
// can return a compressed body axios can't decode -> corrupted mp3.
// ------------------------------------------------------------
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; TECNO BG7 Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.8037.107 Mobile Safari/537.36";

const BASE_DL_HEADERS = {
  "sec-ch-ua": '"Chromium";v="154", "Android WebView";v="154", "Not A(Brand";v="99"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  "upgrade-insecure-requests": "1",
  "user-agent": MOBILE_UA,
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "x-requested-with": "mark.via.gp",
  "sec-fetch-site": "cross-site",
  "sec-fetch-mode": "navigate",
  "sec-fetch-user": "?1",
  "sec-fetch-dest": "iframe",
  "accept-language": "en-US,en;q=0.9"
};

// Tried in order until one works.
const DL_HEADER_PROFILES = [
  { ...BASE_DL_HEADERS, referer: "https://ytmp4.blog/" },
  { ...BASE_DL_HEADERS, referer: "https://api.ytmp3.tube/" }
];

let API_CACHE = null;

async function getApiConfig() {
  if (API_CACHE) return API_CACHE;

  const response = await axios.get(API_JSON, { timeout: 15000 });

  if (!response.data || typeof response.data !== "object") {
    throw new Error("API config invalid");
  }

  API_CACHE = response.data;
  return API_CACHE;
}

// kind "mp3"    -> apiv2 first (hosts /mahabub/ytmp3v3), then api
// kind "search" -> api first, then apiv2
async function getBaseApi(kind = "search") {
  const config = await getApiConfig();
  const value =
    kind === "mp3" ? config.apiv2 || config.api : config.api || config.apiv2;

  if (!value) throw new Error("API URL not found in APIURL.json");

  return String(value).replace(/\/+$/, "");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getErrorBody(error) {
  const data = error?.response?.data;
  if (!data || typeof data.pipe === "function") return "";

  try {
    return typeof data === "string"
      ? data.slice(0, 300)
      : JSON.stringify(data).slice(0, 300);
  } catch {
    return "";
  }
}

// ============================================================
// YTMP3V3 API
// Endpoint: BASE/mahabub/ytmp3v3?url=
// ============================================================

async function fetchMp3Link(BASE, youtubeUrl) {
  const apiUrl = `${BASE}/mahabub/ytmp3v3?url=${encodeURIComponent(youtubeUrl)}`;

  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await axios.get(apiUrl, {
        timeout: 130000,
        headers: { "User-Agent": MOBILE_UA, Accept: "application/json" }
      });

      const data = response.data;

      if (!data || typeof data !== "object") {
        throw new Error("Invalid API response");
      }

      const downloadUrls = [
        data.download_url,
        data.data?.download_url,
        data.downloadUrl,
        data.data?.downloadUrl,
        data.downloadLink,
        data.data?.downloadLink
      ].filter(
        (url, index, array) =>
          typeof url === "string" &&
          /^https?:\/\//i.test(url) &&
          array.indexOf(url) === index
      );

      if (data.status === "success" && downloadUrls.length > 0) {
        console.log(
          "[SING] API success:",
          data.title || "Unknown",
          "| Bitrate:",
          data.bitrate || "Unknown"
        );
        return { urls: downloadUrls, info: data };
      }

      lastError = new Error(
        data.message || data.error || "API returned no valid download_url"
      );

      console.error(
        "[SING] Invalid API response:",
        JSON.stringify(data).slice(0, 500)
      );
    } catch (error) {
      lastError = error;

      console.error(
        `[SING] ytmp3v3 attempt ${attempt} failed:`,
        error.response?.status || error.code || "",
        error.message,
        getErrorBody(error)
      );
    }

    if (attempt < 3) await sleep(attempt * 3000);
  }

  throw lastError || new Error("Unable to get MP3 download URL");
}

// ============================================================
// COMMAND
// ============================================================

module.exports = {
  config: {
    name: "sing",
    version: "6.1",
    author: "MAHABUB",
    countDown: 5,
    role: 0,
    longDescription: {
      en: "Search songs, reply with a number, and download MP3 audio."
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
        "❌ Song name dao!\n\n📌 Example:\nsing toh phir aao",
        event.threadID,
        event.messageID
      );
    }

    api.setMessageReaction("⏳", event.messageID, () => {}, true);

    try {
      const BASE = await getBaseApi("search");

      const response = await axios.get(`${BASE}/mahabub/ytsearch`, {
        params: { q: args.join(" ") },
        timeout: 30000
      });

      const data = response.data;

      console.log("[SING] Search response:", JSON.stringify(data).slice(0, 1000));

      const pick = (value) =>
        [
          value?.videos,
          value?.data?.videos,
          value?.results,
          value?.data?.results,
          value?.data,
          value?.result,
          value?.data?.data,
          value?.items,
          Array.isArray(value) ? value : null
        ].find((item) => Array.isArray(item) && item.length > 0);

      const rawList = pick(data);

      if (!rawList) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);

        return api.sendMessage(
          "🚫 No songs found!\nTry another keyword 🎧",
          event.threadID,
          event.messageID
        );
      }

      const results = rawList.slice(0, 10).map((item) => {
        const url = item.url || item.link || "";

        const match =
          url.match(/[?&]v=([\w-]{11})/) ||
          url.match(/youtu\.be\/([\w-]{11})/) ||
          url.match(/youtube\.com\/shorts\/([\w-]{11})/);

        return {
          ...item,
          videoId:
            item.videoId ||
            item.video_id ||
            (typeof item.id === "string" ? item.id : item.id?.videoId) ||
            match?.[1],
          title: item.title || item.name || "Unknown Song",
          author: item.author || item.channel?.name || item.channel || "",
          thumbnail:
            item.thumbnail ||
            item.thumbnails?.high?.url ||
            item.thumbnails?.medium?.url ||
            item.thumbnails?.default?.url ||
            item.thumb ||
            item.image
        };
      });

      let body =
        "🎧✨ SONG SEARCH RESULTS ✨🎧\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        `🔎 Query: ${data.query || args.join(" ")}\n\n`;

      results.forEach((item, index) => {
        const meta = [item.duration, item.author].filter(Boolean).join(" • ");

        body += `🎵 ${index + 1}. ${item.title}\n`;
        if (meta) body += `   ${meta}\n`;
        body += "\n";
      });

      body +=
        "━━━━━━━━━━━━━━━━━━━\n" +
        `📝 Reply with a number (1-${results.length})\n` +
        "⬇️ To download MP3 audio";

      // A single failed thumbnail will not stop the search.
      const thumbs = await Promise.all(
        results.map(async (item) => {
          if (!item.thumbnail) return null;

          try {
            const image = await axios.get(item.thumbnail, {
              responseType: "arraybuffer",
              timeout: 12000,
              maxContentLength: 3 * 1024 * 1024
            });

            const contentType = String(
              image.headers["content-type"] || ""
            ).toLowerCase();

            if (!contentType.startsWith("image/")) return null;

            return Buffer.from(image.data);
          } catch {
            return null;
          }
        })
      );

      const attachments = thumbs.filter(Boolean);

      const message = { body };
      if (attachments.length) message.attachment = attachments;

      api.sendMessage(
        message,
        event.threadID,
        (error, info) => {
          if (error) {
            console.error("[SING] Search message error:", error);
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
    } catch (error) {
      console.error(
        "[SING] SEARCH ERROR:",
        error.response?.status || "",
        error.message
      );

      api.setMessageReaction("❌", event.messageID, () => {}, true);

      api.sendMessage(
        "❌ Song search failed!\nPlease try again later.",
        event.threadID,
        event.messageID
      );
    }
  },

  // ============================================================
  // REPLY HANDLER
  // ============================================================

  onReply: async ({ api, event, Reply }) => {
    if (String(event.senderID) !== String(Reply.author)) return;

    const choice = Number(String(event.body || "").trim());

    if (!Number.isInteger(choice) || choice < 1 || choice > Reply.results.length) {
      api.setMessageReaction("❌", event.messageID, () => {}, true);

      return api.sendMessage(
        `⚠️ Invalid number!\nReply between 1-${Reply.results.length}.`,
        event.threadID,
        event.messageID
      );
    }

    if (Reply.searchMsgID) {
      try {
        api.unsendMessage(Reply.searchMsgID);
      } catch (error) {
        console.error("[SING] Unsend error:", error.message);
      }
    }

    const video = Reply.results[choice - 1];

    const videoId =
      video?.videoId ||
      video?.video_id ||
      (typeof video?.id === "string" ? video.id : video?.id?.videoId);

    if (!videoId) {
      api.setMessageReaction("❌", event.messageID, () => {}, true);

      return api.sendMessage(
        "❌ Video ID not found!",
        event.threadID,
        event.messageID
      );
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    api.setMessageReaction("⏳", event.messageID, () => {}, true);

    let filePath = null;

    const cleanup = () => {
      if (filePath) {
        const target = filePath;
        filePath = null;

        fs.unlink(target, (error) => {
          if (error && error.code !== "ENOENT") {
            console.error("[SING] File cleanup error:", error.message);
          }
        });
      }
    };

    const downloadFile = async (url, safeId, headers) => {
      const response = await axios.get(url, {
        responseType: "stream",
        timeout: 180000,
        maxRedirects: 5,
        headers,
        validateStatus: (status) => status >= 200 && status < 300
      });

      const contentType = String(
        response.headers["content-type"] || ""
      ).toLowerCase();

      if (/text\/html|application\/json|text\/plain/.test(contentType)) {
        response.data.destroy();
        throw new Error(`Invalid audio content-type: ${contentType}`);
      }

      const contentLength = Number(response.headers["content-length"] || 0);

      if (contentLength > MAX_SIZE) {
        response.data.destroy();

        const error = new Error("File exceeds 25 MB");
        error.code = "TOO_BIG";
        throw error;
      }

      filePath = path.join(cacheDir, `${safeId}_${Date.now()}.mp3`);

      try {
        await pipeline(response.data, fs.createWriteStream(filePath));

        const stats = fs.statSync(filePath);

        if (stats.size <= 0) throw new Error("Downloaded file is empty");

        if (stats.size > MAX_SIZE) {
          const error = new Error("File exceeds 25 MB");
          error.code = "TOO_BIG";
          throw error;
        }

        // Detect common JSON/HTML error responses.
        const fd = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(256);
        let bytesRead;

        try {
          bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
        } finally {
          fs.closeSync(fd);
        }

        const head = buffer
          .subarray(0, bytesRead)
          .toString("utf8")
          .trim()
          .toLowerCase();

        if (
          head.startsWith("<!doctype html") ||
          head.startsWith("<html") ||
          head.startsWith("{") ||
          head.startsWith("<")
        ) {
          throw new Error("Server returned an error page instead of audio");
        }

        return stats.size;
      } catch (error) {
        cleanup();
        throw error;
      }
    };

    try {
      const BASE = await getBaseApi("mp3");

      const safeId = String(videoId).replace(/[^a-zA-Z0-9_-]/g, "_");

      let lastError = null;
      let downloadedSize = 0;
      let apiInfo = null;

      // Retry download and refresh the API link when necessary.
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const result = await fetchMp3Link(BASE, youtubeUrl);

          apiInfo = result.info;

          console.log(
            "[SING] Download URL hosts:",
            result.urls
              .map((url) => {
                try {
                  return new URL(url).host;
                } catch {
                  return "unknown";
                }
              })
              .join(", ")
          );

          for (const downloadUrl of result.urls) {
            // Try each header profile (different referers) until one works.
            for (const headers of DL_HEADER_PROFILES) {
              try {
                downloadedSize = await downloadFile(downloadUrl, safeId, headers);
                lastError = null;
                break;
              } catch (error) {
                lastError = error;

                console.error(
                  "[SING] Download attempt failed:",
                  error.response?.status || error.code || "",
                  error.message,
                  "| referer:",
                  headers.referer,
                  getErrorBody(error)
                );

                cleanup();

                if (error.code === "TOO_BIG") throw error;
              }
            }

            if (!lastError && filePath) break;
          }

          if (!lastError && filePath) break;
        } catch (error) {
          lastError = error;

          if (error.code === "TOO_BIG") throw error;

          console.error(`[SING] Attempt ${attempt} failed:`, error.message);
        }

        if (attempt < 4) await sleep(attempt * 3000);
      }

      if (!filePath || lastError) {
        throw lastError || new Error("Audio download failed");
      }

      const title = apiInfo?.title || video.title || "Unknown Song";
      const author = apiInfo?.author || video.author || "";
      const bitrate = apiInfo?.bitrate || "";

      const messageBody =
        "🎶 NOW PLAYING 🎶\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        `🎵 Title: ${title}\n` +
        (author ? `📺 Artist/Channel: ${author}\n` : "") +
        (bitrate ? `🔊 Quality: ${bitrate}\n` : "") +
        `📦 Size: ${(downloadedSize / 1024 / 1024).toFixed(2)} MB\n` +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "💿 MAHABUB-BOT ✨";

      api.sendMessage(
        {
          body: messageBody,
          attachment: fs.createReadStream(filePath)
        },
        event.threadID,
        (error) => {
          if (error) console.error("[SING] Send audio error:", error);
          cleanup();
        },
        event.messageID
      );

      api.setMessageReaction("🎵", event.messageID, () => {}, true);
    } catch (error) {
      console.error(
        "[SING] DOWNLOAD ERROR:",
        error.response?.status || error.code || "",
        error.message,
        getErrorBody(error)
      );

      cleanup();

      // Re-read APIURL.json next time in case the URL changed.
      API_CACHE = null;

      api.setMessageReaction("❌", event.messageID, () => {}, true);

      api.sendMessage(
        error.code === "TOO_BIG"
          ? "❌ Audio file is too large! Maximum size: 25 MB."
          : "❌ Audio download failed!\nPlease try again later.",
        event.threadID,
        event.messageID
      );
    }
  }
};
