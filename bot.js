// @ts-nocheck
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
const PREFIX = process.env.BOT_PREFIX ?? "s.";
const AUTO_REPLY = process.env.BOT_AUTO_REPLY === "true";
const AUTO_REPLY_MESSAGE = process.env.BOT_AUTO_REPLY_MESSAGE ?? "Hello! I'm a bot.";
const OWNER_ID = process.env.OWNER_ID ?? "";
const AUTO_ROLE_ID = process.env.AUTO_ROLE_ID ?? "";
let BOT_USER_ID = "";

// ─── Helper functions ──────────────────────────────────────────────────────────
function isOwner(userId) {
  return Boolean(userId) && (userId === OWNER_ID || userId === BOT_USER_ID);
}
function isDevUser(userId, eco) {
  if (isOwner(userId)) return true;
  if (!eco || !eco[userId]) return false;
  return eco[userId].whitelisted === true;
}

// ─── OpenAI setup ─────────────────────────────────────────────────────────────
let _openai = null;
function getOpenAI() {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return null;
  _openai = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  return _openai;
}

// ─── Economy storage ──────────────────────────────────────────────────────────
const ECONOMY_FILE = path.join(__dirname, "economy.json");
const ALT_PREFIX = "s.";
const FISH_COOLDOWN_MS = 20 * 1000;
const WORK_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const WORK_JOBS = [
  { name: "Street Musician", description: "You played guitar on the corner and collected tips.", minPay: 80, maxPay: 200 },
  { name: "Pizza Delivery Driver", description: "You delivered 12 pizzas across town, some tips were generous.", minPay: 150, maxPay: 350 },
  { name: "Freelance Programmer", description: "You fixed a bug for a client and got paid.", minPay: 300, maxPay: 700 },
  { name: "Dog Walker", description: "You walked 6 dogs through the park. One escaped briefly.", minPay: 60, maxPay: 180 },
  { name: "Security Guard", description: "You stood at a door and looked intimidating all night.", minPay: 200, maxPay: 400 },
  { name: "Twitch Streamer", description: "You streamed for 4 hours and got a few donations.", minPay: 50, maxPay: 600 },
  { name: "Barista", description: "You made lattes and foam art all morning.", minPay: 100, maxPay: 250 },
  { name: "Stock Trader", description: "You made a risky trade. It paid off... this time.", minPay: 100, maxPay: 900 },
  { name: "Anime Artist", description: "You drew commissions for fans online.", minPay: 200, maxPay: 550 },
  { name: "Sushi Chef", description: "You rolled sushi at a busy restaurant all evening.", minPay: 180, maxPay: 380 },
  { name: "Bounty Hunter", description: "You tracked down a target and collected the reward.", minPay: 400, maxPay: 900 },
  { name: "Treasure Hunter", description: "You dug around an old site and found something valuable.", minPay: 250, maxPay: 1100 },
  { name: "Ninja Assassin", description: "You completed a covert mission for a mysterious client.", minPay: 600, maxPay: 1400 },
  { name: "Mechanic", description: "You repaired someone's car and they tipped well.", minPay: 200, maxPay: 500 },
  { name: "Librarian", description: "You sorted books and helped a few confused students.", minPay: 70, maxPay: 180 },
  { name: "Pharmacist", description: "You filled prescriptions and gave solid advice.", minPay: 300, maxPay: 600 },
  { name: "Dungeon Master", description: "You ran a D&D session for a full party. They tipped in gold.", minPay: 120, maxPay: 350 },
  { name: "Crypto Degen", description: "You stared at charts all day. Green candles only today.", minPay: 0, maxPay: 1500 },
  { name: "Mercenary", description: "You took a dangerous job and survived. Barely.", minPay: 500, maxPay: 1200 },
  { name: "Taxi Driver", description: "You drove strangers around the city all shift.", minPay: 100, maxPay: 300 },
];

const FISH_RARITY_BOOST = {
  common: 0,
  uncommon: 0.25,
  rare: 0.75,
  epic: 1.5,
  legendary: 3,
};

