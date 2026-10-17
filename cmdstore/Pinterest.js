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
    throw new Error("API URL not found");
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
      en: "Search and download images from Pinterest."
    },
    category: "media",
    guide: {
      en: "{pn} <search query> [count]\nExample: {pn} Itachi\nExample: {pn} Itachi - 15"
    }
  },

  onStart: async function ({ api, event, args }) {
    let cacheDir;

    try {
      // Parse query and optional image count.
      const input = args.join(" ").trim();

      if (!input) {
        return api.sendMessage(
          "❌ Please provide a search query.\n\n" +
          "Examples:\n" +
          "pin Itachi\n" +
          "pin Itachi - 15",
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
          "❌ Please provide a valid search query.",
          event.threadID,
          event.messageID
        );
      }

      if (!Number.isInteger(count) || count < 1) {
        count = 10;
      }

      count = Math.min(count, 50);

      const BASE_API_URL = await getBaseApi();

      const apiUrl = `${BASE_API_URL}/mahabub/pin`;

      const response = await axios.get(apiUrl, {
        params: {
          search: searchQuery,
          limit: count
        },
        timeout: 30000
      });

      const body = response.data;

      if (
        body?.status !== "success" ||
        !Array.isArray(body.results)
      ) {
        throw new Error(
          body?.message || "Invalid Pinterest API response"
        );
      }

      const results = body.results
        .filter(item =>
          typeof item?.image_url === "string" &&
          /^https?:\/\//i.test(item.image_url)
        )
        .slice(0, count);

      if (results.length === 0) {
        return api.sendMessage(
          `❌ No images found for "${searchQuery}".`,
          event.threadID,
          event.messageID
        );
      }

      // Unique directory prevents conflicts between simultaneous commands.
      cacheDir = path.join(
        os.tmpdir(),
        "mahabub-bot-pinterest",
        crypto.randomUUID()
      );

      await fs.promises.mkdir(cacheDir, {
        recursive: true
      });

      const attachments = [];
      const failed = [];

      for (let i = 0; i < results.length; i++) {
        const imageUrl = results[i].image_url;
        const imagePath = path.join(
          cacheDir,
          `image_${i + 1}.jpg`
        );

        try {
          const imageResponse = await axios.get(imageUrl, {
            responseType: "stream",
            timeout: 20000,
            maxRedirects: 5,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/131.0.0.0 Safari/537.36"
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
            throw new Error("URL did not return an image");
          }

          await pipeline(
            imageResponse.data,
            fs.createWriteStream(imagePath)
          );

          const stat = await fs.promises.stat(imagePath);

          if (stat.size === 0) {
            throw new Error("Downloaded image is empty");
          }

          attachments.push(
            fs.createReadStream(imagePath)
          );
        } catch (err) {
          console.error(
            `[PINTEREST] Image ${i + 1} failed:`,
            err.message
          );

          failed.push(i + 1);

          await fs.promises.rm(imagePath, {
            force: true
          }).catch(() => {});
        }
      }

      if (attachments.length === 0) {
        throw new Error(
          "Could not download any images. Please try again."
        );
      }

      const messageBody =
        `📌 Pinterest Search\n` +
        `🔎 Query: ${searchQuery}\n` +
        `🖼️ Images: ${attachments.length}/${results.length}\n` +
        `👑 Developer: MAHABUB\n` +
        `💠 Credit: ${body.credit || "NIROB TOP"}`;

      await api.sendMessage(
        {
          body: messageBody,
          attachment: attachments
        },
        event.threadID,
        event.messageID
      );

      console.log(
        `[PINTEREST] "${searchQuery}" | ` +
        `Downloaded: ${attachments.length}/${results.length}`
      );

    } catch (error) {
      console.error("[PINTEREST ERROR]", error);

      let errorMessage = error.message;

      if (error.response) {
        errorMessage =
          `API returned HTTP ${error.response.status}`;
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
      ).catch(() => {});

    } finally {
      // Remove temporary files after sending or failure.
      if (cacheDir) {
        await fs.promises.rm(cacheDir, {
          recursive: true,
          force: true
        }).catch(err => {
          console.error(
            "[PINTEREST] Cache cleanup failed:",
            err.message
          );
        });
      }
    }
  }
};
