const axios = require("axios");
const FormData = require("form-data");
const url = require("url");
const path = require("path");

function bold(text) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);

    if (code >= 65 && code <= 90) result += String.fromCodePoint(0x1D400 + (code - 65));
    else if (code >= 97 && code <= 122) result += String.fromCodePoint(0x1D41A + (code - 97));
    else if (code >= 48 && code <= 57) result += String.fromCodePoint(0x1D7CE + (code - 48));
    else result += ch;
  }
  return result;
}

function toBoldExceptUrl(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const placeholders = [];
  const safeText = text.replace(urlRegex, (match) => {
    placeholders.push(match);
    return `<<URL${placeholders.length - 1}>>`;
  });

  const parts = safeText.split(/(<<URL\d+>>)/g);
  const finalText = parts.map(part => {
    if (part.startsWith("<<URL")) return part;
    return bold(part);
  }).join("");

  return finalText.replace(/<<URL(\d+)>>/g, (_, index) => placeholders[index]);
}

async function uploadToCatbox(mediaUrl, attachmentType) {
  const mediaBuffer = (await axios.get(mediaUrl, { responseType: "arraybuffer" })).data;

  let ext;
  if (attachmentType && attachmentType.includes("video")) ext = ".mp4";
  else ext = path.extname(url.parse(mediaUrl).pathname) || ".mp4";

  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("userhash", "");
  form.append("fileToUpload", mediaBuffer, { filename: "upload" + ext });

  const upload = await axios.post("https://catbox.moe/user/api.php", form, {
    headers: {
      ...form.getHeaders(),
      "accept": "application/json",
      "origin": "https://catbox.moe",
      "referer": "https://catbox.moe/",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; Mobile) Chrome/137 Safari/537.36"
    },
    maxBodyLength: Infinity,
    timeout: 180000
  });

  let catboxUrl = upload.data.trim();

  if (!catboxUrl.startsWith("https://")) {
    throw new Error("Catbox upload failed: " + catboxUrl);
  }

  catboxUrl = catboxUrl.replace(/\.video$/, ".mp4");

  return catboxUrl;
}

module.exports = {
  config: {
    name: "album",
    aliases: ["al"],
    version: "2.5",
    author: "MR᭄﹅ MAHABUB﹅ メꪜ",
    countDown: 5,
    role: 0,
    shortDescription: "Smart Album System",
    longDescription: "Add videos by selecting categories from a list",
    category: "utility",
    guide: "{pn} | reply video with {pn} add | {pn} add <url>"
  },

  onStart: async function ({ message, event, api, args }) {

    // Fetch BASE_API URL properly
    const resApi = await axios.get("https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json");
    const BASE_API = resApi.data.album;

    // --- Add video process ---
    if (args[0] === "add") {
      let videoUrl = args[1];

      if (event.type === "message_reply") {
        const attachment = event.messageReply.attachments[0];
        if (attachment) {
          videoUrl = attachment.url;
        }
      }

      if (!videoUrl) return message.reply(toBoldExceptUrl("❌ Please reply to a video or provide a URL!"));

      try {
        const res = await axios.get(`${BASE_API}/api/upload`);
        const categories = res.data.availableCategories;

        let msg = "╭─────────────╼\n" +
                  "│  📂 SELECT CATEGORY\n" +
                  "╰─────────────╼\n\n";

        categories.forEach((cat, index) => {
          msg += `  ${index + 1}.  ${cat.category.toUpperCase()}\n`;
        });

        msg += `\n╼───────────────╼\n` +
               `  💡 Reply with the number where\n` +
               `  you want to add this video.`;

        return message.reply(toBoldExceptUrl(msg), (err, info) => {
          global.GoatBot.onReply.set(info.messageID, {
            commandName: this.config.name,
            type: "add_video",
            videoUrl: videoUrl,
            categories: categories,
            author: event.senderID,
            BASE_API: BASE_API
          });
        });
      } catch (err) {
        return message.reply(toBoldExceptUrl("❌ Could not fetch categories."));
      }
    }

    // --- View album list ---
    if (!args[0]) {
      try {
        const res = await axios.get(`${BASE_API}/api/upload`);
        const categories = res.data.availableCategories;

        let msg = "╭─────────────╼\n" +
                  "│  🎬 AVAILABLE ALBUMS\n" +
                  "╰─────────────╼\n\n";

        categories.forEach((cat, index) => {
          msg += `  ${index + 1}.  ${cat.category.toUpperCase()} 「${cat.totalVideos}」\n`;
        });

        msg += `\n╼───────────────╼\n  💡 Reply number to get video.`;

        return message.reply(toBoldExceptUrl(msg), (err, info) => {
          global.GoatBot.onReply.set(info.messageID, {
            commandName: this.config.name,
            type: "view_video",
            messageID: info.messageID,
            categories: categories,
            author: event.senderID,
            BASE_API: BASE_API
          });
        });
      } catch (err) {
        return message.reply(toBoldExceptUrl("❌ Error loading list."));
      }
    }
  },

  onReply: async function ({ message, event, api, Reply }) {
    const { type, categories, videoUrl, messageID, author, BASE_API } = Reply;
    if (event.senderID !== author) return;

    const index = parseInt(event.body);

    if (isNaN(index) || index <= 0 || index > categories.length) return;

    const selectedCategory = categories[index - 1].category;

    // --- Add video ---
    if (type === "add_video") {
      try {
        const sentMsg = await message.reply(toBoldExceptUrl(`🔄 Uploading to Catbox...`));

        const catboxUrl = await uploadToCatbox(videoUrl, "video");

        const res = await axios.get(`${BASE_API}/api/upload/${selectedCategory}?url=${encodeURIComponent(catboxUrl)}`);

        return api.editMessage(
          toBoldExceptUrl(`✅ Successfully added!\n📂 Album: ${selectedCategory}\n📊 Total: ${res.data.totalVideos}\n🔗 Catbox: ${catboxUrl}`),
          sentMsg.messageID
        );
      } catch (err) {
        return message.reply(toBoldExceptUrl("❌ API Error."));
      }
    }

    // --- View video ---
    if (type === "view_video") {
      try {
        await api.editMessage(toBoldExceptUrl("⏳ Preparing..."), messageID);
        const res = await axios.get(`${BASE_API}/api/${selectedCategory}`);

        if (!res.data.status) return api.editMessage(toBoldExceptUrl("❌ No video found!"), messageID);

        await api.editMessage(toBoldExceptUrl("🔄 Sending..."), messageID);

        await message.reply({
          body: toBoldExceptUrl(`🎬 Category: ${selectedCategory.toUpperCase()}`),
          attachment: await global.utils.getStreamFromURL(res.data.video)
        });

        return api.editMessage(toBoldExceptUrl("✨ Enjoy your video!"), messageID);
      } catch (err) {
        return api.editMessage(toBoldExceptUrl("❌ Error!"), messageID);
      }
    }
  }
};