const JOKES = [
  "Why don't scientists trust atoms? Because they make up everything!",
  "What do you call a fish wearing a bowtie? So-fish-ticated!",
  "Why did the scarecrow win an award? He was outstanding in his field!",
  "What do you call a bear with no teeth? A gummy bear!",
  "Why don't eggs tell jokes? They'd crack each other up!",
  "What did the ocean say to the beach? Nothing, it just waved!",
  "Why did the coffee file a police report? It got mugged!",
  "How do you organize a space party? You planet!",
  "What do you call a sleeping bull? A dozer!",
  "Why did the math book look sad? Because it had too many problems!",
  "What did one wall say to the other wall? I'll meet you at the corner!",
  "Why don't skeletons fight each other? They don't have the guts!",
  "What do you call a dinosaur that crashes his car? Tyrannosaurus Wrecks!",
  "Why did the chicken cross the road? To prove it wasn't a coward!",
  "What's orange and sounds like a parrot? A carrot!",
  "Why did the kid bring a ladder to school? Because he wanted to go to high school!",
  "What do you call a pig that does karate? A pork chop!",
  "Why is there a door in the middle of the road? Because it's a road house!",
  "What did the one candle say to the other? Don't birthdays just burn you up?",
  "Why don't you ever see elephants hiding in trees? Because they're so good at it!",
];

const ACHIEVEMENTS = {
  first_fish: { name: "First Catch", description: "Catch your first fish." },
  first_sell: { name: "First Sale", description: "Sell a fish or item for the first time." },
  box_opener: { name: "Box Opener", description: "Open your first lootbox." },
  fish_master: { name: "Fish Master", description: "Catch a rare or better fish." },
  collector: { name: "Collector", description: "Collect 5 different anime items." },
  rich_1k: { name: "One Thousand", description: "Reach 1,000 sincoins." },
  follow_friend: { name: "Follower", description: "Follow another user." },
};

const FISH_ITEMS = [
  { name: "Blue Minnow", rarity: "common", price: 15, weight: 35 },
  { name: "River Perch", rarity: "common", price: 20, weight: 34 },
  { name: "Pond Sunfish", rarity: "common", price: 18, weight: 33 },
  { name: "Silver Shiner", rarity: "common", price: 22, weight: 32 },
  { name: "Brown Bullhead", rarity: "common", price: 24, weight: 31 },
  { name: "Grass Carp", rarity: "common", price: 28, weight: 30 },
  { name: "Stream Chub", rarity: "common", price: 16, weight: 29 },
  { name: "Crappie", rarity: "common", price: 26, weight: 28 },
  { name: "Whitefish", rarity: "common", price: 30, weight: 27 },
  { name: "Mudcat", rarity: "common", price: 21, weight: 26 },
  { name: "Sucker", rarity: "common", price: 19, weight: 25 },
  { name: "Redfin", rarity: "common", price: 23, weight: 24 },
  { name: "Shad", rarity: "common", price: 17, weight: 23 },
  { name: "Dace", rarity: "common", price: 20, weight: 22 },
  { name: "Gudgeon", rarity: "common", price: 14, weight: 21 },
  { name: "Stream Trout", rarity: "common", price: 34, weight: 20 },
  { name: "Pond Catfish", rarity: "common", price: 32, weight: 19 },
  { name: "Bluegill", rarity: "common", price: 18, weight: 18 },
  { name: "Smallmouth Bass", rarity: "common", price: 38, weight: 17 },
  { name: "Golden Dace", rarity: "common", price: 40, weight: 16 },
  { name: "Rainbow Trout", rarity: "uncommon", price: 70, weight: 15 },
  { name: "Silver Pike", rarity: "uncommon", price: 82, weight: 14 },
  { name: "Lake Eel", rarity: "uncommon", price: 94, weight: 13 },
  { name: "Crimson Koi", rarity: "uncommon", price: 88, weight: 12 },
  { name: "Mirror Carp", rarity: "uncommon", price: 65, weight: 11 },
  { name: "Black Bullhead", rarity: "uncommon", price: 75, weight: 10 },
  { name: "Mudfish", rarity: "uncommon", price: 80, weight: 9 },
  { name: "Tiger Trout", rarity: "uncommon", price: 90, weight: 8 },
  { name: "Crystal Char", rarity: "uncommon", price: 100, weight: 7 },
  { name: "Sunset Salmon", rarity: "uncommon", price: 110, weight: 6 },
  { name: "King Salmon", rarity: "rare", price: 160, weight: 5 },
  { name: "Moonlight Carp", rarity: "rare", price: 180, weight: 4.5 },
  { name: "Azure Sturgeon", rarity: "rare", price: 200, weight: 4 },
  { name: "Nightmare Eel", rarity: "rare", price: 220, weight: 3.5 },
  { name: "Phantom Perch", rarity: "rare", price: 240, weight: 3 },
  { name: "Golden Koi", rarity: "rare", price: 260, weight: 2.5 },
  { name: "Storm Bass", rarity: "rare", price: 280, weight: 2 },
  { name: "Frost Pike", rarity: "rare", price: 300, weight: 1.7 },
  { name: "Celestial Trout", rarity: "rare", price: 320, weight: 1.5 },
  { name: "Void Wyrm", rarity: "epic", price: 450, weight: 1.2 },
  { name: "Aurora Salmon", rarity: "epic", price: 480, weight: 1.0 },
  { name: "Thunder Carp", rarity: "epic", price: 520, weight: 0.8 },
  { name: "Dragon Pike", rarity: "epic", price: 560, weight: 0.6 },
  { name: "Sunflare Grouper", rarity: "epic", price: 600, weight: 0.5 },
  { name: "Legendary Leviathan", rarity: "legendary", price: 1200, weight: 0.2 },
  { name: "Mythic Oceanus", rarity: "legendary", price: 1800, weight: 0.1 },
];

