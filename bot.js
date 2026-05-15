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
    if (fs.existsSync(ECONOMY_FILE)) return JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf-8"));
  } catch {}
  return {};
}

function saveEconomy(data) {
  fs.writeFileSync(ECONOMY_FILE, JSON.stringify(data, null, 2));
}

// ─── Fishing System ───────────────────────────────────────────────────────────
const FISH_DATABASE = [
  // Common Fish (50% catch rate)
  { id: 1, name: "Goldfish", rarity: "Common", color: "🟡", price: 10, chance: 0.15 },
  { id: 2, name: "Herring", rarity: "Common", color: "⚪", price: 12, chance: 0.12 },
  { id: 3, name: "Mackerel", rarity: "Common", color: "🔵", price: 15, chance: 0.10 },
  { id: 4, name: "Sardine", rarity: "Common", color: "⚪", price: 8, chance: 0.15 },
  { id: 5, name: "Anchovy", rarity: "Common", color: "⚪", price: 7, chance: 0.12 },
  { id: 6, name: "Minnow", rarity: "Common", color: "⚪", price: 5, chance: 0.18 },
  { id: 7, name: "Bass", rarity: "Common", color: "🟩", price: 20, chance: 0.08 },
  
  // Uncommon Fish (30% catch rate)
  { id: 8, name: "Salmon", rarity: "Uncommon", color: "🟧", price: 35, chance: 0.08 },
  { id: 9, name: "Trout", rarity: "Uncommon", color: "🟨", price: 40, chance: 0.07 },
  { id: 10, name: "Perch", rarity: "Uncommon", color: "🟧", price: 30, chance: 0.06 },
  { id: 11, name: "Pike", rarity: "Uncommon", color: "🟩", price: 45, chance: 0.05 },
  { id: 12, name: "Catfish", rarity: "Uncommon", color: "🟫", price: 35, chance: 0.06 },
  { id: 13, name: "Carp", rarity: "Uncommon", color: "🟨", price: 38, chance: 0.06 },
  { id: 14, name: "Flounder", rarity: "Uncommon", color: "🟦", price: 42, chance: 0.05 },
  
  // Rare Fish (12% catch rate)
  { id: 15, name: "Tuna", rarity: "Rare", color: "🔵", price: 75, chance: 0.04 },
  { id: 16, name: "Swordfish", rarity: "Rare", color: "🔷", price: 100, chance: 0.03 },
  { id: 17, name: "Marlin", rarity: "Rare", color: "🔷", price: 110, chance: 0.025 },
  { id: 18, name: "Snapper", rarity: "Rare", color: "🔴", price: 65, chance: 0.035 },
  { id: 19, name: "Grouper", rarity: "Rare", color: "🟫", price: 70, chance: 0.03 },
  { id: 20, name: "Halibut", rarity: "Rare", color: "⚪", price: 80, chance: 0.025 },
  { id: 21, name: "Monkfish", rarity: "Rare", color: "🟦", price: 90, chance: 0.02 },
  
  // Epic Fish (6% catch rate)
  { id: 22, name: "Dolphin Fish", rarity: "Epic", color: "🌊", price: 150, chance: 0.015 },
  { id: 23, name: "Kingfish", rarity: "Epic", color: "🟡", price: 160, chance: 0.015 },
  { id: 24, name: "Wahoo", rarity: "Epic", color: "🔵", price: 145, chance: 0.012 },
  { id: 25, name: "Lionfish", rarity: "Epic", color: "🔴", price: 155, chance: 0.010 },
  { id: 26, name: "Angelfish", rarity: "Epic", color: "🟨", price: 140, chance: 0.012 },
  { id: 27, name: "Pufferfish", rarity: "Epic", color: "🟡", price: 170, chance: 0.008 },
  { id: 28, name: "Moorish Idol", rarity: "Epic", color: "🟨", price: 165, chance: 0.010 },
  
  // Legendary Fish (2% catch rate)
  { id: 29, name: "Golden Koi", rarity: "Legendary", color: "🟧", price: 300, chance: 0.006 },
  { id: 30, name: "Dragon Fish", rarity: "Legendary", color: "🔴", price: 350, chance: 0.005 },
  { id: 31, name: "Phoenix Fish", rarity: "Legendary", color: "🧡", price: 320, chance: 0.005 },
  { id: 32, name: "Crystal Trout", rarity: "Legendary", color: "💎", price: 400, chance: 0.004 },
  { id: 33, name: "Shadow Bass", rarity: "Legendary", color: "🟪", price: 310, chance: 0.006 },
  { id: 34, name: "Silver Sturgeon", rarity: "Legendary", color: "⚪", price: 330, chance: 0.005 },
  { id: 35, name: "Electric Eel", rarity: "Legendary", color: "🟨", price: 280, chance: 0.006 },
  
  // Mythical Fish (0.5% catch rate)
  { id: 36, name: "Void Leviathan", rarity: "Mythical", color: "🟪", price: 1000, chance: 0.002 },
  { id: 37, name: "Celestial Whale", rarity: "Mythical", color: "💫", price: 950, chance: 0.002 },
  { id: 38, name: "Obsidian Serpent", rarity: "Mythical", color: "⬛", price: 900, chance: 0.0015 },
  { id: 39, name: "Radiant Sunfish", rarity: "Mythical", color: "☀️", price: 850, chance: 0.002 },
  { id: 40, name: "Twilight Manta", rarity: "Mythical", color: "🌙", price: 920, chance: 0.0015 },
  { id: 41, name: "Prismatic Seahorse", rarity: "Mythical", color: "🌈", price: 1100, chance: 0.001 },
  { id: 42, name: "Emerald Drake", rarity: "Mythical", color: "💚", price: 880, chance: 0.0015 },
  
  // Ultra Rare Variants (0.1% catch rate)
  { id: 43, name: "Quantum Goldfish", rarity: "Ultra Rare", color: "⚛️", price: 2000, chance: 0.0005 },
  { id: 44, name: "Cosmetic Carp", rarity: "Ultra Rare", color: "🌌", price: 1850, chance: 0.0005 },
  { id: 45, name: "Interdimensional Pike", rarity: "Ultra Rare", color: "🌀", price: 1950, chance: 0.0005 },
  { id: 46, name: "Temporal Trout", rarity: "Ultra Rare", color: "⏱️", price: 1800, chance: 0.0005 },
  { id: 47, name: "Astral Angelfish", rarity: "Ultra Rare", color: "✨", price: 2100, chance: 0.0003 },
  { id: 48, name: "Nebula Narwhal", rarity: "Ultra Rare", color: "🌠", price: 2200, chance: 0.0003 },
  { id: 49, name: "Infinity Flounder", rarity: "Ultra Rare", color: "♾️", price: 2500, chance: 0.0002 },
  { id: 50, name: "The Mythical One", rarity: "Ultra Rare", color: "👑", price: 5000, chance: 0.0001 },
];

