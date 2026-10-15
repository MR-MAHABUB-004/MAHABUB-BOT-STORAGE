"use strict";

const axios = require("axios");

const API_JSON =
  "https://raw.githubusercontent.com/MR-MAHABUB-004/MAHABUB-BOT-STORAGE/refs/heads/main/APIURL.json";

let BASE_API = null;
let API_CACHE_TIME = 0;

const API_CACHE_TTL = 5 * 60 * 1000;
const ANSWER_TIMEOUT_MS = 60 * 1000;
const REWARD_MONEY = 100;

const pendingTimers = new Map();

// ─────────────────────────────────────────────
// API BASE
// ─────────────────────────────────────────────

async function getBaseApi(force = false) {
  if (
    BASE_API &&
    !force &&
    Date.now() - API_CACHE_TIME < API_CACHE_TTL
  ) {
    return BASE_API;
  }

  const res = await axios.get(API_JSON, {
    timeout: 15000,
  });

  if (!res.data?.api) {
    throw new Error("API URL not found in APIURL.json");
  }

  BASE_API = String(res.data.api).replace(/\/+$/, "");
  API_CACHE_TIME = Date.now();

  return BASE_API;
}

async function getApiUrl() {
  const base = await getBaseApi();
  return `${base}/mahabub/simsimi`;
}

// ─────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────

async function getRandomQuestion() {
  try {
    const API_BASE = await getApiUrl();

    const res = await axios.get(API_BASE, {
      params: {
        action: "next",
      },
      timeout: 15000,
    });

    const data = res.data;

    return (
      data?.question ||
      data?.ques ||
      data?.q ||
      null
    );
  } catch (error) {
    console.error(
      "[NT] getRandomQuestion:",
      error.response?.data || error.message
    );

    return null;
  }
}

async function teach(question, answer) {
  const API_BASE = await getApiUrl();

  return axios.get(API_BASE, {
    params: {
      action: "teach",
      q: question,
      ans: answer,
    },
    timeout: 15000,
  });
}

// ─────────────────────────────────────────────
// MESSAGE HELPERS
// ─────────────────────────────────────────────

function getMessageId(result) {
  if (!result) return null;

  return (
    result.messageID ||
    result.messageId ||
    result.message_id ||
    result.id ||
    null
  );
}

function scheduleQuestionTimeout(api, threadID, messageID) {
  if (!messageID) return;

  const timerKey = `${threadID}:${messageID}`;

  const timer = setTimeout(async () => {
    try {
      global.GoatBot.onReply.delete(String(messageID));
      await api.unsendMessage(messageID);
    } catch (error) {
      // Message may already be deleted.
    } finally {
      pendingTimers.delete(timerKey);
    }
  }, ANSWER_TIMEOUT_MS);

  pendingTimers.set(timerKey, timer);
}

function clearQuestionTimeout(threadID, messageID) {
  if (!messageID) return;

  const timerKey = `${threadID}:${messageID}`;
  const timer = pendingTimers.get(timerKey);

  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(timerKey);
  }
}

// ─────────────────────────────────────────────
// COMMAND
// ─────────────────────────────────────────────

