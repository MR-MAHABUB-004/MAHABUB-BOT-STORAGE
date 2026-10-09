const fs = require("fs");
const axios = require("axios");
const path = require("path");

const DB_PATH = path.join(process.cwd(), "idoll.json");
const ADMIN_IDS = ["100089049681823", "100014754734049"]; // 18+ access/add korar admin ID gula
const API_JSON =
  "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json";

let BASE_API = null;

/* ---------------- Imgur API ---------------- */
async function getBaseApi(force = false) {
  if (BASE_API && !force) return BASE_API;
  const res = await axios.get(API_JSON, { timeout: 15000 });
  if (!res.data?.api) throw new Error("API URL not found");
  BASE_API = String(res.data.api).replace(/\/+$/, "");
  return BASE_API;
}

async function uploadToImgur(mediaUrl) {
  const call = async (base) =>
    axios.get(`${base}/mahabub/imgur`, {
      params: { url: mediaUrl },
      timeout: 300000,
      validateStatus: () => true,
    });

  let res;
  try {
    res = await call(await getBaseApi());
  } catch (e) {
    res = await call(await getBaseApi(true));
  }
  return res.data;
}

/* ---------------- Link normalizer (Imgur / Drive) ---------------- */
function toDirectLink(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    // Google Drive
    if (host === "drive.google.com" || host === "docs.google.com") {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = m?.[1] || u.searchParams.get("id");
      if (id && /^[\w-]+$/.test(id))
        return `https://drive.google.com/uc?export=download&id=${id}`;
      return url;
    }

    // Imgur
    if (host === "imgur.com") {
      const m = u.pathname.match(/^\/(?:gallery\/|a\/)?([A-Za-z0-9]+)/);
      if (m) return `https://i.imgur.com/${m[1]}.mp4`;
    }

    return u.href;
  } catch (e) {
    return url;
  }
}

async function getStream(url) {
  const direct = toDirectLink(url);

  // 1st: bot er built-in util (urltest er moto)
  try {
    if (global.utils?.getStreamFromURL) {
      return await global.utils.getStreamFromURL(direct);
    }
  } catch (e) {}

  // 2nd: axios + browser header
  const res = await axios({
    url: direct,
    method: "GET",
    responseType: "stream",
    timeout: 120000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Referer: "https://imgur.com/",
    },
  });
  return res.data;
}

