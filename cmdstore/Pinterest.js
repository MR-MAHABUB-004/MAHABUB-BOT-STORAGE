"use strict";

const axios = require("axios");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");

const API_JSON =
  "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json";

let BASE_API = null;

async function getBaseApi() {
  if (BASE_API) return BASE_API;

  const response = await axios.get(API_JSON, {
    timeout: 15000
  });

  if (!response.data?.api) {
    throw new Error("API URL not found in APIURL.json");
  }

  BASE_API = String(response.data.api).replace(/\/+$/, "");

  return BASE_API;
}

module.exports = {
  config: {
    name: "pinterest",
    aliases: ["pin"],
    version: "1.1.0",
    author: "MAHABUB",
    role: 0,
    countDown: 20,
    longDescription: {
      en: "Search Pinterest images and send them as attachments."
    },
    category: "media",
    guide: {
      en:
        "{pn} <search query>\n" +
        "{pn} <search query> - <count>\n\n" +
        "Example: {pn} itachi\n" +
        "Example: {pn} itachi-10\n" +
        "Example: {pn} itachi - 15"
    }
  },

  onStart: async function ({ api, event, args }) {
    let cacheDir;

    try {
      // 1. Read input.
      const input = args.join(" ").trim();

      if (!input) {
        return api.sendMessage(
          "📌 Pinterest Image Search\n\n" +
          "Usage:\n" +
          "pin itachi\n" +
          "pin itachi-10\n" +
          "pin itachi - 15\n\n" +
          "Default: 10 images\n" +
          "Maximum: 50 images",
          event.threadID,
          event.messageID
        );
      }

      // 2. Parse query and count.
      let searchQuery = input;
      let count = 10;

      const match = input.match(/^(.*?)\s*-\s*(\d+)\s*$/);

      if (match) {
        searchQuery = match[1].trim();
        count = parseInt(match[2], 10);
      }

      if (!searchQuery) {
        return api.sendMessage(
          "❌ Please provide a search query.",
          event.threadID,
          event.messageID
        );
      }

      if (!Number.isFinite(count) || count < 1) {
        count = 10;
      }

      count = Math.min(count, 50);

      // 3. Get Base API.
      const baseApi = await getBaseApi();
      const endpoint = `${baseApi}/mahabub/pin`;

      console.log("[PINTEREST] API:", endpoint);
      console.log("[PINTEREST] Search:", searchQuery);
      console.log("[PINTEREST] Count:", count);

      // 4. Request images.
      const response = await axios.get(endpoint, {
        params: {
          search: searchQuery,
          limit: count
        },
        timeout: 30000,
        headers: {
          Accept: "application/json"
        }
      });

      const body = response.data;

      console.log("[PINTEREST] HTTP:", response.status);
      console.log("[PINTEREST] Status:", body?.status);
      console.log("[PINTEREST] Total:", body?.total);

      if (body?.status !== "success") {
        throw new Error(
          body?.message || "Pinterest API request failed"
        );
      }

      // 5. Parse API response.
      // Expected:
      // {
      //   status: "success",
      //   results: [{ image_url: "https://..." }]
      // }

      const results = Array.isArray(body.results)
        ? body.results
        : [];

      const images = results
        .map(item => {
          if (typeof item === "string") return item;
          return item?.image_url;
        })
        .filter(url =>
          typeof url === "string" &&
          /^https?:\/\//i.test(url)
        )
        .slice(0, count);

      console.log("[PINTEREST] Valid images:", images.length);

      if (images.length === 0) {
        console.error(
          "[PINTEREST] Invalid response:",
          JSON.stringify(body).slice(0, 2000)
        );

        throw new Error(
          "API returned no valid image URLs. Check PM2 logs."
        );
      }

      // 6. Create unique temporary directory.
      cacheDir = path.join(
        os.tmpdir(),
        "mahabub-bot-pinterest",
        crypto.randomUUID()
      );

      await fs.promises.mkdir(cacheDir, {
        recursive: true
      });

      const downloadedFiles = [];
      let failed = 0;

      // 7. Download images.
      for (let i = 0; i < images.length; i++) {
        const imageUrl = images[i];

        const imagePath = path.join(
          cacheDir,
          `image_${i + 1}.jpg`
        );

        try {
          console.log(
            `[PINTEREST] Downloading ${i + 1}/${images.length}`
          );

          const imageResponse = await axios.get(imageUrl, {
            responseType: "stream",
            timeout: 25000,
            maxRedirects: 5,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/131.0.0.0 Safari/537.36",
              Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
            },
            validateStatus: status =>
              status >= 200 && status < 300
          });

          const contentType =
            imageResponse.headers["content-type"] || "";

          if (
            contentType &&
            !contentType.toLowerCase().startsWith("image/")
          ) {
            imageResponse.data.destroy();

            throw new Error(
              `Invalid content type: ${contentType}`
            );
          }

          await pipeline(
            imageResponse.data,
            fs.createWriteStream(imagePath)
          );

          const stat = await fs.promises.stat(imagePath);

          if (stat.size === 0) {
            throw new Error("Downloaded image is empty");
          }

          downloadedFiles.push(imagePath);

          console.log(
            `[PINTEREST] Downloaded ${i + 1}: ${stat.size} bytes`
          );

        } catch (error) {
          failed++;

          console.error(
            `[PINTEREST] Image ${i + 1} failed:`,
            error.message
          );

          await fs.promises.rm(imagePath, {
            force: true
          }).catch(() => {});
        }
      }

      if (downloadedFiles.length === 0) {
        throw new Error(
          "All image downloads failed. Check PM2 logs."
        );
      }

      // 8. Send attachments.
      const attachments = downloadedFiles.map(file =>
        fs.createReadStream(file)
      );

      const messageBody =
        `📌 Pinterest Search Results\n\n` +
        `🔎 Search: ${searchQuery}\n` +
        `🖼️ Images: ${downloadedFiles.length}/${images.length}\n` +
        `👑 Developer: MAHABUB\n` +
        `💠 Credit: ${body.credit || "NIROB TOP"}` +
        (failed > 0
          ? `\n⚠️ Failed downloads: ${failed}`
          : "");

      console.log(
        `[PINTEREST] Sending ${attachments.length} attachments`
      );

      await api.sendMessage(
        {
          body: messageBody,
          attachment: attachments
        },
        event.threadID,
        event.messageID
      );

      console.log(
        `[PINTEREST] SUCCESS: ${searchQuery} | ` +
        `${downloadedFiles.length}/${images.length}`
      );

    } catch (error) {
      console.error("[PINTEREST ERROR]", error.stack || error);

      let errorMessage = error.message || "Unknown error";

      if (error.response) {
        const data = error.response.data;

        errorMessage =
          `HTTP ${error.response.status}: ` +
          (
            typeof data === "string"
              ? data.slice(0, 200)
              : JSON.stringify(data).slice(0, 200)
          );
      } else if (
        error.code === "ECONNABORTED" ||
        error.code === "ETIMEDOUT"
      ) {
        errorMessage = "Request timed out. Please try again.";
      }

      await api.sendMessage(
        `❌ Pinterest Error\n\n${errorMessage}`,
        event.threadID,
        event.messageID
      ).catch(sendError => {
        console.error(
          "[PINTEREST] Error message failed:",
          sendError.message
        );
      });

    } finally {
      // 9. Clean temporary files.
      if (cacheDir) {
        await fs.promises.rm(cacheDir, {
          recursive: true,
          force: true
        }).catch(error => {
          console.error(
            "[PINTEREST] Cleanup error:",
            error.message
          );
        });
      }
    }
  }
};
