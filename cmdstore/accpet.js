const moment = require("moment-timezone");

const GRAPHQL_URL = "https://www.facebook.com/api/graphql/";
const REPLY_TIMEOUT = 60; // seconds the list stays active (was 8s, far too short)

function parseResponse(raw) {
  if (typeof raw === "string") return JSON.parse(raw);
  return raw;
}

module.exports = {
  config: {
    name: "accept",
    aliases: ["acp"],
    version: "1.1",
    author: "Loid Butter",
    countDown: 8,
    role: 2,
    shortDescription: "accept users",
    longDescription: "accept or delete pending friend requests",
    category: "Utility",
  },

  onReply: async function ({ Reply, event, api }) {
    const { author, listRequest, messageID } = Reply;
    if (author !== event.senderID) return;

    clearTimeout(Reply.unsendTimeout);

    const args = (event.body || "").trim().replace(/ +/g, " ").toLowerCase().split(" ");
    const action = args[0];

    if (action !== "add" && action !== "del") {
      return api.sendMessage(
        'Please reply like this:\nadd 1\nadd 1 2 3\nadd all\ndel 2\ndel all',
        event.threadID,
        event.messageID
      );
    }

    // stop listening for more replies on this list
    global.GoatBot.onReply.delete(messageID);

    const baseForm = {
      av: api.getCurrentUserID(),
      fb_api_caller_class: "RelayModern",
    };
    if (action === "add") {
      baseForm.fb_api_req_friendly_name = "FriendingCometFriendRequestConfirmMutation";
      baseForm.doc_id = "3147613905362928";
    } else {
      baseForm.fb_api_req_friendly_name = "FriendingCometFriendRequestDeleteMutation";
      baseForm.doc_id = "4108254489275063";
    }

    let targetIDs = args.slice(1);
    if (args[1] === "all") {
      targetIDs = listRequest.map((_, i) => String(i + 1));
    }
    if (!targetIDs.length) {
      return api.sendMessage('Please give a number or "all". Example: add 1', event.threadID, event.messageID);
    }

    const success = [];
    const failed = [];
    const targets = [];

    for (const stt of targetIDs) {
      const u = listRequest[parseInt(stt) - 1];
      if (!u) {
        failed.push(`Can't find number ${stt} in the list`);
        continue;
      }
      targets.push(u);
    }

    // run one by one to avoid Facebook rate limits
    for (const u of targets) {
      const form = {
        ...baseForm,
        variables: JSON.stringify({
          input: {
            source: "friends_tab",
            actor_id: api.getCurrentUserID(),
            client_mutation_id: String(Math.round(Math.random() * 19)),
            friend_requester_id: u.node.id,
          },
          scale: 3,
          refresh_num: 0,
        }),
      };
      try {
        const res = parseResponse(await api.httpPost(GRAPHQL_URL, form));
        if (res && res.errors) failed.push(u.node.name);
        else success.push(u.node.name);
      } catch (e) {
        failed.push(u.node.name);
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    api.unsendMessage(messageID);

    const doneText = action === "add" ? "accepted" : "deleted";
    let msg = "";
    if (success.length)
      msg += `» ${success.length} friend request(s) ${doneText}:\n${success.join("\n")}`;
    if (failed.length)
      msg += `${msg ? "\n\n" : ""}» ${failed.length} failed:\n${failed.join("\n")}`;

    return api.sendMessage(msg || "Nothing was processed.", event.threadID, event.messageID);
  },

  onStart: async function ({ event, api, commandName }) {
    const form = {
      av: api.getCurrentUserID(),
      fb_api_req_friendly_name: "FriendingCometFriendRequestsRootQueryRelayPreloader",
      fb_api_caller_class: "RelayModern",
      doc_id: "4499164963466303",
      variables: JSON.stringify({ input: { scale: 3 } }),
    };

    let listRequest;
    try {
      const res = parseResponse(await api.httpPost(GRAPHQL_URL, form));
      listRequest = res.data.viewer.friending_possibilities.edges;
    } catch (e) {
      return api.sendMessage(
        "Could not load friend requests. Facebook may have changed the API, or the session cookie is invalid.",
        event.threadID,
        event.messageID
      );
    }

    if (!listRequest || !listRequest.length)
      return api.sendMessage("No pending friend requests.", event.threadID, event.messageID);

    let msg = "";
    let i = 0;
    for (const user of listRequest) {
      i++;
      const url = user.node.url ? user.node.url.replace("www.facebook", "fb") : "N/A";
      msg += `\n${i}. Name: ${user.node.name}\nID: ${user.node.id}\nUrl: ${url}`;
      if (user.time) {
        msg += `\nTime: ${moment(user.time * 1000).tz("Asia/Dhaka").format("DD/MM/YYYY HH:mm:ss")}`;
      }
      msg += "\n";
    }

    api.sendMessage(
      `${msg}\nReply to this message with:\nadd <number>  (example: add 1 or add 1 2 3)\nadd all\ndel <number>\ndel all`,
      event.threadID,
      (e, info) => {
        if (e || !info) return;
        global.GoatBot.onReply.set(info.messageID, {
          commandName,
          messageID: info.messageID,
          listRequest,
          author: event.senderID,
          unsendTimeout: setTimeout(() => {
            global.GoatBot.onReply.delete(info.messageID);
            api.unsendMessage(info.messageID);
          }, REPLY_TIMEOUT * 1000),
        });
      },
      event.messageID
    );
  },
};
