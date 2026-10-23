"use strict";

const axios = require("axios");

// ── API (base url is loaded from the JSON file) ──────────────────────────────
const API_JSON =
	"https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json";

let BASE_API = null;

async function getBaseApi(force = false) {
	if (BASE_API && !force) return BASE_API;
	const res = await axios.get(API_JSON, { timeout: 15000 });
	if (!res.data?.api) throw new Error("API URL not found");
	BASE_API = String(res.data.api).replace(/\/+$/, "");
	return BASE_API;
}

async function askSimsimi(q, uid) {
	const run = async (force) => {
		const base = await getBaseApi(force);
		const res = await axios.get(`${base}/mahabub/simsimi`, {
			params: { action: "ask", q, uid },
			timeout: 15000
		});
		const reply = res.data?.reply;
		if (!reply || typeof reply !== "string") throw new Error("Empty reply from API");
		return reply;
	};
	try {
		return await run(false);
	}
	catch (e) {
		// api url may have changed -> refetch the json once and retry
		return await run(true);
	}
}

// ── Add your greetings here ──────────────────────────────────────────────────
// 👉 Paste your old GREETINGS list here (replace these samples)
const GREETINGS = [
	"I love you 💝",
	"হা বলো😒,কি করতে পারি😐😑?",
	"বলো জানু 🌚",
	"আরে Bolo আমার জান ,কেমন আসো?😚",
	// add more below ↓
];

// send a reply and remember it, so the user can reply to it to keep chatting
async function sendAndTrack(message, event, text, commandName) {
	await message.reply(text, (err, info) => {
		if (err || !info) return;
		global.GoatBot.onReply.set(info.messageID, {
			commandName,
			messageID: info.messageID,
			author: event.senderID
		});
	});
}

module.exports = {
	config: {
		name: "bot",
		aliases: ["bby", "বেবি", "বট", "baby"],
		version: "3.1",
		author: "Mahabub",
		usePrefix: false,   // works without prefix (also works with prefix)
		role: 0,
		category: "fun",
		countDown: 3,
		shortDescription: { en: "Chat with Simsimi AI" },
		description: { en: "Chat with Simsimi AI" },
		guide: {
			en: "{pn} → random greeting\n{pn} <message> → chat with the bot\nReply to the bot's message to continue chatting"
		}
	},

	langs: {
		en: {
			error: "⚠️ Something went wrong, try again later."
		}
	},

	onStart: async function ({ event, message, args, getLang }) {
		const query = args.join(" ").trim();

		// no text -> random greeting
		if (!query) {
			const rand = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
			return sendAndTrack(message, event, rand, this.config.name);
		}

		try {
			await message.type();
			const reply = await askSimsimi(query, event.senderID);
			return sendAndTrack(message, event, reply, this.config.name);
		}
		catch (e) {
			console.error("bot error:", e.message);
			return message.reply(getLang("error"));
		}
	},

	// runs only when the user replies to a message the bot tracked (handler checks this)
	onReply: async function ({ event, message, Reply, getLang }) {
		if (!Reply || Reply.author !== event.senderID) return;

		const query = (event.body || "").trim();
		if (!query) return;

		// drop the old session entry, a new one is created for the new reply
		global.GoatBot.onReply.delete(event.messageReply.messageID);

		try {
			await message.type();
			const reply = await askSimsimi(query, event.senderID);
			return sendAndTrack(message, event, reply, this.config.name);
		}
		catch (e) {
			console.error("bot reply error:", e.message);
			return message.reply(getLang("error"));
		}
	}
};
