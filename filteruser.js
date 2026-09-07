"use strict";

/**
 * scripts/cmds/filteruser.js
 * ──────────────────────────────────────────────────────────────────────────
 * Port notes — the Telegram Bot API is meaningfully more limited here than
 * Facebook's fca-unofficial, so this isn't a 1:1 port:
 *
 *  - Telegram bots CANNOT list every member of a group (no equivalent of
 *    FB's threadInfo.userInfo). The Bot API only lets a bot look up a
 *    *specific known* user (getChatMember) or list admins
 *    (getChatAdministrators) — there is no "get all members" call.
 *    So "filter by message count" here tracks members who have actually
 *    chatted in THIS group while the bot has been running, via a small
 *    per-thread counter this file maintains itself (see the onChat hook
 *    at the bottom). It can't see members who never spoke.
 *
 *  - The original's "die" mode (kick accounts Facebook reports as
 *    locked/deactivated) has no Telegram Bot API equivalent — Telegram
 *    doesn't expose a user's deactivated/banned status to bots at all.
 *    That mode is dropped entirely; message-count filtering is now the
 *    only (and default) mode.
 *
 *  - Facebook's "react to this message to confirm" flow is replaced with
 *    this framework's native reply-to-confirm (setPendingReply / onReply).
 * ──────────────────────────────────────────────────────────────────────────
 */

function sleep(time) {
	return new Promise((resolve) => setTimeout(resolve, time));
}

module.exports = {
	config: {
		name: "filteruser",
		version: "2.0",
		author: "NTKhang (ported to Telegram)",
		usePrefix: true,
		countDown: 5,
		role: 1,
		category: "admin",
		description: {
			vi: "lọc thành viên nhóm theo số tin nhắn",
			en: "filter group members by number of messages"
		},
		guide: {
			vi: "   {pn} <số tin nhắn>\n   (chỉ tính các thành viên đã từng nhắn tin trong nhóm này kể từ khi bot online — Telegram Bot API không cho phép liệt kê toàn bộ thành viên nhóm)",
			en: "   {pn} <number of messages>\n   (only counts members who have chatted in this group since the bot came online — the Telegram Bot API has no way to list every group member)"
		}
	},

	langs: {
		vi: {
			needAdmin: "⚠️ | Vui lòng thêm bot làm quản trị viên của nhóm để sử dụng lệnh này",
			invalidNumber: "⚠️ | Vui lòng nhập vào một số hợp lệ. Ví dụ: %1 5",
			confirm: "⚠️ | Bạn có chắc chắn muốn xóa các thành viên có số tin nhắn nhỏ hơn %1 không?\n*Reply* tin nhắn này với \"yes\" để xác nhận",
			cancelled: "🚫 | Đã huỷ",
			kickByMsg: "✅ | Đã xóa thành công %1 thành viên có số tin nhắn nhỏ hơn %2",
			kickError: "❌ | Đã xảy ra lỗi, không thể kick %1 thành viên:\n%2",
			noMsg: "✅ | Không có thành viên nào (từng nhắn tin trong nhóm) có số tin nhắn nhỏ hơn %1"
		},
		en: {
			needAdmin: "⚠️ | Please add the bot as a group admin to use this command",
			invalidNumber: "⚠️ | Please enter a valid number. Example: %1 5",
			confirm: "⚠️ | Are you sure you want to remove members with less than %1 messages?\n*Reply* to this message with \"yes\" to confirm",
			cancelled: "🚫 | Cancelled",
			kickByMsg: "✅ | Successfully removed %1 member(s) with less than %2 messages",
			kickError: "❌ | An error occurred, could not kick %1 member(s):\n%2",
			noMsg: "✅ | No tracked members (who've chatted in this group) have less than %1 messages"
		}
	},

	onStart: async function ({ api, args, threadsData, message, event, setPendingReply, getLang, prefix }) {
		const chatId = event.threadID;

		// ── bot must be a group admin to kick anyone ──
		const me = await api.getMe();
		let botIsAdmin = false;
		try {
			const botMember = await api.getChatMember(chatId, me.id);
			botIsAdmin = ["administrator", "creator"].includes(botMember.status);
		}
		catch (_) { /* treated as not-admin below */ }

		if (!botIsAdmin)
			return message.reply(getLang("needAdmin"));

		const minimum = Number(args[0]);
		if (!args[0] || isNaN(minimum) || minimum < 0)
			return message.reply(getLang("invalidNumber", `${prefix}${this.config.name}`));

		const sent = await message.reply(getLang("confirm", minimum));
		if (sent && sent.message_id) {
			setPendingReply("filteruser", {
				author: event.senderID,
				messageID: sent.message_id,
				minimum
			});
		}
	},

	onReply: async function ({ api, event, message, threadsData, pendingData, getLang }) {
		if (!pendingData || pendingData.minimum == null)
			return;
		if (String(event.senderID) !== String(pendingData.author))
			return;

		const answer = (event.body || "").trim().toLowerCase();
		if (!["yes", "y", "confirm", "ok"].includes(answer))
			return message.reply(getLang("cancelled"));

		const { minimum } = pendingData;
		const chatId = event.threadID;

		const threadData = await threadsData.get(chatId);
		const activity = threadData?.data?.memberActivity || {};

		const me = await api.getMe();
		let admins = [];
		try {
			admins = (await api.getChatAdministrators(chatId)).map(a => String(a.user.id));
		}
		catch (_) { /* ignore, fall back to empty admin list */ }

		const targets = Object.entries(activity).filter(([userId, info]) =>
			(info.count || 0) < minimum &&
			userId !== String(me.id) &&
			!admins.includes(userId)
		);

		const success = [];
		const errors = [];

		for (const [userId, info] of targets) {
			try {
				await api.banChatMember(chatId, Number(userId));
				// unban right after so it's a kick, not a permanent ban
				await api.unbanChatMember(chatId, Number(userId), { only_if_banned: true });
				success.push(userId);
			}
			catch (e) {
				errors.push(info.name || userId);
			}
			await sleep(700);
		}

		let msg = "";
		if (success.length > 0)
			msg += `${getLang("kickByMsg", success.length, minimum)}\n`;
		if (errors.length > 0)
			msg += `${getLang("kickError", errors.length, errors.join("\n"))}\n`;
		if (msg === "")
			msg += getLang("noMsg", minimum);

		return message.reply(msg);
	},

	// Lightweight per-thread activity tracker — fires on every group message
	// (see core/handleMessage.js step 7, "onChat handlers"). This is what
	// lets `filteruser` know who's been chatting in a group and how much,
	// since the Telegram Bot API itself never hands over a full member list.
	onChat: async function ({ event, threadsData }) {
		if (!event.isGroup) return;

		const chatId = event.threadID;
		const userId = String(event.senderID);
		const fromUser = event.raw?.from || {};
		const name = `${fromUser.first_name || ""} ${fromUser.last_name || ""}`.trim() || "User";

		const threadData = await threadsData.get(chatId);
		const data = threadData?.data || {};
		const activity = data.memberActivity || {};

		activity[userId] = {
			count: (activity[userId]?.count || 0) + 1,
			name
		};

		await threadsData.update(chatId, { data: { ...data, memberActivity: activity } });
	}
};