const RARITY_COLORS = {
  "Common": "⚪",
  "Uncommon": "🟩",
  "Rare": "🔵",
  "Epic": "🟣",
  "Legendary": "🟡",
  "Mythical": "✨",
  "Ultra Rare": "💎",
};

function catchFish() {
  const random = Math.random();
  let accumulated = 0;
  
  for (const fish of FISH_DATABASE) {
    accumulated += fish.chance;
    if (random < accumulated) {
      return fish;
    }
  }
  
  // Fallback to a common fish
  return FISH_DATABASE[0];
}

function getUser(data, userId) {
  if (!data[userId]) data[userId] = { balance: 0, lastDaily: 0, streak: 0, multiplier: 1, inventory: {}, lastFish: 0 };
  return data[userId];
}

// ─── Shop ─────────────────────────────────────────────────────────────────────
const SHOP_ITEMS = {
  "2x":  { name: "2x Multiplier",  cost: 500,  multiplier: 2,  description: "Doubles your daily sincoins" },
  "3x":  { name: "3x Multiplier",  cost: 1500, multiplier: 3,  description: "Triples your daily sincoins" },
  "5x":  { name: "5x Multiplier",  cost: 3000, multiplier: 5,  description: "5x your daily sincoins" },
  "10x": { name: "10x Multiplier", cost: 8000, multiplier: 10, description: "10x your daily sincoins" },
};

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
        user.streak += 1;
        const bonus = user.streak * 50;
        const earned = Math.round((100 + bonus) * user.multiplier);
        user.balance += earned;
        user.lastDaily = now;
        saveEconomy(eco);
        const hoursLeft = Math.floor((fifteenHours - timeSinceLast) / 3600000);
        const minsLeft = Math.floor(((fifteenHours - timeSinceLast) % 3600000) / 60000);
        await send(ch, [`🔥 **Streak x${user.streak + 1}!** +${earned} sincoins (100 base + ${bonus} streak bonus${user.multiplier > 1 ? ` × ${user.multiplier}x multi` : ""})`, `💰 New balance: **${user.balance.toLocaleString()} sincoins**`, `⏰ Next bonus in **${hoursLeft}h ${minsLeft}m**`].join("\n"), token);
      } else {
        if (user.lastDaily !== 0) user.streak = 0;
        const earned = Math.round(100 * user.multiplier);
        user.balance += earned;
        user.lastDaily = now;
        saveEconomy(eco);
        await send(ch, [`✅ **Daily claimed!** +${earned} sincoins${user.multiplier > 1 ? ` (${user.multiplier}x multiplier!)` : ""}`, `💰 Balance: **${user.balance.toLocaleString()} sincoins**`, `💡 Use \`${PREFIX}daily\` again within 15 hours for a streak bonus!`].join("\n"), token);
      }
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

    case "owner": {
      if (msg.author.id !== OWNER_ID) {
        await send(ch, "This command is owner only.", token);
        break;
      }
      await send(ch, "Hello, owner! You have access to this command.", token);
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
      user.lastFish = now;
      saveEconomy(eco);
      
      const fishEmoji = caughtFish.color;
      const rarityEmoji = RARITY_COLORS[caughtFish.rarity] || "❓";
      
      await send(ch, `${fishEmoji} **You caught a ${caughtFish.rarity} ${caughtFish.name}!** ${rarityEmoji}\n💰 Worth **${caughtFish.price.toLocaleString()} sincoins**\n📊 You now have **${user.inventory[caughtFish.id]}** ${caughtFish.name}(s)`, token);
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
      saveEconomy(eco);
      
      const pluralS = quantity > 1 ? "s" : "";
      await send(ch, `${fish.color} **Sold ${quantity}x ${fish.name}${pluralS}** for **${totalValue.toLocaleString()} sincoins**!\n💰 New balance: **${user.balance.toLocaleString()} sincoins**`, token);
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