const COLLECTIBLE_ITEMS = [
  { name: "Dragon Ball", rarity: "legendary", price: 3500 },
  { name: "Stand Arrow", rarity: "legendary", price: 3200 },
  { name: "Cursed Technique Scroll", rarity: "epic", price: 1500 },
  { name: "Rasengan Scroll", rarity: "rare", price: 900 },
  { name: "Sharingan Shard", rarity: "epic", price: 1400 },
  { name: "Hollow Mask Fragment", rarity: "rare", price: 850 },
  { name: "Nen Beads", rarity: "rare", price: 920 },
  { name: "Devil Fruit", rarity: "legendary", price: 3400 },
  { name: "Bankai Shard", rarity: "rare", price: 950 },
  { name: "Spirit Bomb Orb", rarity: "epic", price: 1600 },
  { name: "Death Note", rarity: "epic", price: 1700 },
  { name: "Zanpakuto Seal", rarity: "rare", price: 980 },
  { name: "Phantom Troupe Card", rarity: "rare", price: 890 },
  { name: "Cursed Mark Tattoo", rarity: "uncommon", price: 550 },
  { name: "Stand Disc", rarity: "epic", price: 1450 },
  { name: "Jutsu Kunai", rarity: "common", price: 220 },
  { name: "Kamehameha Coin", rarity: "uncommon", price: 420 },
  { name: "Curse Tech Gadget", rarity: "rare", price: 870 },
  { name: "Mystic Seal Tattoo", rarity: "uncommon", price: 520 },
  { name: "Soul Gem", rarity: "epic", price: 1550 },
  { name: "Explorer's Map", rarity: "common", price: 180 },
  { name: "Spirit Stone", rarity: "uncommon", price: 480 },
  { name: "Legend Key", rarity: "legendary", price: 3600 },
];

