const axios = require("axios");
const fs = require("fs");
const path = require("path");

const cacheDir = path.join(__dirname, "cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

let BASE_API = null;

async function getBaseApi() {
  if (BASE_API) return BASE_API;

  const res = await axios.get(
    "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json"
  );

  BASE_API = res.data.api;
  return BASE_API;
}

module.exports = {
  config: {
    name: "sing",
    version: "4.6",
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

  // =========================
  // SEARCH SONG
  // =========================
  onStart: async ({ api, args, event }) => {
    if (!args.length) {
      return api.sendMessage(
        "❌ **Song name dao na!**\n\n📌 Example:\n➤ `sing toh phir aao`",
        event.threadID,
        event.messageID
      );
    }

    api.setMessageReaction(
      "⏳",
      event.messageID,
      () => {},
      true
    );

    try {
      const BASE = await getBaseApi();

      const query = encodeURIComponent(args.join(" "));

      const searchUrl =
        `${BASE}/mahabub/ytsearch?q=${query}`;

      const { data } = await axios.get(searchUrl);

      if (!data?.status || !data.results?.length) {
        api.setMessageReaction(
          "❌",
          event.messageID,
          () => {},
          true
        );

        return api.sendMessage(
          "🚫 **No results found!**\nTry another keyword 🎧",
          event.threadID
        );
      }

      const results = data.results.slice(0, 10);

      let body =
        `🎧✨ **SONG SEARCH RESULTS** ✨🎧\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `🔎 **Query:** ${data.query || args.join(" ")}\n\n`;

      const attachments = [];

      // =========================
      // THUMBNAILS
      // =========================
      for (let i = 0; i < results.length; i++) {
        body += `🎵 **${i + 1}.** ${results[i].title}\n`;

        try {
          const thumbnail =
            results[i]?.thumbnails?.high ||
            results[i]?.thumbnails?.medium ||
            results[i]?.thumbnails?.default ||
            results[i]?.thumbnail;

          if (thumbnail) {
            const img = await axios.get(thumbnail, {
              responseType: "stream"
            });

            attachments.push(img.data);
          }
        } catch (e) {
          // Thumbnail unavailable — continue
        }
      }

      body +=
        `\n━━━━━━━━━━━━━━━━━━━\n` +
        `📝 **Reply with a number (1-${results.length})**\n` +
        `⬇️ To download audio 🎶`;

      api.sendMessage(
        {
          body,
          attachment: attachments
        },
        event.threadID,
        (err, info) => {
          if (err || !info) {
            console.error("Search message error:", err);
            return;
          }

          global.GoatBot.onReply.set(info.messageID, {
            commandName: "sing",
            author: event.senderID,
            results,
            searchMsgID: info.messageID
          });
        },
        event.messageID
      );

      api.setMessageReaction(
        "🎶",
        event.messageID,
        () => {},
        true
      );

    } catch (err) {
      console.error("YT Search Error:", err);

      api.setMessageReaction(
        "❌",
        event.messageID,
        () => {},
        true
      );

      api.sendMessage(
        "❌ **Search failed!**\nTry again later.",
        event.threadID
      );
    }
  },

  // =========================
  // REPLY / DOWNLOAD
  // =========================
  onReply: async ({ api, event, Reply }) => {
    if (event.senderID !== Reply.author) return;

    const choice = parseInt(
      String(event.body || "").trim()
    );

    // =========================
    // INVALID NUMBER
    // =========================
    if (
      isNaN(choice) ||
      choice < 1 ||
      choice > Reply.results.length
    ) {
      api.setMessageReaction(
        "❌",
        event.messageID,
        () => {},
        true
      );

      return api.sendMessage(
        "⚠️ **Invalid number!**\nReply between the given range 🔢",
        event.threadID,
        event.messageID
      );
    }

    // =========================
    // REMOVE SEARCH MESSAGE
    // =========================
    if (Reply.searchMsgID) {
      try {
        api.unsendMessage(Reply.searchMsgID);
      } catch (e) {
        console.error("Unsend error:", e);
      }
    }

    const video = Reply.results[choice - 1];

    const videoId =
      video.videoId ||
      video.id;

    if (!videoId) {
      return api.sendMessage(
        "❌ **Video ID not found!**",
        event.threadID
      );
    }

    // Create YouTube URL
    const youtubeUrl =
      `https://www.youtube.com/watch?v=${videoId}`;

    api.setMessageReaction(
      "⏳",
      event.messageID,
      () => {},
      true
    );

    try {
      const BASE = await getBaseApi();

      // =========================
      // NEW API
      // GET /mahabub/ytdl
      // =========================
      const apiUrl =
        `${BASE}/mahabub/ytdl?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;

      console.log("YTDL API:", apiUrl);

      const { data } = await axios.get(apiUrl, {
        timeout: 120000
      });

      console.log("YTDL Response:", data);

      // =========================
      // FIND DOWNLOAD LINK
      // =========================
      const downloadLink =
        data?.download ||
        data?.download_url ||
        data?.url ||
        data?.link ||
        data?.data?.download ||
        data?.data?.download_url ||
        data?.data?.url ||
        data?.data?.link;

      if (!downloadLink) {
        console.error(
          "No download link found:",
          JSON.stringify(data, null, 2)
        );

        api.setMessageReaction(
          "❌",
          event.messageID,
          () => {},
          true
        );

        return api.sendMessage(
          "❌ **Download failed!**\nAPI did not return an audio link.",
          event.threadID
        );
      }

      // =========================
      // FILE NAME
      // =========================
      const safeName = String(
        video.title || videoId
      )
        .replace(/[<>:"/\\|?*]/g, "")
        .substring(0, 80);

      const filePath = path.join(
        cacheDir,
        `${videoId}_${Date.now()}.mp3`
      );

      // =========================
      // DOWNLOAD AUDIO
      // =========================
      const audioStream = await axios.get(
        downloadLink,
        {
          responseType: "stream",
          timeout: 180000,
          maxRedirects: 5
        }
      );

      const writer =
        fs.createWriteStream(filePath);

      audioStream.data.pipe(writer);

      writer.on("finish", async () => {
        try {
          if (!fs.existsSync(filePath)) {
            throw new Error(
              "Downloaded file does not exist"
            );
          }

          const stats =
            fs.statSync(filePath);

          if (stats.size === 0) {
            throw new Error(
              "Downloaded audio file is empty"
            );
          }

          const filesize =
            data?.filesize ||
            data?.data?.filesize ||
            stats.size;

          const title =
            data?.title ||
            data?.data?.title ||
            video.title ||
            "Unknown Song";

          const duration =
            data?.duration ||
            data?.data?.duration ||
            video.duration ||
            0;

          // =========================
          // SEND AUDIO
          // =========================
          api.sendMessage(
            {
              body:
                `🎶 **NOW PLAYING** 🎶\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `🎵 **Title:** ${title}\n` +
                `⏱ **Duration:** ${duration} sec\n` +
                `📦 **Size:** ${(filesize / 1024 / 1024).toFixed(2)} MB\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `💿 **MAHABUB-BOT** ✨`,
              attachment:
                fs.createReadStream(filePath)
            },
            event.threadID,
            (err) => {
              if (err) {
                console.error(
                  "Send audio error:",
                  err
                );
              }

              // =========================
              // AUTO DELETE FILE
              // =========================
              if (fs.existsSync(filePath)) {
                fs.unlink(
                  filePath,
                  (unlinkErr) => {
                    if (unlinkErr) {
                      console.error(
                        "File delete error:",
                        unlinkErr
                      );
                    }
                  }
                );
              }
            },
            event.messageID
          );

          api.setMessageReaction(
            "🎵",
            event.messageID,
            () => {},
            true
          );

        } catch (err) {
          console.error(
            "Audio processing error:",
            err
          );

          if (fs.existsSync(filePath)) {
            fs.unlink(filePath, () => {});
          }

          api.setMessageReaction(
            "❌",
            event.messageID,
            () => {},
            true
          );

          api.sendMessage(
            "❌ **Audio processing failed!**",
            event.threadID
          );
        }
      });

      writer.on("error", (err) => {
        console.error(
          "File write error:",
          err
        );

        if (fs.existsSync(filePath)) {
          fs.unlink(filePath, () => {});
        }

        api.setMessageReaction(
          "❌",
          event.messageID,
          () => {},
          true
        );

        api.sendMessage(
          "❌ **Audio download error!**",
          event.threadID
        );
      });

    } catch (err) {
      console.error(
        "YTDL Download Error:",
        err?.response?.data || err
      );

      api.setMessageReaction(
        "❌",
        event.messageID,
        () => {},
        true
      );

      api.sendMessage(
        "❌ **Audio download error!**\nPlease try again later.",
        event.threadID
      );
    }
  }
};