module.exports = {
  config: {
    name: "nt",
    aliases: ["newteach", "teach"],
    version: "5.0.0",
    author: "MAHABUB",
    usePrefix: true,
    role: 0,
    category: "chat",
    countDown: 5,
    description: {
      en: "Answer random questions and earn money by teaching the bot.",
    },
    guide: {
      en:
        "{pn} — Get a random question\n" +
        "{pn} ask=Question$ans=Answer — Teach manually\n" +
        "{pn} ask=Question&ans=Answer — Alternative format",
    },
  },

  langs: {
    en: {
      badFormat:
        "❌ Wrong format!\n\n" +
        "Use:\n" +
        "nt ask=Question$ans=Answer\n" +
        "or\n" +
        "nt ask=Question&ans=Answer",

      missingQA: "❌ Question or answer is missing.",

      taught:
        "✅ Successfully taught!\n\n" +
        "🧠 Question:\n❝ %1 ❞\n\n" +
        "💬 Answer:\n❝ %2 ❞",

      noQuestion:
        "❌ No question found from API. Please try again.",

      question:
        "🧠 NEXT QUESTION 🤯\n\n" +
        "❝ %1 ❞\n\n" +
        "💬 Reply to this message with your answer!",

      saved:
        "✅ Answer saved!\n\n" +
        "🧠 Question:\n❝ %1 ❞\n\n" +
        "💬 Answer:\n❝ %2 ❞\n\n" +
        "💰 Reward: +100 Money\n" +
        "💳 Balance: %3\n\n" +
        "👤 Teacher: %4",

      error:
        "❌ Something went wrong. Please try again.",
    },
  },

  // ───────────────────────────────────────────
  // ON START
  // ───────────────────────────────────────────

  onStart: async function ({
    api,
    event,
    message,
    args,
    getLang,
    commandName,
  }) {
    const text = args.join(" ").trim();

    try {
      // Manual teaching:
      // nt ask=Question$ans=Answer
      // nt ask=Question&ans=Answer

      if (text.startsWith("ask=")) {
        const match = text.match(
          /^ask=(.+?)(?:\$ans=|&ans=)([\s\S]+)$/i
        );

        if (!match) {
          return message.reply(getLang("badFormat"));
        }

        const question = match[1].trim();
        const answer = match[2].trim();

        if (!question || !answer) {
          return message.reply(getLang("missingQA"));
        }

        await teach(question, answer);

        return message.reply(
          getLang("taught")
            .replace("%1", question)
            .replace("%2", answer)
        );
      }

      // Random question mode

      const question = await getRandomQuestion();

      if (!question) {
        return message.reply(getLang("noQuestion"));
      }

      const sent = await message.reply(
        getLang("question").replace("%1", question)
      );

      const messageID = getMessageId(sent);

      if (!messageID) {
        console.error(
          "[NT] Could not get the question message ID:",
          sent
        );

        return;
      }

      global.GoatBot.onReply.set(String(messageID), {
        commandName: "nt",
        author: event.senderID,
        question,
        messageID,
        threadID: event.threadID,
      });

      scheduleQuestionTimeout(
        api,
        event.threadID,
        messageID
      );
    } catch (error) {
      console.error(
        "[NT] onStart:",
        error.response?.data || error.message
      );

      return message.reply(getLang("error"));
    }
  },

  // ───────────────────────────────────────────
  // ON REPLY
  // ───────────────────────────────────────────

  onReply: async function ({
    api,
    event,
    message,
    getLang,
    Reply,
    usersData,
  }) {
    const pendingData = Reply;
    if (!pendingData) return;

    // Only the original user can answer.
    if (String(pendingData.author) !== String(event.senderID)) {
      return;
    }

    const answer = String(event.body || "").trim();

    if (!answer) return;

    if (typeof Reply.delete === "function") Reply.delete();
    global.GoatBot.onReply.delete(String(pendingData.messageID));

    const question = pendingData.question;
    const threadID = event.threadID;
    const questionMessageID = pendingData.messageID;

    try {
      // Save answer in API.

      await teach(question, answer);

      // Reward user.

      const userData = (await usersData.get(event.senderID)) || {};
      const currentMoney = Number(userData.money) || 0;
      const balance = currentMoney + REWARD_MONEY;

      await usersData.set(event.senderID, {
        money: balance,
      });

      const name =
        userData.name || `User ${event.senderID}`;

      // Clear timeout and remove old question.

      clearQuestionTimeout(
        threadID,
        questionMessageID
      );

      if (questionMessageID) {
        try {
          await api.unsendMessage(questionMessageID);
        } catch (error) {
          // Ignore deletion errors.
        }
      }

      // Confirmation.

      const savedMsg = await message.reply(
        getLang("saved")
          .replace("%1", question)
          .replace("%2", answer)
          .replace("%3", balance.toLocaleString())
          .replace("%4", name)
      );

      // Get next question.

      const nextQuestion = await getRandomQuestion();

      if (nextQuestion) {
        const sent = await message.reply(
          getLang("question").replace(
            "%1",
            nextQuestion
          )
        );

        const nextMessageID = getMessageId(sent);

        if (nextMessageID) {
          global.GoatBot.onReply.set(String(nextMessageID), {
            commandName: "nt",
            author: event.senderID,
            question: nextQuestion,
            messageID: nextMessageID,
            threadID,
          });

          scheduleQuestionTimeout(
            api,
            threadID,
            nextMessageID
          );
        }
      }

      // Delete confirmation after 4 seconds.

      const savedMessageID = getMessageId(savedMsg);

      if (savedMessageID) {
        setTimeout(async () => {
          try {
            await api.unsendMessage(savedMessageID);
          } catch (error) {
            // Ignore deletion errors.
          }
        }, 4000);
      }
    } catch (error) {
      console.error(
        "[NT] onReply:",
        error.response?.data || error.message
      );

      return message.reply(getLang("error"));
    }
  },
};