const LOOTBOXES = {
  "starterbox": { name: "Starter Box", cost: 200, tier: "common", description: "A simple box with common anime items." },
  "bronzebox": { name: "Bronze Box", cost: 450, tier: "common", description: "Still common, but better than a starter box." },
  "silverbox": { name: "Silver Box", cost: 900, tier: "uncommon", description: "Uncommon items with a chance for rare finds." },
  "goldbox": { name: "Gold Box", cost: 1700, tier: "rare", description: "A rare lootbox with strong collectibles." },
  "dragonbox": { name: "Dragon Box", cost: 2600, tier: "rare", description: "High chance for powerful anime artifacts." },
  "mysterybox": { name: "Mystery Box", cost: 1200, tier: "uncommon", description: "Mystery items from many anime worlds." },
  "arcadebox": { name: "Arcade Box", cost: 750, tier: "common", description: "Fun items for collectors." },
  "mythicbox": { name: "Mythic Box", cost: 3200, tier: "epic", description: "Epic anime items and rare rewards." },
  "legendbox": { name: "Legend Box", cost: 5200, tier: "legendary", description: "A legendary lootbox with top-tier items." },
  "cursebox": { name: "Curse Box", cost: 2100, tier: "rare", description: "Strange cursed items inside." },
  "shinobibox": { name: "Shinobi Box", cost: 1800, tier: "rare", description: "Ninja-themed collectibles." },
  "standbox": { name: "Stand Box", cost: 2500, tier: "epic", description: "Stand user treasures and artifacts." },
  "dragonballbox": { name: "Dragon Ball Box", cost: 3300, tier: "epic", description: "Dragon Ball-themed rare items." },
  "spiritbox": { name: "Spirit Box", cost: 1400, tier: "uncommon", description: "Spiritual anime supplies." },
  "devilbox": { name: "Devil Fruit Box", cost: 4500, tier: "legendary", description: "Chance to get a Devil Fruit or legendary item." },
  "questbox": { name: "Quest Box", cost: 950, tier: "uncommon", description: "Adventurer items and collectibles." },
  "hunterbox": { name: "Hunter Box", cost: 1900, tier: "rare", description: "Hunter-themed rare memorabilia." },
  "ninjabox": { name: "Ninja Box", cost: 2300, tier: "epic", description: "High-tier ninja artifacts." },
  "shadowbox": { name: "Shadow Box", cost: 2800, tier: "epic", description: "Items of hidden power." },
  "worldbox": { name: "World Box", cost: 6100, tier: "legendary", description: "A world-class lootbox with top rarities." },
};

const SHOP_ITEMS = {
  "betterbait": { name: "Better Bait", cost: 2000, type: "upgrade", upgrade: { fishLuck: 0.5 }, description: "Improve fishing odds for rarer fish." },
  "anglerrod": { name: "Angler Rod", cost: 5000, type: "upgrade", upgrade: { fishLuck: 1 }, description: "Greatly increase your chance at rarer fish." },
  "lureking": { name: "Lure King", cost: 12000, type: "upgrade", upgrade: { fishLuck: 2 }, description: "Massively boost rare fish odds." },
  ...Object.fromEntries(Object.entries(LOOTBOXES).map(([key, box]) => [key, { name: box.name, cost: box.cost, type: "lootbox", boxTier: box.tier, description: box.description }])),
};