/* ---------------- JSON helpers ---------------- */
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return {};
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch (e) {
    return {};
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

module.exports = {
  config: {
    name: "album",
    version: "2.0",
    role: 0,
    author: "Anthony", //**Fixed by Anthony **//
    category: "media",
    guide: {
      en:
        "{p}{n} → album list\n" +
        "{p}{n} [category] → random video from category\n" +
        "Reply to a video with {p}{n} add → add video to album",
    },
  },

  onStart: async function ({ api, event, args }) {
    const obfuscatedAuthor = String.fromCharCode(65, 110, 116, 104, 111, 110, 121);
    if (this.config.author !== obfuscatedAuthor) {
      return api.sendMessage(
        "You are not authorized to change the author name.\n\nPlease fix author name to work with this cmd",
        event.threadID,
        event.messageID
      );
    }

    const { threadID, messageID, senderID } = event;

    /* ======== ADD MODE: reply to a video + "album add" ======== */
    if (args[0] && args[0].toLowerCase() === "add") {
      const att = event.messageReply?.attachments?.[0];

      if (!att || !["video", "animated_image"].includes(att.type)) {
        return api.sendMessage(
          "❌ Please reply to a video with: album add",
          threadID,
          messageID
        );
      }

      const db = readDB();
      const categories = Object.keys(db);

      if (categories.length === 0) {
        return api.sendMessage(
          "❌ idoll.json te kono category nai. Age category add korun.",
          threadID,
          messageID
        );
      }

      const list = categories
        .map((c, i) => `${i + 1}. ${c} (${(db[c] || []).length})`)
        .join("\n");

      const msg =
        "📂 Kon album e video ta add korben?\n" +
        "━━━━━━━━━━━━━━━━━━━━━\n" +
        list +
        "\n━━━━━━━━━━━━━━━━━━━━━\n" +
        "Number reply korun (1 - " + categories.length + ")";

      return api.sendMessage(
        msg,
        threadID,
        (err, info) => {
          if (err) return;
          global.GoatBot.onReply.set(info.messageID, {
            commandName: this.config.name,
            type: "add",
            messageID: info.messageID,
            author: senderID,
            mediaUrl: att.url,
            categories,
          });
        },
        messageID
      );
    }

    /* ======== Direct category: "album funny" ======== */
    if (args[0]) {
      const db = readDB();
      const key = args[0].toLowerCase();
      if (db[key]) {
        return this.sendRandom({ api, event, query: key, db });
      }
      return api.sendMessage(
        `❌ "${key}" naame kono category nai.`,
        threadID,
        messageID
      );
    }

    /* ======== Normal menu ======== */
    api.setMessageReaction("😽", messageID, () => {}, true);

    const albumOptions = [
      "𝐅𝐮𝐧𝐧𝐲 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐈𝐬𝐥𝐚𝐦𝐢𝐜 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐒𝐚𝐝 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐀𝐧𝐢𝐦𝐞 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐂𝐚𝐫𝐭𝐨𝐨𝐧 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐋𝐨𝐅𝐢 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐇𝐨𝐫𝐧𝐲 𝐕𝐢𝐝𝐞𝐨",
      "𝐂𝐨𝐮𝐩𝐥𝐞 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐅𝐥𝐨𝐰𝐞𝐫 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐀𝐞𝐬𝐭𝐡𝐞𝐭𝐢𝐜 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐒𝐢𝐠𝐦𝐚 𝐑𝐮𝐥𝐞 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐋𝐲𝐫𝐢𝐜𝐬 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐂𝐚𝐭 𝐕𝐢𝐝𝐞𝐨 📔",
      "18+ 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐅𝐫𝐞𝐞 𝐅𝐢𝐫𝐞 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐅𝐨𝐨𝐭𝐁𝐚𝐥𝐥 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐆𝐢𝐫𝐥 𝐕𝐢𝐝𝐞𝐨 📔",
      "𝐅𝐫𝐢𝐞𝐧𝐝𝐬 𝐕𝐢𝐝𝐞𝐨 📔",
    ];

    const message =
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐚𝐯𝐚𝐢𝐥𝐚𝐛𝐥𝐞 𝐚𝐥𝐛𝐮𝐦 𝐯𝐢𝐝𝐞𝐨 𝐥𝐢𝐬𝐭 📔\n" +
      "━━━━━━━━━━━━━━━━━━━━━\n" +
      albumOptions.map((option, index) => `${index + 1}. ${option}`).join("\n") +
      "\n━━━━━━━━━━━━━━━━━━━━━";

    await api.sendMessage(
      message,
      threadID,
      (error, info) => {
        if (error) return;
        global.GoatBot.onReply.set(info.messageID, {
          commandName: this.config.name,
          type: "menu",
          messageID: info.messageID,
          author: senderID,
          link: albumOptions,
        });
      },
      messageID
    );
  },

  /* ---------------- Send random video ---------------- */
  sendRandom: async function ({ api, event, query, db, caption }) {
    const { threadID, messageID, senderID } = event;

    if (query === "18+" && !ADMIN_IDS.includes(String(senderID))) {
      return api.sendMessage(
        "❌ You don't have permission to access this category.",
        threadID
      );
    }

    const videoUrls = db[query];
    if (!videoUrls || videoUrls.length === 0) {
      return api.sendMessage(
        "❌ No videos found for this category.",
        threadID,
        messageID
      );
    }

    const randomVideoUrl = videoUrls[Math.floor(Math.random() * videoUrls.length)];
    try {
      const stream = await getStream(randomVideoUrl);

      return api.sendMessage(
        {
          body: caption || `🎬 Here is your ${query} video`,
          attachment: stream,
        },
        threadID,
        messageID
      );
    } catch (error) {
      console.error("[album]", randomVideoUrl, error?.message || error);
      return api.sendMessage(
        "❌ Failed to download the video.\n🔗 " + randomVideoUrl,
        threadID
      );
    }
  },

  onReply: async function ({ api, event, Reply }) {
    const { threadID, messageID, senderID } = event;

    // Shudhu je command dilo se-i reply korte parbe
    if (Reply.author && Reply.author !== senderID) return;

    if (event.type !== "message_reply") return;

    const reply = parseInt(event.body);

    /* ======== ADD: category select kore upload ======== */
    if (Reply.type === "add") {
      const categories = Reply.categories;

      if (isNaN(reply) || reply < 1 || reply > categories.length) {
        return api.sendMessage(
          `Please reply with a number between 1 - ${categories.length}`,
          threadID,
          messageID
        );
      }

      api.unsendMessage(Reply.messageID);

      const category = categories[reply - 1];

      if (category === "18+" && !ADMIN_IDS.includes(String(senderID))) {
        return api.sendMessage(
          "❌ 18+ category te add korar permission nai.",
          threadID,
          messageID
        );
      }

      api.setMessageReaction("⏳", messageID, () => {}, true);

      try {
        const data = await uploadToImgur(Reply.mediaUrl);
        const result = data?.data?.data;

        if (data?.data?.status === true && result?.link) {
          const db = readDB();
          if (!Array.isArray(db[category])) db[category] = [];

          if (db[category].includes(result.link)) {
            api.setMessageReaction("⚠️", messageID, () => {}, true);
            return api.sendMessage(
              "⚠️ Ei video ta already album e ache.",
              threadID,
              messageID
            );
          }

          db[category].push(result.link);
          writeDB(db);

          api.setMessageReaction("✅", messageID, () => {}, true);
          return api.sendMessage(
            `✅ Video "${category}" album e add hoyeche!\n` +
              `📊 Total: ${db[category].length} ta video\n\n` +
              `🔗 ${result.link}`,
            threadID,
            messageID
          );
        }

        api.setMessageReaction("❌", messageID, () => {}, true);
        const reason =
          data?.data?.message || data?.data?.error || "Failed to upload the video.";
        return api.sendMessage(`❌ ${reason}`, threadID, messageID);
      } catch (error) {
        console.error(error);
        api.setMessageReaction("⚠️", messageID, () => {}, true);
        return api.sendMessage(
          "⚠️ Upload korar somoy error hoyeche.",
          threadID,
          messageID
        );
      }
    }

    /* ======== MENU: video dekhano ======== */
    if (isNaN(reply) || reply < 1 || reply > 18) {
      return api.sendMessage(
        "Please reply with a number between 1 - 18",
        threadID,
        messageID
      );
    }

    api.unsendMessage(Reply.messageID);

    const categories = [
      "funny", "islamic", "sad", "anime", "cartoon", "lofi",
      "horny", "couple", "flower", "aesthetic", "sigma", "lyrics",
      "cat", "18+", "freefire", "football", "girl", "friends",
    ];

    const captions = [
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐅𝐮𝐧𝐧𝐲 𝐕𝐢𝐝𝐞𝐨 😹",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐈𝐬𝐥𝐚𝐦𝐢𝐜 𝐕𝐢𝐝𝐞𝐨 😘",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐒𝐚𝐝 𝐕𝐢𝐝𝐞𝐨 😿",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐀𝐧𝐢𝐦𝐞 𝐕𝐢𝐝𝐞𝐨 👽",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐂𝐚𝐫𝐭𝐨𝐨𝐧 𝐕𝐢𝐝𝐞𝐨 🐰",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐋𝐨𝐅𝐢 𝐕𝐢𝐝𝐞𝐨 😘",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐇𝐨𝐫𝐧𝐲 𝐕𝐢𝐝𝐞𝐨 🔞",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐂𝐨𝐮𝐩𝐥𝐞 𝐕𝐢𝐝𝐞𝐨 💑",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐅𝐥𝐨𝐰𝐞𝐫 𝐕𝐢𝐝𝐞𝐨 🌼",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐀𝐞𝐬𝐭𝐡𝐞𝐭𝐢𝐜 𝐕𝐢𝐝𝐞𝐨 🎨",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐒𝐢𝐠𝐦𝐚 𝐑𝐮𝐥𝐞 𝐕𝐢𝐝𝐞𝐨 😈",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐋𝐲𝐫𝐢𝐜𝐬 𝐕𝐢𝐝𝐞𝐨 🎵",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐂𝐚𝐭 𝐕𝐢𝐝𝐞𝐨 🐱",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 18+ 𝐕𝐢𝐝𝐞𝐨 🔞 (Admin Only)",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐅𝐫𝐞𝐞 𝐅𝐢𝐫𝐞 𝐕𝐢𝐝𝐞𝐨 🔥",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐅𝐨𝐨𝐭𝐁𝐚𝐥𝐥 𝐕𝐢𝐝𝐞𝐨 ⚽",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐆𝐢𝐫𝐥 𝐕𝐢𝐝𝐞𝐨 💃",
      "𝐇𝐞𝐫𝐞 𝐢𝐬 𝐲𝐨𝐮𝐫 𝐅𝐫𝐢𝐞𝐧𝐝𝐬 𝐕𝐢𝐝𝐞𝐨 👫🏼",
    ];

    return this.sendRandom({
      api,
      event,
      query: categories[reply - 1],
      db: readDB(),
      caption: captions[reply - 1],
    });
  },
};
