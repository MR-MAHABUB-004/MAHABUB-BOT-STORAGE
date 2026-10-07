const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");

const API_JSON =
  "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json";

let BASE_API = null;

async function getBaseApi() {
  if (BASE_API) return BASE_API;
  const res = await axios.get(API_JSON, { timeout: 15000 });
  if (!res.data?.api) throw new Error("API URL not found");
  BASE_API = String(res.data.api).replace(/\/+$/, "");
  return BASE_API;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Upscaling takes up to 1-2 minutes, so allow a long timeout.
// A timeout is NOT retried (retrying would just make the user wait twice as long).
async function upscale(imageUrl) {
  const BASE = await getBaseApi();
  let lastErr = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // Fully encode the image link ourselves (same as the manual browser test).
      // axios `params` leaves ":" unescaped, which the API server can reject with 400.
      const reqUrl = `${BASE}/mahabub/upscale?url=${encodeURIComponent(imageUrl)}`;
      console.log("[4k] Request:", reqUrl);

      const res = await axios.get(reqUrl, { timeout: 240000 });

      console.log("[4k] Response:", JSON.stringify(res.data)?.slice(0, 500));

      const d = res.data || {};
      const out = d.image || (Array.isArray(d.images) ? d.images[0] : null);

      if (d.status !== false && out) return out;
      lastErr = new Error("API did not return an image");
    } catch (e) {
      lastErr = e;
      const rb = e?.response?.data;
      console.error(
        `[4k] API attempt ${attempt} failed:`,
        e?.response?.status || e?.code || "",
        e.message,
        rb ? (typeof rb === "string" ? rb : JSON.stringify(rb)).slice(0, 300) : ""
      );
      if (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT") break; // don't wait another 4 minutes
    }
    if (attempt < 2) await wait(3000);
  }

  throw lastErr;
}

// Download the result ourselves (browser headers) and save it to a temp file.
// Result hosts can reject the default downloader, which made the command fail.
async function downloadImage(url, filePath) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
    maxRedirects: 5,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Referer: "https://imglarger.com/",
      Accept: "image/*,*/*"
    }
  });

  const type = String(res.headers["content-type"] || "");
  if (/text\/html|application\/json/i.test(type)) {
    throw new Error(`Result host returned ${type} instead of an image`);
  }

  const buf = Buffer.from(res.data);
  if (buf.length < 1024) throw new Error("Downloaded image is too small");

  fs.writeFileSync(filePath, buf);
}

module.exports = {
  config: {
    name: "4k",
    aliases: ["upscale"],
    version: "1.7",
    role: 0,
    author: "MAHABUB",
    countDown: 5,
    longDescription: "𝚄𝚙𝚜𝚌𝚊𝚕𝚎 𝚒𝚖𝚊𝚐𝚎𝚜 𝚝𝚘 𝟺𝙺 𝚛𝚎𝚜𝚘𝚕𝚞𝚝𝚒𝚘𝚗.",
    category: "image",
    guide: {
      en: "{pn} 𝚛𝚎𝚙𝚕𝚢 𝚝𝚘 𝚊𝚗 𝚒𝚖𝚊𝚐𝚎 𝚝𝚘 𝚞𝚙𝚜𝚌𝚊𝚕𝚎 𝚒𝚝 𝚝𝚘 𝟺𝙺 𝚛𝚎𝚜𝚘𝚕𝚞𝚝𝚒𝚘𝚗."
    }
  },

  onStart: async function ({ message, event }) {
    // Image can be in the replied message or in the command message itself
    const att = event.messageReply?.attachments?.[0] || event.attachments?.[0];

    if (!att || !att.url || (att.type && att.type !== "photo")) {
      return message.reply("⚠️ | 𝙿𝚕𝚎𝚊𝚜𝚎 𝚛𝚎𝚙𝚕𝚢 𝚝𝚘 𝚊𝚗 𝚒𝚖𝚊𝚐𝚎 𝚝𝚘 𝚞𝚙𝚜𝚌𝚊𝚕𝚎 𝚒𝚝, 𝙱𝚘𝚜𝚜!");
    }

    const waitMsg = await message.reply(
      "⏳ | 𝙿𝚕𝚜 𝚆𝟾 𝙱𝚘𝚜𝚜, 𝚞𝚙𝚜𝚌𝚊𝚕𝚒𝚗𝚐 𝚢𝚘𝚞𝚛 𝚒𝚖𝚊𝚐𝚎... 😉"
    ).catch(() => null);

    const removeWait = () => {
      if (waitMsg?.messageID) {
        try { message.unsend(waitMsg.messageID); } catch {}
      }
    };

    const tmpDir = path.join(os.tmpdir(), "mahabub-bot-4k");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, `upscaled_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`);

    let stage = "api";

    try {
      const imageUrl = await upscale(att.url);
      console.log("[4k] Upscaled:", imageUrl);

      stage = "download";
      await downloadImage(imageUrl, filePath);

      stage = "send";
      await message.reply({
        body: "✅ | 𝙷𝚎𝚛𝚎 𝚒𝚜 𝚢𝚘𝚞𝚛 𝟺𝙺 𝚞𝚙𝚜𝚌𝚊𝚕𝚎𝚍 𝚒𝚖𝚊𝚐𝚎, 𝙱𝚘𝚜𝚜! ✨",
        attachment: fs.createReadStream(filePath)
      });

      removeWait();
    } catch (error) {
      console.error(`[4k] failed at "${stage}":`, error?.response?.status || "", error.message);
      removeWait();
      message.reply("❌ | 𝚃𝚑𝚎𝚛𝚎 𝚠𝚊𝚜 𝚊𝚗 𝚎𝚛𝚛𝚘𝚛 𝚠𝚑𝚒𝚕𝚎 𝚞𝚙𝚜𝚌𝚊𝚕𝚒𝚗𝚐 𝚢𝚘𝚞𝚛 𝚒𝚖𝚊𝚐𝚎.");
    } finally {
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
    }
  }
};
