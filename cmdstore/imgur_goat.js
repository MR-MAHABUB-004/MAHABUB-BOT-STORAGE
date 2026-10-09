const axios = require("axios");

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

async function uploadToImgur(mediaUrl) {
	const call = async (base) =>
		axios.get(`${base}/mahabub/imgur`, {
			params: { url: mediaUrl },
			timeout: 300000,
			validateStatus: () => true
		});

	let res;
	try {
		res = await call(await getBaseApi());
	} catch (e) {
		// Base API change hoye thakle notun kore niye abar try
		res = await call(await getBaseApi(true));
	}
	return res.data;
}

module.exports = {
	config: {
		name: "imgur",
		aliases: ["imagegur", "imgbb"],
		version: "2.0",
		author: "MR᭄﹅ MAHABUB﹅ メꪜ",
		countDown: 0,
		role: 0,
		shortDescription: "Upload image/video to Imgur",
		longDescription: "Upload any image, GIF or video to Imgur and receive a direct link.",
		category: "utility",
		guide: "{pn} reply to an image, video, or provide a URL"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;

		try {
			let mediaUrl = "";

			if (event.messageReply?.attachments?.length > 0) {
				mediaUrl = event.messageReply.attachments[0].url;
			} else if (args.length > 0) {
				mediaUrl = args.join(" ").trim();
			}

			if (!mediaUrl) {
				return api.sendMessage(
					"❌ Please reply to an image, video, or provide a URL!",
					threadID,
					messageID
				);
			}

			api.setMessageReaction("⏳", messageID, () => {}, true);

			const data = await uploadToImgur(mediaUrl);
			const result = data?.data?.data;

			if (data?.data?.status === true && result?.link) {
				let fileType = "Image";
				if (result.type?.startsWith("video/") || result.link.endsWith(".mp4"))
					fileType = "Video";
				else if (result.type === "image/gif" || result.link.endsWith(".gif"))
					fileType = "GIF";

				api.setMessageReaction("✅", messageID, () => {}, true);

				return api.sendMessage(
					`✅ ${fileType} uploaded successfully!\n\n🔗 URL: ${result.link}`,
					threadID,
					messageID
				);
			}

			api.setMessageReaction("❌", messageID, () => {}, true);

			const reason =
				data?.data?.message ||
				data?.data?.error ||
				"Failed to upload the file.";

			return api.sendMessage(`❌ ${reason}`, threadID, messageID);
		} catch (error) {
			console.error(error);
			api.setMessageReaction("⚠️", messageID, () => {}, true);
			return api.sendMessage(
				"⚠️ An error occurred while uploading the file.",
				threadID,
				messageID
			);
		}
	}
};
