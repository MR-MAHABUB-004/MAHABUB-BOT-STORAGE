const axios = require("axios");
const fs = require("fs");
const path = require("path");

const cacheDir = path.join(__dirname, "cache");

if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

let BASE_API = null;

/**
 * Get API Base URL
 */
async function getBaseApi() {
  if (BASE_API) return BASE_API;

  const res = await axios.get(
    "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json",
    {
      timeout: 15000
    }
  );

  if (!res.data?.api) {
    throw new Error("API URL not found");
  }

  BASE_API = String(res.data.api).replace(/\/+$/, "");

  return BASE_API;
}

module.exports = {
  config: {
    name: "sing",
    version: "4.7",
    author: "@𝐌𝐑᭄﹅ 𝐌𝐀𝐇𝐀𝐁𝐔𝐁﹅ メꪜ",
    countDown: 5,
    role: 0,

    longDescription: {
      en: "🎶 Search song → reply number → auto download → auto unsend → auto delete"
    },

    category: "media",

    guide: {
      en:
        "{pn} <song name>\n" +
        "Example: sing toh phir aao"
    }
  },

  // ============================================================
  // SONG SEARCH
  // ============================================================

  onStart: async ({ api, args, event }) => {
    if (!args.length) {
      return api.sendMessage(
        "❌ **Song name dao na!**\n\n" +
        "📌 Example:\n" +
        "➤ `sing toh phir aao`",
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

      const query = encodeURIComponent(
        args.join(" ")
      );

      const searchUrl =
        `${BASE}/mahabub/ytsearch?q=${query}`;

      const response = await axios.get(
        searchUrl,
        {
          timeout: 30000
        }
      );

      const data = response.data;

      // ========================================================
      // CHECK SEARCH RESULT
      // ========================================================

      if (
        !data ||
        !data.status ||
        !Array.isArray(data.results) ||
        data.results.length === 0
      ) {
        api.setMessageReaction(
          "❌",
          event.messageID,
          () => {},
          true
        );

        return api.sendMessage(
          "🚫 **No results found!**\n" +
          "Try another keyword 🎧",
          event.threadID
        );
      }

      // Maximum 10 results
      const results = data.results.slice(0, 10);

      let body =
        "🎧✨ **SONG SEARCH RESULTS** ✨🎧\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        `🔎 **Query:** ${data.query || args.join(" ")}\n\n`;

      const attachments = [];

      // ========================================================
      // CREATE RESULT LIST
      // ========================================================

      for (let i = 0; i < results.length; i++) {
        const item = results[i];

        body +=
          `🎵 **${i + 1}.** ${item.title || "Unknown"}\n`;

        // Thumbnail
        try {
          const thumbnail =
            item?.thumbnails?.high ||
            item?.thumbnails?.medium ||
            item?.thumbnails?.default ||
            item?.thumbnail;

          if (thumbnail) {
            const image = await axios.get(
              thumbnail,
              {
                responseType: "stream",
                timeout: 15000
              }
            );

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

      // ========================================================
      // SEND SEARCH RESULT
      // ========================================================

      api.sendMessage(
        {
          body,
          attachment:
            attachments.length > 0
              ? attachments
              : undefined
        },
        event.threadID,
        (err, info) => {
          if (err) {
            console.error(
              "Search message error:",
              err
            );
            return;
          }

          if (!info?.messageID) return;

          // Save reply information
          global.GoatBot.onReply.set(
            info.messageID,
            {
              commandName: "sing",
              author: event.senderID,
              results,
              searchMsgID: info.messageID
            }
          );
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
      console.error(
        "SONG SEARCH ERROR:",
        err?.response?.data || err
      );

      api.setMessageReaction(
        "❌",
        event.messageID,
        () => {},
        true
      );

      api.sendMessage(
        "❌ **Search failed!**\n" +
        "Try again later.",
        event.threadID
      );
    }
  },

  // ============================================================
  // REPLY HANDLER
  // ============================================================

  onReply: async ({ api, event, Reply }) => {
    // Only original user can select
    if (event.senderID !== Reply.author) {
      return;
    }

    const choice = parseInt(
      String(event.body || "").trim(),
      10
    );

    // ========================================================
    // VALIDATE NUMBER
    // ========================================================

    if (
      Number.isNaN(choice) ||
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
        "⚠️ **Invalid number!**\n" +
        `Reply between 1-${Reply.results.length} 🔢`,
        event.threadID,
        event.messageID
      );
    }

    // ========================================================
    // REMOVE SEARCH RESULT MESSAGE
    // ========================================================

    if (Reply.searchMsgID) {
      try {
        api.unsendMessage(
          Reply.searchMsgID
        );
      } catch (err) {
        console.error(
          "Unsend search message error:",
          err
        );
      }
    }

    // ========================================================
    // SELECT VIDEO
    // ========================================================

    const video =
      Reply.results[choice - 1];

    const videoId =
      video?.videoId ||
      video?.id;

    if (!videoId) {
      api.setMessageReaction(
        "❌",
        event.messageID,
        () => {},
        true
      );

      return api.sendMessage(
        "❌ **Video ID not found!**",
        event.threadID
      );
    }

    // ========================================================
    // YOUTUBE URL
    // ========================================================

    const youtubeUrl =
      `https://www.youtube.com/watch?v=${videoId}`;

    api.setMessageReaction(
      "⏳",
      event.messageID,
      () => {},
      true
    );

    let filePath = null;

    try {
      const BASE = await getBaseApi();

      // ======================================================
      // NEW API
      //
      // /mahabub/ytdl?url=<YT URL>&format=mp3
      // ======================================================

      const apiUrl =
        `${BASE}/mahabub/ytdl` +
        `?url=${encodeURIComponent(youtubeUrl)}` +
        `&format=mp3`;

      console.log(
        "[SING] YTDL Request:",
        apiUrl
      );

      const response = await axios.get(
        apiUrl,
        {
          timeout: 120000
        }
      );

      const data = response.data;

      console.log(
        "[SING] YTDL Response:",
        JSON.stringify(data, null, 2)
      );

      // ======================================================
      // CHECK API RESPONSE
      // ======================================================

      if (
        !data ||
        data.status !== "success" ||
        !data.download
      ) {
        console.error(
          "[SING] Invalid API response:",
          data
        );

        api.setMessageReaction(
          "❌",
          event.messageID,
          () => {},
          true
        );

        return api.sendMessage(
          "❌ **Download failed!**\n" +
          "API did not return a download link.",
          event.threadID
        );
      }

      // ======================================================
      // IMPORTANT:
      //
      // `download` is the REAL AUDIO DOWNLOAD URL.
      //
      // Do NOT use download_url_hint.
      // ======================================================

      const downloadLink =
        data.download;

      // ======================================================
      // FILE NAME
      // ======================================================

      const safeVideoId =
        String(videoId)
          .replace(/[^a-zA-Z0-9_-]/g, "_");

      filePath = path.join(
        cacheDir,
        `${safeVideoId}_${Date.now()}.mp3`
      );

      // ======================================================
      // DOWNLOAD AUDIO
      // ======================================================

      console.log(
        "[SING] Downloading:",
        downloadLink
      );

      const audioResponse =
        await axios.get(
          downloadLink,
          {
            responseType: "stream",
            timeout: 180000,
            maxRedirects: 5
          }
        );

      const writer =
        fs.createWriteStream(filePath);

      audioResponse.data.pipe(writer);

      // ======================================================
      // DOWNLOAD FINISHED
      // ======================================================

      writer.on(
        "finish",
        () => {
          try {
            if (
              !filePath ||
              !fs.existsSync(filePath)
            ) {
              throw new Error(
                "Downloaded file not found"
              );
            }

            const stats =
              fs.statSync(filePath);

            if (stats.size <= 0) {
              throw new Error(
                "Downloaded file is empty"
              );
            }

            // =================================================
            // METADATA
            // =================================================

            const title =
              data?.metadata?.title ||
              video?.title ||
              "Unknown Song";

            const filesize =
              stats.size;

            // =================================================
            // SEND AUDIO
            // =================================================

            api.sendMessage(
              {
                body:
                  "🎶 **NOW PLAYING** 🎶\n" +
                  "━━━━━━━━━━━━━━━━━━━\n" +
                  `🎵 **Title:** ${title}\n` +
                  `📦 **Size:** ${(filesize / 1024 / 1024).toFixed(2)} MB\n` +
                  "━━━━━━━━━━━━━━━━━━━\n" +
                  "💿 **MAHABUB-BOT** ✨",

                attachment:
                  fs.createReadStream(
                    filePath
                  )
              },
              event.threadID,
              (err) => {
                if (err) {
                  console.error(
                    "[SING] Send audio error:",
                    err
                  );
                }

                // =========================================
                // AUTO DELETE MP3
                // =========================================

                if (
                  filePath &&
                  fs.existsSync(filePath)
                ) {
                  fs.unlink(
                    filePath,
                    (unlinkErr) => {
                      if (unlinkErr) {
                        console.error(
                          "[SING] File delete error:",
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
              "[SING] Audio processing error:",
              err
            );

            // Delete broken file
            if (
              filePath &&
              fs.existsSync(filePath)
            ) {
              fs.unlink(
                filePath,
                () => {}
              );
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
        }
      );

      // ======================================================
      // FILE WRITE ERROR
      // ======================================================

      writer.on(
        "error",
        (err) => {
          console.error(
            "[SING] File write error:",
            err
          );

          if (
            filePath &&
            fs.existsSync(filePath)
          ) {
            fs.unlink(
              filePath,
              () => {}
            );
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
        }
      );

    } catch (err) {
      console.error(
        "[SING] DOWNLOAD ERROR:",
        err?.response?.data || err
      );

      // Cleanup
      if (
        filePath &&
        fs.existsSync(filePath)
      ) {
        try {
          fs.unlink(
            filePath,
            () => {}
          );
        } catch {}
      }

      api.setMessageReaction(
        "❌",
        event.messageID,
        () => {},
        true
      );

      api.sendMessage(
        "❌ **Audio download error!**\n" +
        "Please try again later.",
        event.threadID
      );
    }
  }
};
