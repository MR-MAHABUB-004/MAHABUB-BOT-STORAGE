const { loadImage, createCanvas } = require("canvas");
const axios = require("axios");
const fs = require("fs-extra");

const BG_URL = "https://i.imgur.com/msxJhNg.jpeg";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function download(url, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
        try {
            const res = await axios.get(url, {
                responseType: "arraybuffer",
                timeout: 15000,
                headers: { "User-Agent": UA }
            });
            if (res.data && res.data.length) return Buffer.from(res.data);
        } catch (e) {
            lastErr = e;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
    throw lastErr || new Error("download failed");
}

async function getBackground(cacheDir) {
    const bgCache = cacheDir + "/pair_bg.png";
    try {
        if (fs.existsSync(bgCache) && fs.statSync(bgCache).size > 0)
            return await loadImage(bgCache);
    } catch (e) {}
    try {
        const buf = await download(BG_URL);
        const img = await loadImage(buf);
        fs.writeFileSync(bgCache, buf);
        return img;
    } catch (e) {
        return null; // fallback gradient will be drawn
    }
}

async function getAvatar(id) {
    try {
        const buf = await download(`https://graph.facebook.com/${id}/picture?width=720&height=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`, 2);
        return await loadImage(buf);
    } catch (e) {
        return null;
    }
}

module.exports = {
    config: {
        name: "pair",
        countDown: 8,
        role: 0,
        category: "𝐋𝐎𝐕𝐄",
    },
    onStart: async function ({ api, event }) {
        const cacheDir = __dirname + "/cache";
        fs.ensureDirSync(cacheDir);
        let pathImg = `${cacheDir}/pair_${event.senderID}_${Date.now()}.png`;

        var id1 = event.senderID;
        var name1 = (await api.getUserInfo(id1))[id1].name;
        var ThreadInfo;
        try { ThreadInfo = await api.getThreadInfo(event.threadID); } catch (e) { ThreadInfo = null; }
        if (!ThreadInfo || !ThreadInfo.userInfo)
            return api.sendMessage("Group info load kora jachhe na, kichukhon pore try korun.", event.threadID);
        var all = ThreadInfo.userInfo;

        let gender1;
        for (let c of all) if (c.id == id1) gender1 = c.gender;

        const botID = api.getCurrentUserID();
        let candidates = [];
        if (gender1 == "FEMALE") {
            candidates = all.filter(u => u.gender == "MALE" && u.id !== id1 && u.id !== botID).map(u => u.id);
        } else if (gender1 == "MALE") {
            candidates = all.filter(u => u.gender == "FEMALE" && u.id !== id1 && u.id !== botID).map(u => u.id);
        } else {
            candidates = all.filter(u => u.id !== id1 && u.id !== botID).map(u => u.id);
        }

        if (!candidates.length) return api.sendMessage("No suitable partner found for pairing.", event.threadID);

        var id2 = candidates[Math.floor(Math.random() * candidates.length)];
        var name2 = (await api.getUserInfo(id2))[id2].name;

        var rd1 = Math.floor(Math.random() * 100) + 1;
        var cc = ["-𝟭", "𝟵𝟵.𝟵𝟵", "𝟭𝟵", "∞", "𝟭𝟬𝟭", "𝟬.𝟬𝟭"];
        var rd2 = cc[Math.floor(Math.random() * cc.length)];
        var djtme = Array(5).fill(`${rd1}`).concat([`${rd2}`], Array(4).fill(`${rd1}`));
        var matchRate = djtme[Math.floor(Math.random() * djtme.length)];

        const notes = [
            "𝗘𝘃𝗲𝗿𝘆 𝘁𝗶𝗺𝗲 𝗜 𝘀𝗲𝗲 𝘆𝗼𝘂, 𝗺𝘆 𝗵𝗲𝗮𝗿𝘁 𝘀𝗸𝗶𝗽𝘀 𝗮 𝗯𝗲𝗮𝘁.",
            "𝗬𝗼𝘂’𝗿𝗲 𝗺𝘆 𝘁𝗼𝗱𝗮𝘆 𝗮𝗻𝗱 𝗮𝗹𝗹 𝗼𝗳 𝗺𝘆 𝘁𝗼𝗺𝗼𝗿𝗿𝗼𝘄𝘀.",
            "𝗜𝗻 𝘆𝗼𝘂𝗿 𝘀𝗺𝗶𝗹𝗲, 𝗜 𝘀𝗲𝗲 𝘀𝗼𝗺𝗲𝘁𝗵𝗶𝗻𝗴 𝗺𝗼𝗿𝗲 𝗯𝗲𝗮𝘂𝘁𝗶𝗳𝘂𝗹 𝘁𝗵𝗮𝗻 𝘁𝗵𝗲 𝘀𝘁𝗮𝗿𝘀.",
            "𝗬𝗼𝘂 𝗺𝗮𝗸𝗲 𝗺𝘆 𝗵𝗲𝗮𝗿𝘁 𝗿𝗮𝗰𝗲 𝘄𝗶𝘁𝗵𝗼𝘂𝘁 𝗲𝘃𝗲𝗻 𝘁𝗿𝘆𝗶𝗻𝗴.",
            "𝗘𝘃𝗲𝗿𝘆 𝗹𝗼𝘃𝗲 𝘀𝘁𝗼𝗿𝘆 𝗶𝘀 𝗯𝗲𝗮𝘂𝘁𝗶𝗳𝘂𝗹, 𝗯𝘂𝘁 𝗼𝘂𝗿𝘀 𝗶𝘀 𝗺𝘆 𝗳𝗮𝘃𝗼𝗿𝗶𝘁𝗲.",
            "𝗬𝗼𝘂’𝗿𝗲 𝗺𝘆 𝗳𝗮𝘃𝗼𝗿𝗶𝘁𝗲 𝗽𝗹𝗮𝗰𝗲 𝘁𝗼 𝗴𝗼 𝘄𝗵𝗲𝗻 𝗺𝘆 𝗺𝗶𝗻𝗱 𝘀𝗲𝗮𝗿𝗰𝗵𝗲𝘀 𝗳𝗼𝗿 𝗽𝗲𝗮𝗰𝗲.",
            "𝗬𝗼𝘂𝗿 𝗲𝘆𝗲𝘀 𝗵𝗼𝗹𝗱 𝘁𝗵𝗲 𝗸𝗲𝘆 𝘁𝗼 𝗺𝘆 𝘀𝗼𝘂𝗹.",
            "𝗜 𝗱𝗶𝗱𝗻’𝘁 𝗰𝗵𝗼𝗼𝘀𝗲 𝘆𝗼𝘂, 𝗺𝘆 𝗵𝗲𝗮𝗿𝘁 𝗱𝗶𝗱.",
            "𝗪𝗶𝘁𝗵 𝘆𝗼𝘂, 𝗲𝘃𝗲𝗿𝘆 𝗺𝗼𝗺𝗲𝗻𝘁 𝗯𝗲𝗰𝗼𝗺𝗲𝘀 𝗮 𝗺𝗲𝗺𝗼𝗿𝘆.",
            "𝗬𝗼𝘂’𝗿𝗲 𝘁𝗵𝗲 𝗿𝗲𝗮𝘀𝗼𝗻 𝗜 𝗯𝗲𝗹𝗶𝗲𝘃𝗲 𝗶𝗻 𝗹𝗼𝘃𝗲."
        ];
        const lovelyNote = notes[Math.floor(Math.random() * notes.length)];

        const baseImage = await getBackground(cacheDir);
        const imgAvt1 = await getAvatar(id1);
        const imgAvt2 = await getAvatar(id2);

        const W = baseImage ? baseImage.width : 1280;
        const H = baseImage ? baseImage.height : 720;
        let canvas = createCanvas(W, H);
        let ctx = canvas.getContext("2d");

        // Background (fallback gradient if imgur is rate-limiting)
        if (baseImage) {
            ctx.drawImage(baseImage, 0, 0, W, H);
        } else {
            const g = ctx.createLinearGradient(0, 0, W, H);
            g.addColorStop(0, "#ff9ac1");
            g.addColorStop(1, "#8e7cff");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }

        // Avatars (grey box if avatar could not be loaded)
        const drawAvt = (img, x) => {
            if (img) ctx.drawImage(img, x, 170, 300, 300);
            else { ctx.fillStyle = "#cccccc"; ctx.fillRect(x, 170, 300, 300); }
        };
        drawAvt(imgAvt1, 120);
        drawAvt(imgAvt2, W - 420);

        fs.writeFileSync(pathImg, canvas.toBuffer());

        // Send message with your kawaii styled message below
        const kawaiiMessage = `
🌸💞 *Cᴏɴɢʀᴀᴛs* 💞🌸  
@${name1}  ＆ @${name2} ✨

💖 *Mᴀᴛᴄʜ Rᴀᴛᴇ:* ${matchRate}% 💖

🌷 𝓛𝓸𝓿𝓮𝓵𝔂 𝓝𝓸𝓽𝓮 🌷  
❝ ${lovelyNote}❞

💫 𝒀𝒐𝒖 𝒂𝒓𝒆 𝒎𝒚 𝒔𝒖𝒏𝒔𝒉𝒊𝒏𝒆! 💫
`;

        return api.sendMessage(
            {
                body: kawaiiMessage,
                mentions: [
                    { tag: name1, id: id1 },
                    { tag: name2, id: id2 }
                ],
                attachment: fs.createReadStream(pathImg),
            },
            event.threadID,
            () => { try { fs.unlinkSync(pathImg); } catch (e) {} },
            event.messageID
        );
    },
};
