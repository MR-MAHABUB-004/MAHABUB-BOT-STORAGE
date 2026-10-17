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

  const res = await axios.get(API_JSON, {
    timeout: 15000
  });

  if (!res.data?.api) {
    throw new Error("API URL not found in APIURL.json");
  }

  BASE_API = String(res.data.api).replace(/\/+$/, "");

  return BASE_API;
}

module.exports = {
  config: {
    name: "pinterest",
    aliases: ["pin"],
    version: "1.0.0",
    author: "MAHABUB",
    role: 0,
    countDown: 20,
    longDescription: {
      en: "Search Pinterest images and send them as attachments."
    },
    category: "media",
    guide: {
      en: "{pn} <search query> [count]\nExample: {pn} Itachi\nExample: {pn} Itachi - 15"
    }
  },

  onStart: async function ({ api, event, args }) {
    let cacheDir;

    try {
      // Parse search query and image count.
      const input = args.join(" ").trim();

      if (!input) {
        return api.sendMessage(
          "📌 Pinterest Image Search\n\n" +
          "Usage:\n" +
          "pin Itachi\n" +
          "pin Itachi - 15\n\n" +
          "Default: 10 images\n" +
          "Maximum: 50 images",
          event.threadID,
          event.messageID
        );
      }

      let searchQuery = input;
      let count = 10;

      // Supports: pin Itachi - 15
      const match = input.match(/^(.*?)\s+-\s*(\d+)\s*$/);

      if (match) {
        searchQuery = match[1].trim();
        count = parseInt(match[2], 10);
      }

      if (!searchQuery) {
        return api.sendMessage(
          "❌ Please enter a valid search query.",
          event.threadID,
          event.messageID
        );
      }

      if (!Number.isFinite(count) || count < 1) {
        count = 10;
      }

      count = Math.min(count, 50);

      // Get API base URL.
      const BASE_API_URL = await getBaseApi();
      const endpoint = `${BASE_API_URL}/mahabub/pin`;

      // Request Pinterest images.
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

      console.log("[PINTEREST API]", {
        status: body?.status,
        total: body?.total,
        results: Array.isArray(body?.results)
          ? body.results.length
          : "invalid"
      });

      if (body?.status !== "success") {
        throw new Error(
          body?.message || "Pinterest API request failed"
        );
      }

      // Correct API response:
      // { status: "success", results: [{ image_url: "..." }] }
      const results = Array.isArray(body.results)
        ? body.results
        : [];

      const images = results
        .map(item => item?.image_url)
        .filter(url =>
          typeof url === "string" &&
          /^https?:\/\//i.test(url)
        )
        .slice(0, count);

      if (images.length === 0) {
        throw new Error(
          "API returned no valid image URLs. Check API response."
        );
      }

      // Create a unique temporary directory per request.
      cacheDir = path.join(
        os.tmpdir(),
        "mahabub-bot-pinterest",
        crypto.randomUUID()
      );

      await fs.promises.mkdir(cacheDir, {
        recursive: true
      });

      const attachments = [];
      let failed = 0;

      // Download images sequentially for stability.
      for (let i = 0; i < images.length; i++) {
        const imageUrl = images[i];

        const imagePath = path.join(
          cacheDir,
          `image_${i + 1}.jpg`
        );

        try {
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
            throw new Error("Downloaded file is empty");
          }

          attachments.push(
            fs.createReadStream(imagePath)
          );

        } catch (err) {
          failed++;

          console.error(
            `[PINTEREST] Image ${i + 1} failed:`,
            err.message
          );

          await fs.promises.rm(imagePath, {
            force: true
          }).catch(() => {});
        }
      }

      if (attachments.length === 0) {
        throw new Error(
          "All image downloads failed. Please try again."
        );
      }

      const messageBody =
        `📌 Pinterest Search Results\n\n` +
        `🔎 Search: ${searchQuery}\n` +
        `🖼️ Images: ${attachments.length}/${images.length}\n` +
        `👑 Developer: MAHABUB\n` +
        `💠 Credit: ${body.credit || "NIROB TOP"}` +
        (failed > 0
          ? `\n⚠️ Failed downloads: ${failed}`
          : "");

      // Send attachments.
      await api.sendMessage(
        {
          body: messageBody,
          attachment: attachments
        },
        event.threadID,
        event.messageID
      );

      console.log(
        `[PINTEREST] Success: ${searchQuery} | ` +
        `${attachments.length}/${images.length} images`
      );

    } catch (error) {
      console.error("[PINTEREST ERROR]", error);

      let message = error.message || "Unknown error";

      if (error.response) {
        message =
          `HTTP ${error.response.status}: ` +
          (typeof error.response.data === "string"
            ? error.response.data.slice(0, 200)
            : "API request failed");
      } else if (
        error.code === "ECONNABORTED" ||
        error.code === "ETIMEDOUT"
      ) {
        message = "Request timed out. Please try again.";
      }

      await api.sendMessage(
        `❌ Pinterest Error\n\n${message}`,
        event.threadID,
        event.messageID
      ).catch(() => {});

    } finally {
      // Clean up temporary files after sending.
      if (cacheDir) {
        await fs.promises.rm(cacheDir, {
          recursive: true,
          force: true
        }).catch(err => {
          console.error(
            "[PINTEREST] Cleanup failed:",
            err.message
          );
        });
      }
    }
  }
};