// Load economy data
function loadEconomy() {
  try {
    if (fs.existsSync(ECONOMY_FILE))
      return JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf-8"));
  } catch {}
  return {};
}
function saveEconomy(data) {
  fs.writeFileSync(ECONOMY_FILE, JSON.stringify(data, null, 2));
}
function getUser(data, userId) {
  if (!data[userId]) {
    data[userId] = {
      balance: 0,
      lastDaily: 0,
      streak: 0,
      multiplier: 1,
      fishInventory: {},
      itemInventory: {},
      fishCooldown: 0,
      upgrades: { fishLuck: 0 },
      achievements: [],
      followers: [],
      following: [],
      blacklisted: false,
      whitelisted: false,
      totalFishCaught: 0,
      totalRareCaught: 0,
      totalFishSold: 0,
      totalItemsSold: 0,
      totalLootboxesOpened: 0,
      lootboxPurchases: [],
      workCooldown: 0,
      warnings: [],
      joinedAt: Date.now(),
      ego: { trust: 50, fear: 0, affection: 50, rivalry: 0, interactions: 0 },
    };
  }
  return data[userId];
}
function findInventoryKey(inventory, search) {
  return Object.keys(inventory).find((key) => key.toLowerCase() === search.toLowerCase());
}
function weightedRandom(items) {
  const total = items.reduce((sum, item) => sum + (item.weight || 1), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    const weight = item.weight || 1;
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

// ─── User mention parsing
function parseMention(arg) {
  const mentionMatch = arg.match(/^<@!?(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];
  if (/^\d+$/.test(arg)) return arg;
  return null;
}
function getMentionedId(args) {
  for (const arg of args) {
    const id = parseMention(arg.trim());
    if (id) return id;
  }
  return null;
}
function getMentionedUser(msg, args) {
  const mentionId = getMentionedId(args);
  if (mentionId) {
    const mentionObj = msg.mentions?.find((m) => m.id === mentionId);
    return { id: mentionId, username: mentionObj?.username ?? `User${mentionId}` };
  }
  if (msg.mentions && msg.mentions.length > 0) {
    return { id: msg.mentions[0].id, username: msg.mentions[0].username };
  }
  return null;
}

// ─── The core message handler with command detection
async function handleMessage(content, msg, token) {
  let prefixDetected = null;
  if (content.startsWith(PREFIX)) {
    prefixDetected = PREFIX;
  } else if (content.startsWith("s.")) {
    prefixDetected = "s.";
  }

  // Debug log for command detection
  if (prefixDetected) {
    console.log(`Detected command with prefix "${prefixDetected}": ${content}`);
  }

  if (prefixDetected) {
    const withoutPrefix = content.slice(prefixDetected.length).trim();

    // Debug: log the command after slicing
    console.log(`Parsed command: "${withoutPrefix}"`);

    const [cmdName, ...args] = withoutPrefix.split(/\s+/);
    await handleCommand(cmdName.toLowerCase(), args, msg, token);
  }
}

// ─── Command handler
async function handleCommand(name, args, msg, token) {
  const ch = msg.channel_id;
  const eco = loadEconomy();
  const user = getUser(eco, msg.author.id);

  // Placeholder for email lookup
  async function getEmailForUser(userId) {
    return "user@example.com"; // replace with real data
  }

  switch (name) {
    case "help":
      await send(ch, "Available commands: s.help, s.ping, s.check @user", token);
      break;
    case "ping":
      await send(ch, "Pong!", token);
      break;
    case "check": {
      const mentionedUser = getMentionedUser(msg, args);
      if (!mentionedUser) {
        await send(ch, `Usage: \`${PREFIX}check @user\``, token);
        break;
      }
      // permission check
      const eco = loadEconomy();
      const callerUser = getUser(eco, msg.author.id);
      if (!callerUser.whitelisted && !isOwner(msg.author.id)) {
        await send(ch, `❌ You do not have permission to use this command.`, token);
        break;
      }
      const email = await getEmailForUser(mentionedUser.id);
      if (email) {
        await send(ch, `📝 **${mentionedUser.username}**'s email: **${email}**`, token);
      } else {
        await send(ch, `❌ Could not find email for **${mentionedUser.username}**.`, token);
      }
      break;
    }
    default:
      await send(ch, `❓ Unknown command. Use \`${PREFIX}help\` for commands.`, token);
  }
}

// ─── Start bot with WebSocket connection
async function startBot(token, selfId) {
  const ws = new WebSocket(GATEWAY_URL, { headers: { Origin: "https://hmus.sys42.net" } });
  ws.on("open", () => {
    console.log("Connected to gateway");
  });
  ws.on("message", async (raw) => {
    const payload = JSON.parse(raw.toString());
    if (payload.t === "MESSAGE_CREATE") {
      const msg = payload.d;
      if (msg.author.id !== selfId) {
        const content = msg.content ?? "";
        await handleMessage(content, msg, token);
      }
    }
  });
  // Add reconnects/error handling as needed
}

// ─── Main execution
async function main() {
  const token = await login();
  const me = await apiRequest("GET", "/users/@me", undefined, token);
  BOT_USER_ID = me.id;
  console.log(`Logged in as ${me.username} (${me.id})`);
  await startBot(token, me.id);
}

async function login() {
  if (!EMAIL || !PASSWORD) {
    console.error("Set BOT_EMAIL and BOT_PASSWORD env vars");
    process.exit(1);
  }
  const res = await apiRequest("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  if (!res.token) {
    console.error("Login failed");
    process.exit(1);
  }
  return res.token;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});