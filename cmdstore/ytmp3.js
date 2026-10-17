const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { pipeline } = require("stream/promises");

const API_CONFIG_URL =
  "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json";

const TMP_DIR = path.join(os.tmpdir(), "mahabub-bot-ytmp3");

module.exports = {
  config: {
    name: "ytmp3",
    aliases: ["ytaudio", "mp3"],
    version: "2.0.0",
    author: "MAHABUB",
    countDown: 10,
    role: 0,
    description: {
      en: "Download YouTube audio as MP3"
    },
    category: "media",
    guide: {
      en: "{pn} <YouTube URL>"
    }
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;

    let filePath = null;
    let statusMessageID = null;

    const sendStatus = (message) =>
      new Promise((resolve) => {
        api.sendMessage(message, threadID, (err, info) => {
          if (!err && info) statusMessageID = info.messageID;
          resolve(info);
        });
      });

    const removeFile = () => {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error("[YTMP3] File cleanup error:", err.message);
        }
      }
    };

    const removeStatus = () => {
      if (statusMessageID) {
        api.unsendMessage(statusMessageID, () => {});
      }
    };

    try {
      const youtubeUrl = args.join(" ").trim();

      if (!youtubeUrl) {
        return api.sendMessage(
          "❌ Please provide a YouTube URL.\n\nExample:\nytmp3 https://www.youtube.com/watch?v=VIDEO_ID",
          threadID,
          messageID
        );
      }

      let parsedUrl;

      try {
        parsedUrl = new URL(youtubeUrl);
      } catch {
        return api.sendMessage(
          "❌ Invalid URL. Please provide a valid YouTube link.",
          threadID,
          messageID
        );
      }

      const hostname = parsedUrl.hostname.toLowerCase();

      const validHosts = [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be",
        "www.youtu.be"
      ];

      if (!validHosts.includes(hostname)) {
        return api.sendMessage(
          "❌ Only YouTube URLs are supported.",
          threadID,
          messageID
        );
      }

      await sendStatus("⏳ Downloading YouTube audio...\nPlease wait.");

      // 1. Read API configuration
      console.log("[YTMP3] Reading API configuration...");

      const configResponse = await axios.get(API_CONFIG_URL, {
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 MAHABUB-BOT"
        }
      });

      const BASE_URL = configResponse.data?.api;

      if (
        typeof BASE_URL !== "string" ||
        !BASE_URL.trim()
      ) {
        throw new Error("APIURL.json does not contain a valid 'api' URL.");
      }

      const baseURL = BASE_URL.trim().replace(/\/+$/, "");

      console.log("[YTMP3] API base:", baseURL);

      // 2. Request MP3 conversion
      console.log("[YTMP3] Requesting audio conversion...");

      const apiResponse = await axios.get(
        `${baseURL}/mahabub/ytmp3v3`,
        {
          params: {
            url: youtubeUrl
          },
          timeout: 60000,
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 MAHABUB-BOT"
          }
        }
      );

      const data = apiResponse.data;

      if (!data || typeof data !== "object") {
        throw new Error("The API returned an invalid response.");
      }

      if (data.status !== "success") {
        console.error("[YTMP3] API returned an error:", data);

        throw new Error(
          data.message ||
          data.error ||
          "The YouTube audio API failed."
        );
      }

      const downloadURL = data.download_url;

      if (
        typeof downloadURL !== "string" ||
        !/^https?:\/\//i.test(downloadURL)
      ) {
        console.error("[YTMP3] Missing download_url:", data);

        throw new Error(
          "The API did not return a valid download_url."
        );
      }

      const title = String(data.title || "YouTube Audio")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .trim()
        .slice(0, 100) || "YouTube Audio";

      const videoId = String(data.videoId || Date.now())
        .replace(/[^a-zA-Z0-9_-]/g, "");

      console.log("[YTMP3] Title:", title);
      console.log("[YTMP3] Video ID:", videoId);
      console.log("[YTMP3] Download URL received.");

      // 3. Prepare temporary directory
      fs.mkdirSync(TMP_DIR, { recursive: true });

      filePath = path.join(
        TMP_DIR,
        `${videoId}_${Date.now()}.mp3`
      );

      // 4. Download audio
      console.log("[YTMP3] Downloading MP3 file...");

      const downloadResponse = await axios.get(downloadURL, {
        responseType: "stream",
        timeout: 120000,
        maxRedirects: 5,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
          Accept: "audio/mpeg, audio/*;q=0.9, */*;q=0.8"
        },
        validateStatus: (status) => status >= 200 && status < 300
      });

      const contentType = String(
        downloadResponse.headers["content-type"] || ""
      ).toLowerCase();

      const contentLength = Number(
        downloadResponse.headers["content-length"] || 0
      );

      console.log("[YTMP3] Download HTTP status:", downloadResponse.status);
      console.log("[YTMP3] Content-Type:", contentType);
      console.log("[YTMP3] Content-Length:", contentLength || "unknown");

      if (
        contentType.includes("text/html") ||
        contentType.includes("application/json")
      ) {
        downloadResponse.data.destroy();

        throw new Error(
          `The download server returned ${contentType}, not an audio file. The link may have expired or been blocked.`
        );
      }

      // Messenger attachment limits can vary by platform.
      // Stop early when the server declares a clearly excessive file size.
      const MAX_SIZE = 25 * 1024 * 1024;

      if (contentLength > MAX_SIZE) {
        downloadResponse.data.destroy();

        throw new Error(
          `Audio file is too large (${(contentLength / 1024 / 1024).toFixed(2)} MB).`
        );
      }

      let downloadedBytes = 0;

      downloadResponse.data.on("data", (chunk) => {
        downloadedBytes += chunk.length;

        if (downloadedBytes > MAX_SIZE) {
          downloadResponse.data.destroy(
            new Error("Audio file exceeds the 25 MB size limit.")
          );
        }
      });

      await pipeline(
        downloadResponse.data,
        fs.createWriteStream(filePath)
      );

      if (!fs.existsSync(filePath)) {
        throw new Error("The downloaded audio file was not created.");
      }

      const actualSize = fs.statSync(filePath).size;

      console.log(
        "[YTMP3] Download completed:",
        `${(actualSize / 1024 / 1024).toFixed(2)} MB`
      );

      if (actualSize < 1000) {
        throw new Error(
          "The downloaded file is too small and may not contain audio."
        );
      }

      if (actualSize > MAX_SIZE) {
        throw new Error("Audio file exceeds the 25 MB size limit.");
      }

      // 5. Send MP3 attachment
      console.log("[YTMP3] Sending audio attachment...");

      await new Promise((resolve, reject) => {
        api.sendMessage(
          {
            body:
              `🎵 𝗬𝗢𝗨𝗧𝗨𝗕𝗘 𝗔𝗨𝗗𝗜𝗢\n\n` +
              `📌 Title: ${title}\n` +
              `🎧 Quality: ${data.bitrate || "MP3"}\n` +
              `⏱️ Duration: ${
                Number.isFinite(Number(data.duration))
                  ? `${Math.floor(Number(data.duration) / 60)}:${String(
                      Math.floor(Number(data.duration) % 60)
                    ).padStart(2, "0")}`
                  : "Unknown"
              }\n` +
              `📦 Size: ${(actualSize / 1024 / 1024).toFixed(2)} MB\n` +
              `\nᴘᴏᴡᴇʀᴇᴅ ʙʏ MAHABUB-BOT`,
            attachment: fs.createReadStream(filePath)
          },
          threadID,
          (err) => {
            if (err) {
              return reject(err);
            }

            resolve();
          },
          messageID
        );
      });

      console.log("[YTMP3] Audio sent successfully.");

      removeStatus();
      removeFile();
    } catch (error) {
      console.error("[YTMP3] ERROR DETAILS:", {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        contentType: error.response?.headers?.["content-type"],
        response:
          typeof error.response?.data === "string"
            ? error.response.data.slice(0, 500)
            : undefined
      });

      removeFile();
      removeStatus();

      let reason = error.message || "Unknown error";

      if (
        error.code === "ECONNABORTED" ||
        error.code === "ETIMEDOUT"
      ) {
        reason = "Request timed out. Please try again.";
      } else if (error.response?.status === 403) {
        reason =
          "The download server denied access (403). The API download link may be restricted or expired.";
      } else if (error.response?.status === 404) {
        reason =
          "The API endpoint or download file was not found (404).";
      } else if (error.response?.status === 429) {
        reason =
          "Too many requests. Please wait a little and try again.";
      } else if (
        error.code === "ENOTFOUND" ||
        error.code === "EAI_AGAIN"
      ) {
        reason =
          "Could not connect to the server. Check the API domain or internet connection.";
      } else if (
        error.message?.includes("25 MB")
      ) {
        reason = error.message;
      }

      api.sendMessage(
        `❌ 𝗬𝗧𝗠𝗣𝟯 𝗙𝗔𝗜𝗟𝗘𝗗\n\n` +
          `Reason: ${reason}\n\n` +
          `Please try again later.`,
        threadID,
        messageID
      );
    }
  }
};
