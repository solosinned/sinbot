import WebSocket from "ws";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_BASE = "https://hummus.sys42.net/api/v6";
const GATEWAY_URL = "wss://hummus-gateway.sys42.net/?encoding=json&v=6";

// ─── Config (set these as environment variables on Railway) ───────────────────
const EMAIL = process.env.BOT_EMAIL ?? "";
const PASSWORD = process.env.BOT_PASSWORD ?? "";
const PREFIX = process.env.BOT_PREFIX ?? "s!";
const AUTO_REPLY = process.env.BOT_AUTO_REPLY === "true";
const AUTO_REPLY_MESSAGE = process.env.BOT_AUTO_REPLY_MESSAGE ?? "Hello! I'm a bot.";
const OWNER_ID = process.env.OWNER_ID ?? "";

// ─── OpenAI (set OPENAI_API_KEY on Railway) ───────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Economy storage ──────────────────────────────────────────────────────────
const ECONOMY_FILE = path.join(__dirname, "economy.json");

function loadEconomy() {
  try {
    const data = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf-8"));
    // Convert arrays back to Sets
    for (const userId in data) {
      if (data[userId].earnedAchievements) data[userId].earnedAchievements = new Set(data[userId].earnedAchievements);
      if (data[userId].claimedAchievements) data[userId].claimedAchievements = new Set(data[userId].claimedAchievements);
    }
    return data;
  } catch {}
  return {};
}

function saveEconomy(data) {
  const toSave = {};
  for (const userId in data) {
    toSave[userId] = { ...data[userId] };
    if (toSave[userId].earnedAchievements) toSave[userId].earnedAchievements = Array.from(toSave[userId].earnedAchievements);
    if (toSave[userId].claimedAchievements) toSave[userId].claimedAchievements = Array.from(toSave[userId].claimedAchievements);
  }
  fs.writeFileSync(ECONOMY_FILE, JSON.stringify(toSave, null, 2));
}

function getUser(data, userId) {
  if (!data[userId]) data[userId] = { balance: 0, lastDaily: 0, streak: 0, multiplier: 1, inventory: {}, lastFish: 0, totalCaught: 0, totalSoldValue: 0, earnedAchievements: new Set(), claimedAchievements: new Set(), rareCaught: false, mythicalCaught: false, ultraRareCaught: false };
  return data[userId];
}

// ─── Shop ─────────────────────────────────────────────────────────────────────
const SHOP_ITEMS = {
  "2x":  { name: "2x Multiplier",  cost: 500,  multiplier: 2,  description: "Doubles your daily sincoins" },
  "3x":  { name: "3x Multiplier",  cost: 1500, multiplier: 3,  description: "Triples your daily sincoins" },
  "5x":  { name: "5x Multiplier",  cost: 3000, multiplier: 5,  description: "5x your daily sincoins" },
  "10x": { name: "10x Multiplier", cost: 8000, multiplier: 10, description: "10x your daily sincoins" },
};

// ─── Achievements ─────────────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id: 1, name: "First Fish", description: "Catch your first fish", condition: (user) => user.totalCaught >= 1, reward: { type: "coins", amount: 100 } },
  { id: 2, name: "Fisherman", description: "Catch 10 fish", condition: (user) => user.totalCaught >= 10, reward: { type: "coins", amount: 500 } },
  { id: 3, name: "Master Angler", description: "Catch 50 fish", condition: (user) => user.totalCaught >= 50, reward: { type: "coins", amount: 2000 } },
  { id: 4, name: "Daily Devotee", description: "Claim daily 7 times in a row", condition: (user) => user.streak >= 7, reward: { type: "multiplier", amount: 2 } },
  { id: 5, name: "Big Seller", description: "Sell fish worth 1000 sincoins total", condition: (user) => user.totalSoldValue >= 1000, reward: { type: "coins", amount: 1000 } },
  { id: 6, name: "Wealthy Trader", description: "Sell fish worth 5000 sincoins total", condition: (user) => user.totalSoldValue >= 5000, reward: { type: "coins", amount: 2500 } },
  { id: 7, name: "Streak Master", description: "Reach a 30-day daily streak", condition: (user) => user.streak >= 30, reward: { type: "multiplier", amount: 5 } },
  { id: 8, name: "Rare Catch", description: "Catch a Rare or higher fish", condition: (user) => user.rareCaught, reward: { type: "coins", amount: 1500 } },
  { id: 9, name: "Mythical Hunter", description: "Catch a Mythical fish", condition: (user) => user.mythicalCaught, reward: { type: "coins", amount: 5000 } },
  { id: 10, name: "Ultra Rare Legend", description: "Catch an Ultra Rare fish", condition: (user) => user.ultraRareCaught, reward: { type: "multiplier", amount: 10 } },
];

