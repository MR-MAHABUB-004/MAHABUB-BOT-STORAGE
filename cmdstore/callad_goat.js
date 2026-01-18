const { getStreamsFromAttachment, log } = global.utils;

/**
 * Enhanced mediaTypes to support GIFs and Stickers
 */
const mediaTypes = ["photo", "png", "animated_image", "video", "audio", "sticker", "gif"];

module.exports = {
	config: {
		name: "callad",
		version: "2.0",
		author: "NTKhang & Gemini",
		countDown: 5,
		role: 0,
		description: {
			en: "Send report/feedback to admin OR Admin broadcasts to all groups (Supports GIF/Sticker)",
			vi: "Gửi báo cáo tới admin hoặc Admin gửi thông báo tới tất cả nhóm (Hỗ trợ GIF/Sticker)"
		},
		category: "contacts admin",
		guide: {
			en: "   {pn} <message>",
			vi: "   {pn} <tin nhắn>"
		}
	},

	langs: {
		en: {
			missingMessage: "Please enter a message or attach a photo/gif/sticker!",
			sendByGroup: "\n- Sent from group: %1\n- Thread ID: %2",
			sendByUser: "\n- Sent from user",
			content: "\n\nContent:\n─────────────────\n%1\n─────────────────\nReply to this message to chat",
			success: "Sent successfully to %1 target(s)!",
			adminNotification: "==📢 NOTIFICATION FROM ADMIN ==\n\nSender: %1\nContent: %2\n\n─────────────────\nReply to this message to send feedback to admin",
			noAdmin: "Bot has no admin at the moment",
			replySuccess: "Sent your reply successfully!",
			replyFrom: "📍 Reply from: %1\n─────────────────\n%2",
			error: "An error occurred while sending your message."
		},
		vi: {
			missingMessage: "Vui lòng nhập tin nhắn hoặc đính kèm ảnh/gif/sticker!",
			sendByGroup: "\n- Được gửi từ nhóm: %1\n- Thread ID: %2",
			sendByUser: "\n- Được gửi từ người dùng",
			content: "\n\nNội dung:\n─────────────────\n%1\n─────────────────\nPhản hồi tin nhắn này để trao đổi",
			success: "Đã gửi thành công tới %1 mục tiêu!",
			adminNotification: "==📢 THÔNG BÁO TỪ ADMIN ==\n\nNgười gửi: %1\nNội dung: %2\n\n─────────────────\nPhản hồi tin nhắn này để gửi lại báo cáo cho admin",
			noAdmin: "Hiện tại bot chưa có admin nào",
			replySuccess: "Đã gửi phản hồi thành công!",
			replyFrom: "📍 Phản hồi từ: %1\n─────────────────\n%2",
			error: "Đã xảy ra lỗi khi gửi tin nhắn."
		}
	},

	onStart: async function ({ args, message, event, usersData, threadsData, api, commandName, getLang }) {
		const { config } = global.GoatBot;
		const { senderID, threadID, isGroup } = event;

		// Check if there is text or an attachment
		if (!args[0] && event.attachments.length === 0 && !event.messageReply) 
			return message.reply(getLang("missingMessage"));
			
		if (config.adminBot.length == 0) return message.reply(getLang("noAdmin"));

		const senderName = await usersData.getName(senderID);
		const isAdmin = config.adminBot.includes(senderID);

		// Combine attachments from current message or replied message
		const attachments = [...event.attachments, ...(event.messageReply?.attachments || [])]
			.filter(item => mediaTypes.includes(item.type));

		// --- CASE 1: ADMIN BROADCAST TO ALL GROUPS ---
		if (isAdmin) {
			const allThreads = await threadsData.getAll();
			const groupThreads = allThreads.filter(t => t.isGroup && t.threadID != threadID);
			let count = 0;

			const formAdminMsg = {
				body: getLang("adminNotification", senderName, args.join(" ") || "(Attachment)"),
				attachment: await getStreamsFromAttachment(attachments)
			};

			for (const thread of groupThreads) {
				try {
					const send = await api.sendMessage(formAdminMsg, thread.threadID);
					global.GoatBot.onReply.set(send.messageID, {
						commandName,
						messageID: send.messageID,
						threadID: event.threadID, 
						messageIDSender: event.messageID,
						type: "userCallAdmin" 
					});
					count++;
				} catch (e) { log.err("CALLAD", `Error sending to ${thread.threadID}`); }
			}
			return message.reply(getLang("success", count));
		}

		// --- CASE 2: NORMAL USER TO ADMINS ---
		const msgHead = "==📨️ CALL ADMIN 📨️=="
			+ `\n- User Name: ${senderName}`
			+ `\n- User ID: ${senderID}`
			+ (isGroup ? getLang("sendByGroup", (await threadsData.get(threadID)).threadName, threadID) : getLang("sendByUser"));

		const formUserMsg = {
			body: msgHead + getLang("content", args.join(" ") || "(Attachment)"),
			mentions: [{ id: senderID, tag: senderName }],
			attachment: await getStreamsFromAttachment(attachments)
		};

		let successCount = 0;
		for (const uid of config.adminBot) {
			try {
				const messageSend = await api.sendMessage(formUserMsg, uid);
				successCount++;
				global.GoatBot.onReply.set(messageSend.messageID, {
					commandName,
					messageID: messageSend.messageID,
					threadID,
					messageIDSender: event.messageID,
					type: "userCallAdmin"
				});
			} catch (err) { log.err("CALLAD", err); }
		}
		return message.reply(getLang("success", successCount));
	},

	onReply: async ({ args, event, api, message, Reply, usersData, commandName, getLang }) => {
		const { type, threadID, messageIDSender } = Reply;
		const senderName = await usersData.getName(event.senderID);

		const attachments = event.attachments.filter(item => mediaTypes.includes(item.type));

		const formMessage = {
			body: getLang("replyFrom", senderName, args.join(" ") || "(Attachment)"),
			attachment: await getStreamsFromAttachment(attachments)
		};

		api.sendMessage(formMessage, threadID, (err, info) => {
			if (err) return message.reply(getLang("error"));
			message.reply(getLang("replySuccess"));
			global.GoatBot.onReply.set(info.messageID, {
				commandName,
				messageID: info.messageID,
				messageIDSender: event.messageID,
				threadID: event.threadID,
				type: type === "userCallAdmin" ? "adminReply" : "userCallAdmin"
			});
		}, messageIDSender);
	}
};
