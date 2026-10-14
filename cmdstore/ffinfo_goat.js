const axios = require("axios");

const API_JSON =
  "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json";

let BASE_API = null;

async function getBaseApi() {
  if (BASE_API) return BASE_API;

  const res = await axios.get(API_JSON, { timeout: 15000 });

  if (!res.data?.api) {
    throw new Error("API URL not found");
  }

  // Remove trailing slashes (RegExp constructor avoids backslash paste issues)
  BASE_API = String(res.data.api).replace(new RegExp("/+$"), "");
  return BASE_API;
}

function formatDate(date) {
  if (!date) return "N/A";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

function formatNumber(number) {
  return Number(number || 0).toLocaleString("en-US");
}

function cleanValue(value) {
  if (value === undefined || value === null || value === "") {
    return "N/A";
  }

  return String(value);
}

const RANKS = {
  301: "Bronze",
  302: "Silver",
  303: "Gold",
  304: "Platinum",
  305: "Diamond",
  306: "Heroic",
  307: "Elite Heroic",
  308: "Master",
  309: "Grandmaster",
  310: "Grandmaster"
};

function rankName(value) {
  return RANKS[value] || `Rank ID: ${cleanValue(value)}`;
}

module.exports = {
  config: {
    name: "ffinfo",
    aliases: ["ff", "freefire", "ffuid"],
    version: "2.0",
    author: "Mahabub",
    countDown: 5,
    role: 0,
    shortDescription: {
      en: "Get Free Fire account information"
    },
    longDescription: {
      en: "Get detailed Free Fire player, rank, profile, pet and guild information."
    },
    category: "Information",
    guide: {
      en: "{pn} <uid>"
    },
    envConfig: {}
  },

  onStart: async function ({ message, args }) {
    try {
      const uid = String(args[0] || "").trim();

      if (!/^\d{8,20}$/.test(uid)) {
        return message.reply(
          "❌ | Invalid Free Fire UID!\n\n" +
            "Usage: ffinfo <uid>\n" +
            "Example: ffinfo 6605263063"
        );
      }

      await message.reply("🔎 | Fetching Free Fire player information...");

      const baseApi = await getBaseApi();

      const response = await axios.get(`${baseApi}/mahabub/ffinfo`, {
        params: { uid },
        timeout: 25000
      });

      const result = response.data;

      if (!result || result.status !== true || !result.data?.account) {
        return message.reply(
          "❌ | Free Fire player information not found.\n" +
            `Message: ${result?.message || result?.error || "Invalid API response"}`
        );
      }

      const data = result.data;
      const account = data.account || {};
      const rank = data.rank || {};
      const profile = data.profile || {};
      const pet = data.pet || {};
      const guild = data.guild || {};
      const leader = guild.leader || {};

      const brRank = rank.br_max_rank;
      const csRank = rank.cs_max_rank;

      const text =
`╭━━━『 FREE FIRE INFO 』━━━╮
┃ 🎮 ACCOUNT INFORMATION
┣━━━━━━━━━━━━━━━━━━━━
┃ 👤 Name: ${cleanValue(account.name)}
┃ 🆔 UID: ${cleanValue(account.uid || result.uid)}
┃ 🌍 Region: ${cleanValue(account.region)}
┃ ⭐ Level: ${cleanValue(account.level)}
┃ ✨ EXP: ${formatNumber(account.exp)}
┃ ❤️ Likes: ${formatNumber(account.likes)}
┃ 👑 Prime Level: ${cleanValue(account.prime_level)}
┃ 🛡️ Credit Score: ${cleanValue(account.credit_score)}
┃ 📦 Account Type: ${cleanValue(account.account_type)}
┃ 📅 Created: ${formatDate(account.created_at)}
┃ 🕒 Last Login: ${formatDate(account.last_login)}
┃ 📱 Version: ${cleanValue(account.release_version)}
┃ 🎫 Season ID: ${cleanValue(account.season_id)}
┃ 🗓️ Account Age: ${cleanValue(account.days_old)} days
┣━━━━━━━━━━━━━━━━━━━━
┃ 🏆 RANK INFORMATION
┣━━━━━━━━━━━━━━━━━━━━
┃ 🔥 BR Rank: ${rankName(brRank)}
┃ 🎯 BR Points: ${formatNumber(rank.br_rank_point)}
┃ 🥇 BR Max Rank ID: ${cleanValue(brRank)}
┃ ⚔️ CS Rank: ${rankName(csRank)}
┃ 🎯 CS Points: ${formatNumber(rank.cs_rank_point)}
┃ 🥇 CS Max Rank ID: ${cleanValue(csRank)}
┃ 👁️ BR Rank Visible: ${rank.show_br_rank ? "Yes" : "No"}
┃ 👁️ CS Rank Visible: ${rank.show_cs_rank ? "Yes" : "No"}
┣━━━━━━━━━━━━━━━━━━━━
┃ 🖼️ PROFILE INFORMATION
┣━━━━━━━━━━━━━━━━━━━━
┃ 🏷️ Title: ${cleanValue(profile.title)}
┃ 🚻 Gender: ${cleanValue(profile.gender)}
┃ 🗣️ Language: ${cleanValue(profile.language)}
┃ 🌙 Active Time: ${cleanValue(profile.time_active)}
┃ 🎭 Avatar ID: ${cleanValue(profile.avatar_id)}
┃ 🖼️ Banner ID: ${cleanValue(profile.banner_id)}
┃ ✍️ Signature: ${cleanValue(profile.signature)}
┃ 🖼️ Banner Image: ${cleanValue(profile.banner_image)}
┣━━━━━━━━━━━━━━━━━━━━
┃ 🐾 PET INFORMATION
┣━━━━━━━━━━━━━━━━━━━━
┃ 🆔 Pet ID: ${cleanValue(pet.id)}
┃ ⭐ Pet Level: ${cleanValue(pet.level)}
┃ ✨ Pet EXP: ${formatNumber(pet.exp)}
┃ 🎨 Skin ID: ${cleanValue(pet.skin_id)}
┃ ✅ Selected: ${pet.is_selected ? "Yes" : "No"}
┃ ⚡ Skill ID: ${cleanValue(pet.selected_skill_id)}
┣━━━━━━━━━━━━━━━━━━━━
┃ 🏰 GUILD INFORMATION
┣━━━━━━━━━━━━━━━━━━━━
┃ 🏷️ Name: ${cleanValue(guild.name)}
┃ 🆔 Guild ID: ${cleanValue(guild.id)}
┃ ⭐ Guild Level: ${cleanValue(guild.level)}
┃ 👥 Members: ${cleanValue(guild.members)}/${cleanValue(guild.capacity)}
┃ 👑 Leader: ${cleanValue(leader.name)}
┃ 🆔 Leader UID: ${cleanValue(leader.uid)}
┃ ⭐ Leader Level: ${cleanValue(leader.level)}
┃ ❤️ Leader Likes: ${formatNumber(leader.likes)}
┃ 🌍 Leader Region: ${cleanValue(leader.region)}
┃ 🎯 Leader BR Points: ${formatNumber(leader.br_points)}
┃ 🎯 Leader CS Points: ${formatNumber(leader.cs_points)}
╰━━━━━━━━━━━━━━━━━━━━╯

   ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʜᴀʙᴜʙ ʙᴏᴛ`;

      return message.reply(text);
    } catch (err) {
      console.error("[FFINFO ERROR]", err.response?.data || err.message);

      if (err.code === "ECONNABORTED") {
        return message.reply("⏱️ | API request timed out. Please try again.");
      }

      return message.reply(
        "❌ | Failed to fetch Free Fire information.\n" +
          `Reason: ${
            err.response?.data?.message || err.message || "Unknown error"
          }`
      );
    }
  }
};