function checkAchievements(user) {
  const newAchievements = [];
  for (const ach of ACHIEVEMENTS) {
    if (!user.earnedAchievements.has(ach.id) && ach.condition(user)) {
      user.earnedAchievements.add(ach.id);
      newAchievements.push(ach);
    }
  }
  return newAchievements;
}

// ─── Presence tracking ────────────────────────────────────────────────────────
const presenceMap = new Map();

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function apiRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const url = new URL(`${API_BASE}${urlPath}`);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: token } : {}),
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Mention parsing ──────────────────────────────────────────────────────────
function parseMention(text) {
  const match = text.match(/^<@!?(\d+)>$/);
  return match ? match[1] : null;
}

function getMentionedId(args) {
  for (const arg of args) { const id = parseMention(arg.trim()); if (id) return id; }
  return null;
}

// ─── Calculator ───────────────────────────────────────────────────────────────
function calculate(expr) {
  let cleaned = expr.replace(/[×x]/gi, "*").replace(/÷/g, "/").replace(/\^/g, "**").replace(/[^0-9+\-*/().\s*]/g, "");
  if (!cleaned.trim()) return "Invalid expression.";
  try {
    const result = Function(`"use strict"; return (${cleaned})`)();
    if (!isFinite(result)) return "Result is undefined (e.g. divide by zero).";
    const rounded = Math.round(result * 1e10) / 1e10;
    return `${expr.replace(/[×x]/gi, "×").replace(/\^/g, "^")} = **${rounded}**`;
  } catch { return "Could not calculate that expression."; }
}

const FRIEND_RESPONSES = {
  kryy: "kryy? fuck that guy",
  acid: "acid? fuck that guy",
  teto: "teto? fuck that guy",
  wil: "wil? i lovee him",
  hbn: "hbn? talking about my husband?",
  beatrice: "beatrice? sounds like a femboy",
  dark: "dark? another femboy i presume..",
  frosty: "frosty? dont even joke lad.",
  orion: "orion? hes so auraful",
  stormi: "stormi? also so auraful",
  pizzard: "pizzard? pizza.",
};

function getFriendResponse(text) {
  const normalized = text.toLowerCase();
  for (const [name, response] of Object.entries(FRIEND_RESPONSES)) {
    const regex = new RegExp(`\\b${name}\\b`, "i");
    if (regex.test(normalized)) return response;
  }
  return null;
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function login() {
  if (!EMAIL || !PASSWORD) { console.error("Error: BOT_EMAIL and BOT_PASSWORD must be set."); process.exit(1); }
  const res = await apiRequest("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  if (!res.token) { console.error("Login failed:", res.message ?? JSON.stringify(res)); process.exit(1); }
  return res.token;
}

// ─── Send message ─────────────────────────────────────────────────────────────
async function send(channelId, content, token) {
  await apiRequest("POST", `/channels/${channelId}/messages`, { content }, token);
}

// ─── Command handlers ─────────────────────────────────────────────────────────
async function handleCommand(name, args, msg, token) {
  const ch = msg.channel_id;

  switch (name) {
    case "ping":
      await send(ch, "Pong! 🏓", token);
      break;

    case "help":
      await send(ch, [
        `**Sinbot Commands** | Prefix: \`${PREFIX}\``,
        "",
        "**General**",
        `\`${PREFIX}ping\` — Check if the bot is alive`,
        `\`${PREFIX}help\` — Show this message`,
        `\`${PREFIX}info\` — Bot info`,
        "",
        "**Tools**",
        `\`${PREFIX}calc <expression>\` — Calculate math (e.g. \`${PREFIX}calc 5x3\`)`,
        `\`${PREFIX}fakeban @user\` — Pretend to ban someone`,
        `\`${PREFIX}status @user\` — Check if a user is online`,
        `\`${PREFIX}ai <question>\` — Ask the AI anything`,
        "",
        "**Economy**",
        `\`${PREFIX}daily\` — Claim your daily sincoins`,
        `\`${PREFIX}balance\` — Check your sincoins`,
        `\`${PREFIX}shop\` — Browse the shop`,
        `\`${PREFIX}buy <item>\` — Buy an item (e.g. \`${PREFIX}buy 2x\`)`,
        "",
        "**Achievements**",
        `\`${PREFIX}achievements\` — View your achievements`,
        `\`${PREFIX}claim <id>\` — Claim achievement rewards`,
        "",
        "**Fishing**",
        `\`${PREFIX}fish\` — Catch a random fish (20s cooldown)`,
        `\`${PREFIX}inventory\` — View your caught fish`,
        `\`${PREFIX}sell <fish_id>\` — Sell a fish (e.g. \`${PREFIX}sell 1\`)`,
        "",
        "**Owner**",
        `\`${PREFIX}owner\` — Owner only command`,
      ].join("\n"), token);
      break;

    case "info":
      await send(ch, `Sinbot is running | Prefix: \`${PREFIX}\` | Auto-reply: ${AUTO_REPLY}`, token);
      break;

    case "calc":
    case "calculate": {
      const expr = args.join(" ");
      if (!expr) { await send(ch, `Usage: \`${PREFIX}calc 5x3\``, token); break; }
      await send(ch, calculate(expr), token);
      break;
    }

    case "fakeban":
    case "ban": {
      const targetId = getMentionedId(args);
      const targetName = targetId ? (msg.mentions.find((m) => m.id === targetId)?.username ?? `<@${targetId}>`) : args.join(" ") || "that user";
      const mention = targetId ? `<@${targetId}>` : targetName;
      await send(ch, `🔨 **${mention}** has been banned from the server.\n> *Reason: violating community rules.*`, token);
      break;
    }

    case "status":
    case "online": {
      const targetId = getMentionedId(args);
      if (!targetId) { await send(ch, `Usage: \`${PREFIX}status @user\``, token); break; }
      const status = presenceMap.get(targetId);
      const targetName = msg.mentions.find((m) => m.id === targetId)?.username ?? `<@${targetId}>`;
      if (!status) {
        await send(ch, `❓ No presence data for **${targetName}** yet.`, token);
      } else {
        const emoji = { online: "🟢", idle: "🟡", dnd: "🔴", offline: "⚫", invisible: "⚫" };
        await send(ch, `${emoji[status] ?? "❓"} **${targetName}** is actually **${status}**.`, token);
      }
      break;
    }

    case "ai":
    case "ask": {
      const question = args.join(" ");
      if (!question) { await send(ch, `Usage: \`${PREFIX}ai <question>\``, token); break; }
      await send(ch, "🤔 Thinking...", token);
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 500,
          messages: [
            { role: "system", content: "You are a helpful assistant in a chat app. Keep responses concise and under 1800 characters. Use plain text, no markdown headers." },
            { role: "user", content: question },
          ],
        });
        const answer = response.choices[0]?.message?.content ?? "I couldn't generate a response.";
        await send(ch, `**Q: ${question}**\n\n${answer}`, token);
      } catch (err) {
        await send(ch, `❌ AI error: ${err.message}`, token);
      }
      break;
    }

    case "balance":
    case "bal":
    case "coins": {
      const eco = loadEconomy();
      const user = getUser(eco, msg.author.id);
      const mult = user.multiplier > 1 ? ` (${user.multiplier}x multiplier active)` : "";
      await send(ch, `💰 **${msg.author.username}** has **${user.balance.toLocaleString()} sincoins**${mult}`, token);
      break;
    }

    case "daily": {
      const eco = loadEconomy();
      const user = getUser(eco, msg.author.id);
      const now = Date.now();
      const fifteenHours = 15 * 60 * 60 * 1000;
      const timeSinceLast = now - user.lastDaily;
      if (timeSinceLast < fifteenHours) {
        const hoursLeft = Math.floor((fifteenHours - timeSinceLast) / 3600000);
        const minsLeft = Math.floor(((fifteenHours - timeSinceLast) % 3600000) / 60000);
        await send(ch, `⏰ You can claim your daily again in **${hoursLeft}h ${minsLeft}m**.`, token);
        break;
      }
      // Can claim
      const streakWindow = 24 * 60 * 60 * 1000; // 24 hours for streak maintenance
      if (user.lastDaily === 0 || timeSinceLast > streakWindow) {
        user.streak = 0;
      }
      user.streak += 1;
      const bonus = user.streak * 50;
      const earned = Math.round((100 + bonus) * user.multiplier);
      user.balance += earned;
      user.lastDaily = now;
      saveEconomy(eco);
      const newAchievements = checkAchievements(user);
      saveEconomy(eco); // Save again if achievements changed
      let message = [`✅ **Daily claimed!** +${earned} sincoins (100 base + ${bonus} streak bonus${user.multiplier > 1 ? ` × ${user.multiplier}x multi` : ""})`, `🔥 Streak: **${user.streak}**`, `💰 Balance: **${user.balance.toLocaleString()} sincoins**`, `⏰ Next claim in 15 hours!`];
      if (newAchievements.length > 0) {
        message.push(`🏆 **New Achievement(s)!** ${newAchievements.map(a => a.name).join(", ")}`);
      }
      await send(ch, message.join("\n"), token);
      break;
    }

    case "shop": {
      const eco = loadEconomy();
      const user = getUser(eco, msg.author.id);
      await send(ch, [`🛒 **Sincoin Shop** | Balance: **${user.balance.toLocaleString()} sincoins**`, "", ...Object.entries(SHOP_ITEMS).map(([key, item]) => `\`${PREFIX}buy ${key}\` — **${item.name}** — ${item.cost.toLocaleString()} sincoins\n  › ${item.description}`), "", `*Multipliers affect \`${PREFIX}daily\` earnings.*`].join("\n"), token);
      break;
    }

    case "buy": {
      const itemKey = args[0]?.toLowerCase();
      if (!itemKey || !SHOP_ITEMS[itemKey]) { await send(ch, `❌ Unknown item. Use \`${PREFIX}shop\` to see available items.`, token); break; }
      const item = SHOP_ITEMS[itemKey];
      const eco = loadEconomy();
      const user = getUser(eco, msg.author.id);
      if (user.balance < item.cost) { await send(ch, `❌ You need **${item.cost.toLocaleString()} sincoins** but only have **${user.balance.toLocaleString()}**.`, token); break; }
      user.balance -= item.cost;
      user.multiplier = item.multiplier;
      saveEconomy(eco);
      await send(ch, [`✅ Purchased **${item.name}**!`, `💰 Remaining balance: **${user.balance.toLocaleString()} sincoins**`, `🚀 Your daily earnings are now **${item.multiplier}x**!`].join("\n"), token);
      break;
    }

    case "achievements":
    case "ach": {
      const eco = loadEconomy();
      const user = getUser(eco, msg.author.id);
      const lines = [`🏆 **${msg.author.username}'s Achievements**`, ""];
      let earnedCount = 0;
      for (const ach of ACHIEVEMENTS) {
        const earned = user.earnedAchievements.has(ach.id);
        const claimed = user.claimedAchievements.has(ach.id);
        const status = earned ? (claimed ? "✅ Claimed" : "🏆 Earned") : "❓ Not Earned";
        lines.push(`${status} **${ach.name}** - ${ach.description}`);
        if (earned) earnedCount++;
      }
      lines.push("");
      lines.push(`**Progress:** ${earnedCount}/${ACHIEVEMENTS.length} achievements earned`);
      lines.push(`💡 Use \`${PREFIX}claim <id>\` to claim rewards for earned achievements!`);
      await send(ch, lines.join("\n"), token);
      break;
    }

    case "claim": {
      const achId = parseInt(args[0]);
      if (!achId || isNaN(achId)) {
        await send(ch, `Usage: \`${PREFIX}claim <achievement_id>\`\nUse \`${PREFIX}achievements\` to see IDs.`, token);
        break;
      }
      const ach = ACHIEVEMENTS.find(a => a.id === achId);
      if (!ach) {
        await send(ch, `❌ Achievement ID **${achId}** doesn't exist!`, token);
        break;
      }
      const eco = loadEconomy();
      const user = getUser(eco, msg.author.id);
      if (!user.earnedAchievements.has(achId)) {
        await send(ch, `❌ You haven't earned **${ach.name}** yet!`, token);
        break;
      }
      if (user.claimedAchievements.has(achId)) {
        await send(ch, `❌ You already claimed the reward for **${ach.name}**!`, token);
        break;
      }
      user.claimedAchievements.add(achId);
      if (ach.reward.type === "coins") {
        user.balance += ach.reward.amount;
        await send(ch, `✅ Claimed reward for **${ach.name}**! +${ach.reward.amount.toLocaleString()} sincoins\n💰 New balance: **${user.balance.toLocaleString()} sincoins**`, token);
      } else if (ach.reward.type === "multiplier") {
        user.multiplier = Math.max(user.multiplier, ach.reward.amount);
        await send(ch, `✅ Claimed reward for **${ach.name}**! Multiplier upgraded to **${user.multiplier}x**!`, token);
      }
      saveEconomy(eco);
      break;
    }

    case "fish": {
      const eco = loadEconomy();
      const user = getUser(eco, msg.author.id);
      const now = Date.now();
      const cooldown = 20 * 1000;
      const timeSinceLastFish = now - user.lastFish;
      
      if (timeSinceLastFish < cooldown) {
        const secondsLeft = Math.ceil((cooldown - timeSinceLastFish) / 1000);
        await send(ch, `⏳ You need to wait **${secondsLeft}** more seconds before fishing again!`, token);
        break;
      }
      
      const caughtFish = catchFish();
      if (!user.inventory) user.inventory = {};
      if (!user.inventory[caughtFish.id]) user.inventory[caughtFish.id] = 0;
      user.inventory[caughtFish.id] += 1;
      user.totalCaught += 1;
      user.lastFish = now;
      
      // Check rarity
      const rarity = caughtFish.rarity;
      if (rarity === "Rare" || rarity === "Epic" || rarity === "Legendary" || rarity === "Mythical" || rarity === "Ultra Rare") {
        if (rarity === "Rare" || rarity === "Epic") user.rareCaught = true;
        if (rarity === "Mythical") user.mythicalCaught = true;
        if (rarity === "Ultra Rare") user.ultraRareCaught = true;
      }
      
      saveEconomy(eco);
      const newAchievements = checkAchievements(user);
      saveEconomy(eco);
      
      const fishEmoji = caughtFish.color;
      const rarityEmoji = RARITY_COLORS[caughtFish.rarity] || "❓";
      
      let message = `${fishEmoji} **You caught a ${caughtFish.rarity} ${caughtFish.name}!** ${rarityEmoji}\n💰 Worth **${caughtFish.price.toLocaleString()} sincoins**\n📊 You now have **${user.inventory[caughtFish.id]}** ${caughtFish.name}(s)`;
      if (newAchievements.length > 0) {
        message += `\n🏆 **New Achievement(s)!** ${newAchievements.map(a => a.name).join(", ")}`;
      }
      await send(ch, message, token);
      break;
    }

    case "inventory":
    case "inv": {
      const eco = loadEconomy();
      const user = getUser(eco, msg.author.id);
      
      if (!user.inventory || Object.keys(user.inventory).length === 0) {
        await send(ch, `🎣 **${msg.author.username}'s Fishing Inventory** is empty! Go catch some fish with \`${PREFIX}fish\`!`, token);
        break;
      }
      
      const lines = [`🎣 **${msg.author.username}'s Fishing Inventory**`, ""];
      let totalValue = 0;
      
      for (const [fishId, count] of Object.entries(user.inventory)) {
        const fish = FISH_DATABASE.find(f => f.id === parseInt(fishId));
        if (fish && count > 0) {
          const value = fish.price * count;
          totalValue += value;
          const rarityEmoji = RARITY_COLORS[fish.rarity] || "❓";
          lines.push(`${fish.color} **${fish.name}** (ID: ${fishId}) ${rarityEmoji}\n   └ Qty: ${count} × ${fish.price.toLocaleString()} = **${value.toLocaleString()}** sincoins`);
        }
      }
      
      lines.push("");
      lines.push(`💰 **Total Inventory Value:** ${totalValue.toLocaleString()} sincoins`);
      lines.push(`💡 Use \`${PREFIX}sell <fish_id>\` to sell a fish!`);
      
      await send(ch, lines.join("\n"), token);
      break;
    }

    case "sell": {
      const fishId = parseInt(args[0]);
      if (!fishId || isNaN(fishId)) {
        await send(ch, `Usage: \`${PREFIX}sell <fish_id>\` (e.g. \`${PREFIX}sell 1\`)\nUse \`${PREFIX}inventory\` to see your fish IDs.`, token);
        break;
      }
      
      const fish = FISH_DATABASE.find(f => f.id === fishId);
      if (!fish) {
        await send(ch, `❌ Fish ID **${fishId}** doesn't exist!`, token);
        break;
      }
      
      const eco = loadEconomy();
      const user = getUser(eco, msg.author.id);
      
      if (!user.inventory || !user.inventory[fishId] || user.inventory[fishId] <= 0) {
        await send(ch, `❌ You don't have any **${fish.name}**!`, token);
        break;
      }
      
      const quantity = parseInt(args[1]) || 1;
      if (quantity > user.inventory[fishId]) {
        await send(ch, `❌ You only have **${user.inventory[fishId]}** ${fish.name}(s)!`, token);
        break;
      }
      
      const totalValue = fish.price * quantity;
      user.inventory[fishId] -= quantity;
      if (user.inventory[fishId] <= 0) delete user.inventory[fishId];
      user.balance += totalValue;
      user.totalSoldValue += totalValue;
      saveEconomy(eco);
      const newAchievements = checkAchievements(user);
      saveEconomy(eco);
      
      const pluralS = quantity > 1 ? "s" : "";
      let message = `${fish.color} **Sold ${quantity}x ${fish.name}${pluralS}** for **${totalValue.toLocaleString()} sincoins**!\n💰 New balance: **${user.balance.toLocaleString()} sincoins**`;
      if (newAchievements.length > 0) {
        message += `\n🏆 **New Achievement(s)!** ${newAchievements.map(a => a.name).join(", ")}`;
      }
      await send(ch, message, token);
      break;
    }

    case "owner": {
      if (msg.author.id !== OWNER_ID) {
        await send(ch, "This command is owner only.", token);
        break;
      }
      await send(ch, "Hello, owner! You have access to this command.", token);
      break;
    }
  }
}

// ─── Bot ──────────────────────────────────────────────────────────────────────
async function startBot(token, selfId) {
  let heartbeatInterval = null;
  let sequence = null;
  let reconnectDelay = 1000;

  function connect() {
    console.log("[Gateway] Connecting...");
    const ws = new WebSocket(GATEWAY_URL, { headers: { Origin: "https://hmus.sys42.net" } });

    ws.on("open", () => { console.log("[Gateway] Connected"); reconnectDelay = 1000; });

    ws.on("message", async (raw) => {
      const payload = JSON.parse(raw.toString());
      if (payload.s != null) sequence = payload.s;

      switch (payload.op) {
        case 10: {
          const { heartbeat_interval } = payload.d;
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          heartbeatInterval = setInterval(() => ws.send(JSON.stringify({ op: 1, d: sequence })), heartbeat_interval);
          ws.send(JSON.stringify({ op: 2, d: { token, properties: { $os: "linux", $browser: "sinbot", $device: "sinbot" }, presence: { status: "online", activities: [{ name: `${PREFIX}help`, type: 0 }], afk: false } } }));
          break;
        }
        case 0: {
          const { t, d } = payload;
          if (t === "READY") {
            console.log(`[Bot] Logged in as ${d.user.username} (${d.user.id})`);
            console.log(`[Bot] Prefix: "${PREFIX}" | Subscribing to ${d.guilds.length} guild(s)...`);
            for (const guild of d.guilds) {
              ws.send(JSON.stringify({ op: 14, d: { guild_id: guild.id, typing: true, activities: true, threads: true, members: [] } }));
            }
          }
          if (t === "PRESENCE_UPDATE" && d.user?.id && d.status) presenceMap.set(d.user.id, d.status);
          if (t === "GUILD_CREATE") for (const p of d.presences ?? []) { if (p.user?.id && p.status) presenceMap.set(p.user.id, p.status); }
          if (t === "MESSAGE_CREATE") {
            const msg = d;
            const content = (msg.content ?? "").trim();
            console.log(`[Message] ${msg.author.username}: ${content || "(empty)"}`);
            if (msg.author.id === selfId) {
              if (content.startsWith(PREFIX)) {
                const withoutPrefix = content.slice(PREFIX.length).trim();
                if (!withoutPrefix) return;
                const [cmdName, ...args] = withoutPrefix.split(/\s+/);
                console.log(`[Self Cmd] ${cmdName}`);
                await handleCommand(cmdName.toLowerCase(), args, msg, token);
              }
              return;
            }
            if (content.startsWith(PREFIX)) {
              const withoutPrefix = content.slice(PREFIX.length).trim();
              if (!withoutPrefix) return;
              const [cmdName, ...args] = withoutPrefix.split(/\s+/);
              console.log(`[Cmd] ${cmdName}`);
              await handleCommand(cmdName.toLowerCase(), args, msg, token);
              return;
            }

            if (!msg.author.bot) {
              const friendReply = getFriendResponse(content);
              if (friendReply) {
                await send(msg.channel_id, friendReply, token);
                return;
              }
            }

            if (AUTO_REPLY && !msg.author.bot) await send(msg.channel_id, AUTO_REPLY_MESSAGE, token);
          }
          break;
        }
        case 7: ws.close(); break;
        case 9: setTimeout(connect, 5000); break;
      }
    });

    ws.on("close", (code) => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      console.log(`[Gateway] Disconnected (${code}). Reconnecting in ${reconnectDelay / 1000}s...`);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    });

    ws.on("error", (err) => console.error("[Gateway] Error:", err.message));
  }

  connect();
}

// ─── Entry ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Sinbot ===");
  const token = await login();
  const me = await apiRequest("GET", "/users/@me", undefined, token);
  console.log(`Authenticated as: ${me.username} (${me.id})`);
  await startBot(token, me.id);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });