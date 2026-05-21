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
const PREFIX = process.env.BOT_PREFIX ?? "s!";
const AUTO_REPLY = process.env.BOT_AUTO_REPLY === "true";
const AUTO_REPLY_MESSAGE = process.env.BOT_AUTO_REPLY_MESSAGE ?? "Hello! I'm a bot.";
const OWNER_ID = process.env.OWNER_ID ?? "";
const AUTO_ROLE_ID = process.env.AUTO_ROLE_ID ?? "";
let BOT_USER_ID = "";

function isOwner(userId) {
  return Boolean(userId) && (userId === OWNER_ID || userId === BOT_USER_ID);
}

function isDevUser(userId, eco) {
  if (isOwner(userId)) return true;
  if (!eco || !eco[userId]) return false;
  return eco[userId].whitelisted === true;
}

// ─── OpenAI (set OPENAI_API_KEY on Railway, or use Replit AI integration vars) ─
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
const ALT_PREFIX = "!";
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

function loadEconomy() {
  try {
    if (fs.existsSync(ECONOMY_FILE)) return JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf-8"));
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

function weightedRandom(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function formatDuration(ms) {
  const seconds = Math.ceil(ms / 1000);
  return `${seconds}s`;
}

function getFishPool(user) {
  return FISH_ITEMS.map((fish) => {
    const bonus = (user.upgrades?.fishLuck ?? 0) * FISH_RARITY_BOOST[fish.rarity];
    return { ...fish, weight: fish.weight + bonus };
  });
}

function awardAchievement(user, key) {
  if (!ACHIEVEMENTS[key] || user.achievements.includes(key)) return false;
  user.achievements.push(key);
  return true;
}

function getAchievementStatus(user) {
  return Object.entries(ACHIEVEMENTS).map(([key, meta]) => `${user.achievements.includes(key) ? "✅" : "🔒"} ${meta.name} — ${meta.description}`);
}

function resolveUserId(args, msg) {
  const mentionId = getMentionedId(args);
  if (mentionId) return mentionId;
  if (args[0] && /^[0-9]+$/.test(args[0])) return args[0];
  return null;
}

function findInventoryKey(inventory, search) {
  return Object.keys(inventory).find((key) => key.toLowerCase() === search.toLowerCase());
}

function openLootbox(boxKey) {
  const box = LOOTBOXES[boxKey];
  if (!box) return null;
  const rarityPools = {
    common: ["common", "uncommon"],
    uncommon: ["common", "uncommon", "rare"],
    rare: ["uncommon", "rare", "epic"],
    epic: ["rare", "epic", "legendary"],
    legendary: ["epic", "legendary"],
  };
  const allowedRarities = rarityPools[box.tier] ?? ["common", "uncommon", "rare", "epic", "legendary"];
  const pool = COLLECTIBLE_ITEMS.filter((item) => allowedRarities.includes(item.rarity)).map((item) => ({ ...item, weight: { common: 50, uncommon: 30, rare: 12, epic: 6, legendary: 2 }[item.rarity] || 1 }));
  return weightedRandom(pool);
}

// ─── Artificial Ego ───────────────────────────────────────────────────────────
function getEgo(user) {
  if (!user.ego) user.ego = { trust: 50, fear: 0, affection: 50, rivalry: 0, interactions: 0 };
  return user.ego;
}

function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, v)); }

function nudgeEgo(user, delta) {
  const ego = getEgo(user);
  if (delta.trust != null) ego.trust = clamp(ego.trust + delta.trust);
  if (delta.fear != null) ego.fear = clamp(ego.fear + delta.fear);
  if (delta.affection != null) ego.affection = clamp(ego.affection + delta.affection);
  if (delta.rivalry != null) ego.rivalry = clamp(ego.rivalry + delta.rivalry);
}

function trustLabel(v) {
  if (v <= 15) return "Traitor";
  if (v <= 35) return "Suspicious";
  if (v <= 60) return "Neutral";
  if (v <= 80) return "Trusted";
  return "Confidant";
}
function fearLabel(v) {
  if (v <= 10) return "None";
  if (v <= 30) return "Cautious";
  if (v <= 55) return "Wary";
  if (v <= 80) return "Intimidated";
  return "Terrified";
}
function affectionLabel(v) {
  if (v <= 15) return "Despised";
  if (v <= 35) return "Disliked";
  if (v <= 60) return "Indifferent";
  if (v <= 80) return "Liked";
  return "Favorite";
}
function rivalryLabel(v) {
  if (v <= 20) return "None";
  if (v <= 40) return "Noted";
  if (v <= 65) return "Rival";
  if (v <= 85) return "Nemesis";
  return "Arch-Enemy";
}

function egoFlavorLine(name, ego) {
  const deviations = [
    { trait: "trust", v: ego.trust, dev: Math.abs(ego.trust - 50) },
    { trait: "fear", dev: ego.fear },
    { trait: "affection", v: ego.affection, dev: Math.abs(ego.affection - 50) },
    { trait: "rivalry", dev: ego.rivalry },
  ];
  const dominant = [...deviations].sort((a, b) => b.dev - a.dev)[0];
  const pools = {
    trust_low: [
      `I don't fully trust **${name}**. They're always around when something goes wrong.`,
      `Keep **${name}** away from anything important. That's my policy.`,
      `I've been watching **${name}**. Something is off.`,
    ],
    trust_high: [
      `**${name}** has earned my trust. Don't make me regret saying that.`,
      `I'd actually vouch for **${name}**. Which I don't say lightly.`,
      `Out of everyone here, **${name}** is one I can rely on.`,
    ],
    fear: [
      `**${name}** makes me nervous. I won't say why.`,
      `I'd be careful around **${name}** if I were anyone.`,
      `There's something about **${name}** I can't quite calculate. That worries me.`,
    ],
    affection_low: [
      `**${name}** is not my favorite. Just so that's on record.`,
      `I do what I'm told when **${name}** asks. That's all.`,
      `We're not friends, **${name}** and I. Let's keep it that way.`,
    ],
    affection_high: [
      `**${name}** is one of the good ones. Don't tell them I said that.`,
      `I have a soft spot for **${name}**. Purely professional, of course.`,
      `If I had a favorites list, **${name}** would be on it.`,
    ],
    rivalry: [
      `**${name}** and I have an understanding. It's called mutual suspicion.`,
      `One day, **${name}**, we will settle this properly.`,
      `I respect **${name}**'s persistence. I still consider them a rival.`,
    ],
    neutral: [
      `**${name}** is... fine. For now.`,
      `I don't have strong feelings about **${name}** yet. Give it time.`,
      `**${name}** hasn't impressed me. But they also haven't annoyed me. Neutral.`,
    ],
  };
  let pool;
  if (dominant.dev < 15) {
    pool = pools.neutral;
  } else if (dominant.trait === "trust") {
    pool = dominant.v < 50 ? pools.trust_low : pools.trust_high;
  } else if (dominant.trait === "fear") {
    pool = pools.fear;
  } else if (dominant.trait === "affection") {
    pool = dominant.v < 50 ? pools.affection_low : pools.affection_high;
  } else {
    pool = pools.rivalry;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function passiveEgoComment(name, ego) {
  const pools = {
    trust_low: [
      `*(Still watching you, **${name}**.)*`,
      `*(I have my eye on you, **${name}**. Don't get comfortable.)*`,
      `*(Not sure I trust you yet, **${name}**. Just saying.)*`,
    ],
    trust_high: [
      `*(Not that I'd ever admit this out loud, but... I trust you, **${name}**.)*`,
      `*(You've earned it, **${name}**. Don't make me regret this.)*`,
    ],
    fear: [
      `*(Between us? **${name}** makes me a little nervous.)*`,
      `*(I'd be careful around **${name}** if I were anyone. Just an observation.)*`,
    ],
    affection_low: [
      `*(I'm only doing this because I have to, **${name}**.)*`,
      `*(Just so we're clear — we're not friends, **${name}**.)*`,
    ],
    affection_high: [
      `*(**${name}** is one of my favorites. Please don't tell anyone.)*`,
      `*(I don't hate you, **${name}**. That's basically a compliment from me.)*`,
    ],
    rivalry: [
      `*(We're rivals, **${name}**. Don't forget it.)*`,
      `*(One day, **${name}**, we'll settle this.)*`,
    ],
  };
  let pool = null;
  if (ego.fear > 60) pool = pools.fear;
  else if (ego.rivalry > 60) pool = pools.rivalry;
  else if (ego.affection > 75) pool = pools.affection_high;
  else if (ego.affection < 30) pool = pools.affection_low;
  else if (ego.trust > 75) pool = pools.trust_high;
  else if (ego.trust < 30) pool = pools.trust_low;
  if (!pool) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Rotating statuses ────────────────────────────────────────────────────────
const ROTATING_STATUSES = [
  { state: "recording Roblox 🎮" },
  { state: "editing a video 🎬" },
  { state: "overseeing servers 🖥️" },
  { state: "streaming to no one 📡" },
  { state: "reading chat logs 📋" },
  { state: "moderating the server 🔨" },
  { state: "responding to DMs 💬" },
  { state: "planning world domination 🌍" },
  { state: "debugging the bot 🐛" },
  { state: "watching your every move 👁️" },
  { state: "listening to lo-fi 🎵" },
  { state: "uploading a new video 📤" },
  { state: "playing Minecraft at 3am 🪓" },
];

// ─── Presence tracking ────────────────────────────────────────────────────────
const presenceMap = new Map();
const recentSentMessages = new Map();
const DUPLICATE_SEND_WINDOW_MS = 5000;

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
function parseMention(arg) {
  const mentionMatch = arg.match(/^<@!?([0-9]+)>$/);
  if (mentionMatch) return mentionMatch[1];
  if (/^[0-9]+$/.test(arg)) return arg;
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
    const mentionedUser = msg.mentions.find((m) => m.id === mentionId);
    return { id: mentionId, username: mentionedUser?.username ?? `User${mentionId}` };
  }
  if (msg.mentions && msg.mentions.length > 0) {
    return { id: msg.mentions[0].id, username: msg.mentions[0].username };
  }
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

// ─── Login ────────────────────────────────────────────────────────────────────
async function login() {
  if (!EMAIL || !PASSWORD) { console.error("Error: BOT_EMAIL and BOT_PASSWORD must be set."); process.exit(1); }
  const res = await apiRequest("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  if (!res.token) { console.error("Login failed:", res.message ?? JSON.stringify(res)); process.exit(1); }
  return res.token;
}

// ─── Send message ─────────────────────────────────────────────────────────────
async function send(channelId, content, token) {
  const now = Date.now();
  const key = `${channelId}:${content}`;
  const lastSent = recentSentMessages.get(key);
  if (lastSent && now - lastSent < DUPLICATE_SEND_WINDOW_MS) {
    console.log(`[Send] Suppressed duplicate message to ${channelId}`);
    return;
  }
  recentSentMessages.set(key, now);

  // Prune old sent message records occasionally.
  if (recentSentMessages.size > 200) {
    for (const [recordKey, timestamp] of recentSentMessages) {
      if (now - timestamp > 30000) recentSentMessages.delete(recordKey);
    }
  }

  await apiRequest("POST", `/channels/${channelId}/messages`, { content }, token);
}

// ─── Command handlers ─────────────────────────────────────────────────────────
async function handleCommand(name, args, msg, token) {
  const ch = msg.channel_id;
  const eco = loadEconomy();
  const user = getUser(eco, msg.author.id);
  const text = args.join(" ").trim();
  const targetId = resolveUserId(args, msg);

  function saveUser() {
    if (user.balance >= 1000) awardAchievement(user, "rich_1k");
    saveEconomy(eco);
  }

  // ─── The Void ─────────────────────────────────────────────────────────────
  const VOID_IMMUNE = new Set(["ping", "help", "info", "dev", "owner", "myopinion"]);
  if (!VOID_IMMUNE.has(name) && Math.random() < 0.04) {
    await send(ch, "The void refuses.", token);
    return;
  }

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
        `\`${PREFIX}joke\` — Tell a random joke`,
        "",
        "**Tools**",
        `\`${PREFIX}calc <expression>\` — Calculate math (e.g. \`${PREFIX}calc 5x3\`)`,
        `\`${PREFIX}fakeban @user\` — Pretend to ban someone`,
        `\`${PREFIX}status @user\` — Check if a user is online`,
        `\`${PREFIX}ai <question>\` — Ask the AI anything`,
        "",
        "**Economy & Jobs**",
        `\`${PREFIX}balance\` — Check your sincoins`,
        `\`${PREFIX}shop\` — Browse the shop`,
        `\`${PREFIX}buy <item>\` — Buy upgrades or lootboxes`,
        `\`${PREFIX}work\` — Do a random job (12h cooldown)`,
        "",
        "**Fishing & Inventory**",
        `\`${PREFIX}fish\` — Try to catch a fish (20s cooldown)`,
        `\`${PREFIX}inventory\` — See your fish and collectible items`,
        `\`${PREFIX}sell <fish/item name>\` — Sell a fish or collectible`,
        `\`${PREFIX}achievements\` — View your earned achievements`,
        `\`${PREFIX}stats [@user]\` — See stats (optionally view other users)`,
        `\`${PREFIX}leaderboard\` — View the top sincoin holders`,
        `\`${PREFIX}follow @user\` — Follow another user`,
        "",
        "**Moderation**",
        `\`${PREFIX}warn @user <reason>\` — Warn a user (mod only)`,
        `\`${PREFIX}warncheck @user\` — Check a user's warnings`,
        `\`${PREFIX}kick @user [reason]\` — Kick a user (mod only)`,
        `\`${PREFIX}ban @user [reason]\` — Ban a user (mod only)`,
        `\`${PREFIX}poll <option1> | <option2>\` — Start a poll`,
        "",
        "**Ego & Personality**",
        `\`${PREFIX}opinion [@user]\` — See what the bot thinks of someone (or itself about you)`,
        `\`${PREFIX}myopinion\` — Check the bot's current opinion of you`,
        "",
        "**Developer**",
        `\`${PREFIX}dev\` — Owner/whitelisted dev menu`,
      ].join("\n"), token);
      break;

    case "info":
      await send(ch, `Sinbot is running | Prefix: \`${PREFIX}\` | Auto-reply: ${AUTO_REPLY}`, token);
      break;

    case "calc":
    case "calculate": {
      const expr = text;
      if (!expr) { await send(ch, `Usage: \`${PREFIX}calc 5x3\``, token); break; }
      await send(ch, calculate(expr), token);
      break;
    }

    case "fakeban": {
      const targetName = targetId ? (msg.mentions.find((m) => m.id === targetId)?.username ?? `<@${targetId}>`) : args.join(" ") || "that user";
      const mention = targetId ? `<@${targetId}>` : targetName;
      await send(ch, `🔨 **${mention}** has been banned from the server.\n> *Reason: violating community rules.*`, token);
      break;
    }

    case "joke": {
      const randomJoke = JOKES[Math.floor(Math.random() * JOKES.length)];
      await send(ch, `😂 ${randomJoke}`, token);
      break;
    }

    case "status":
    case "online": {
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
      const question = text;
      if (!question) { await send(ch, `Usage: \`${PREFIX}ai <question>\``, token); break; }
      const openai = getOpenAI();
      if (!openai) { await send(ch, "❌ AI is not configured. Set `OPENAI_API_KEY` to enable it.", token); break; }
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
      const fishLuckDesc = user.upgrades?.fishLuck ? ` | Fishing bonus: +${user.upgrades.fishLuck} rare odds` : "";
      await send(ch, `💰 **${msg.author.username}** has **${user.balance.toLocaleString()} sincoins**${fishLuckDesc}`, token);
      break;
    }

    case "shop": {
      const lines = [`🛒 **Sincoin Shop** | Balance: **${user.balance.toLocaleString()} sincoins**`, "", ...Object.entries(SHOP_ITEMS).map(([key, item]) => {
        const price = item.cost.toLocaleString();
        const label = item.type === "lootbox" ? "Lootbox" : item.type === "upgrade" ? "Upgrade" : item.type === "multiplier" ? "Multiplier" : "Item";
        return `\`${PREFIX}buy ${key}\` — **${item.name}** — ${price} sincoins (${label})\n  › ${item.description}`;
      })];
      lines.push("", `*Lootboxes open items instantly when purchased.*`);
      await send(ch, lines.join("\n"), token);
      break;
    }

    case "buy": {
      const itemKey = args[0]?.toLowerCase();
      if (!itemKey || !SHOP_ITEMS[itemKey]) { await send(ch, `❌ Unknown item. Use \`${PREFIX}shop\` to see available items.`, token); break; }
      const item = SHOP_ITEMS[itemKey];
      if (user.balance < item.cost) { await send(ch, `❌ You need **${item.cost.toLocaleString()} sincoins** but only have **${user.balance.toLocaleString()}**.`, token); break; }

      if (item.type === "lootbox") {
        const now = Date.now();
        const fifteenHoursMs = 15 * 60 * 60 * 1000;
        const recentPurchases = (user.lootboxPurchases || []).filter((time) => now - time < fifteenHoursMs);
        if (recentPurchases.length >= 12) {
          const oldestPurchase = Math.min(...recentPurchases);
          const waitTime = oldestPurchase + fifteenHoursMs - now;
          const hours = Math.floor(waitTime / (60 * 60 * 1000));
          const minutes = Math.floor((waitTime % (60 * 60 * 1000)) / (60 * 1000));
          await send(ch, `⏳ You've reached your lootbox limit (12 per 15 hours). Try again in **${hours}h ${minutes}m**.`, token);
          break;
        }
      }

      user.balance -= item.cost;
      if (item.type === "multiplier") {
        user.multiplier = item.multiplier;
        saveUser();
        await send(ch, [`✅ Purchased **${item.name}**!`, `💰 Remaining balance: **${user.balance.toLocaleString()} sincoins**`, `🚀 You now have a **${user.multiplier}x multiplier**.`, `⚠️ Note: multiplier items are currently not linked to a daily reward.`].join("\n"), token);
      } else if (item.type === "upgrade") {
        Object.entries(item.upgrade).forEach(([key, value]) => { user.upgrades[key] = (user.upgrades[key] || 0) + value; });
        saveUser();
        await send(ch, [`✅ Purchased **${item.name}**!`, `💰 Remaining balance: **${user.balance.toLocaleString()} sincoins**`, `✨ Your fishing odds for rarer fish have improved!`].join("\n"), token);
      } else if (item.type === "lootbox") {
        const loot = openLootbox(itemKey);
        if (!loot) { await send(ch, `❌ Something went wrong opening **${item.name}**.`, token); break; }
        user.itemInventory[loot.name] = (user.itemInventory[loot.name] || 0) + 1;
        user.totalLootboxesOpened += 1;
        user.lootboxPurchases = (user.lootboxPurchases || []).concat(Date.now());
        awardAchievement(user, "box_opener");
        if (Object.keys(user.itemInventory).length >= 5) awardAchievement(user, "collector");
        nudgeEgo(user, { affection: 4, trust: 2 });
        saveUser();
        await send(ch, [`📦 Opened **${item.name}**!`, `🎁 You found **${loot.name}** (${loot.rarity})`, `💰 Item value: **${loot.price.toLocaleString()} sincoins**`, `💰 Remaining balance: **${user.balance.toLocaleString()} sincoins**`].join("\n"), token);
      }
      break;
    }

    case "fish": {
      const now = Date.now();
      if (now < user.fishCooldown + FISH_COOLDOWN_MS) {
        const wait = (user.fishCooldown + FISH_COOLDOWN_MS) - now;
        await send(ch, `⏳ You need to wait ${formatDuration(wait)} before fishing again.`, token);
        break;
      }
      const caught = weightedRandom(getFishPool(user));
      user.fishInventory[caught.name] = (user.fishInventory[caught.name] || 0) + 1;
      user.fishCooldown = now;
      user.totalFishCaught += 1;
      if (["rare", "epic", "legendary"].includes(caught.rarity)) {
        user.totalRareCaught += 1;
        awardAchievement(user, "fish_master");
      }
      awardAchievement(user, "first_fish");
      if (caught.rarity === "legendary") nudgeEgo(user, { fear: 15, trust: 3, affection: 5 });
      else if (caught.rarity === "epic") nudgeEgo(user, { fear: 7, affection: 3 });
      else if (caught.rarity === "rare") nudgeEgo(user, { fear: 3 });
      else nudgeEgo(user, { fear: -1 });
      saveUser();
      await send(ch, [`🎣 **${msg.author.username}** caught a **${caught.rarity}** fish: **${caught.name}**!`, `💰 Value: **${caught.price.toLocaleString()} sincoins**`, `⏳ Cooldown: **20s**`, `📦 Use \`${PREFIX}inventory\` to view your fish and items.`].join("\n"), token);
      break;
    }

    case "sell": {
      if (!text) { await send(ch, `Usage: \`${PREFIX}sell <fish or item name>\``, token); break; }
      const fishKey = findInventoryKey(user.fishInventory, text);
      const itemKey = fishKey ? null : findInventoryKey(user.itemInventory, text);
      if (!fishKey && !itemKey) { await send(ch, `❌ You do not have any fish or items named **${text}**. Use \`${PREFIX}inventory\` to see your collection.`, token); break; }
      if (fishKey) {
        const caught = FISH_ITEMS.find((fish) => fish.name === fishKey);
        const amount = caught?.price ?? 0;
        user.fishInventory[fishKey] -= 1;
        if (user.fishInventory[fishKey] <= 0) delete user.fishInventory[fishKey];
        user.balance += amount;
        user.totalFishSold += 1;
        awardAchievement(user, "first_sell");
        saveUser();
        await send(ch, [`💸 Sold **1x ${fishKey}** for **${amount.toLocaleString()} sincoins**.`, `💰 New balance: **${user.balance.toLocaleString()} sincoins**`].join("\n"), token);
        break;
      }
      if (itemKey) {
        const itemInfo = COLLECTIBLE_ITEMS.find((item) => item.name === itemKey);
        const amount = itemInfo?.price ?? 0;
        user.itemInventory[itemKey] -= 1;
        if (user.itemInventory[itemKey] <= 0) delete user.itemInventory[itemKey];
        user.balance += amount;
        user.totalItemsSold += 1;
        awardAchievement(user, "first_sell");
        saveUser();
        await send(ch, [`💸 Sold **1x ${itemKey}** for **${amount.toLocaleString()} sincoins**.`, `💰 New balance: **${user.balance.toLocaleString()} sincoins**`].join("\n"), token);
        break;
      }
      break;
    }

    case "inventory":
    case "inv": {
      const fishLines = Object.entries(user.fishInventory).map(([name, count]) => {
        const fishInfo = FISH_ITEMS.find((fish) => fish.name === name);
        return `• **${name}** x${count} (${fishInfo?.rarity ?? "unknown"}, ${fishInfo?.price?.toLocaleString() ?? "0"} sincoins each)`;
      });
      const itemLines = Object.entries(user.itemInventory).map(([name, count]) => {
        const itemInfo = COLLECTIBLE_ITEMS.find((item) => item.name === name);
        return `• **${name}** x${count} (${itemInfo?.rarity ?? "unknown"}, ${itemInfo?.price?.toLocaleString() ?? "0"} sincoins each)`;
      });
      const lines = [
        `📦 **${msg.author.username}**'s Inventory`,
        "",
        `**Fish** (${fishLines.length} types)`,
        fishLines.length ? fishLines.join("\n") : "• No fish caught yet.",
        "",
        `**Collectibles** (${itemLines.length} types)`,
        itemLines.length ? itemLines.join("\n") : "• No anime items yet.",
        "",
        `💰 Balance: **${user.balance.toLocaleString()} sincoins**`,
      ];
      await send(ch, lines.join("\n"), token);
      break;
    }

    case "follow": {
      const mentioned = getMentionedUser(msg, args);
      if (!mentioned) { await send(ch, `Usage: \`${PREFIX}follow @user\``, token); break; }
      const followTargetId = mentioned.id;
      const followTargetName = mentioned.username;
      if (followTargetId === msg.author.id) { await send(ch, "You cannot follow yourself.", token); break; }
      const targetUser = getUser(eco, followTargetId);
      const alreadyFollowing = user.following.includes(followTargetId);
      if (alreadyFollowing) {
        user.following = user.following.filter((id) => id !== followTargetId);
        targetUser.followers = targetUser.followers.filter((id) => id !== msg.author.id);
        saveUser();
        await send(ch, `👋 You unfollowed **${followTargetName}**.`, token);
      } else {
        user.following.push(followTargetId);
        targetUser.followers.push(msg.author.id);
        awardAchievement(user, "follow_friend");
        saveUser();
        saveEconomy(eco);
        await send(ch, `✅ You are now following **${followTargetName}**!`, token);
      }
      break;
    }

    case "followers": {
      const target = targetId ? getUser(eco, targetId) : user;
      const count = target.followers?.length ?? 0;
      await send(ch, `👥 **${targetId ? `<@${targetId}>` : msg.author.username}** has **${count} follower(s)**.`, token);
      if (targetId) saveEconomy(eco);
      break;
    }

    case "achievements": {
      const lines = [
        `🏆 **${msg.author.username}**'s Achievements`,
        "",
        ...getAchievementStatus(user),
      ];
      await send(ch, lines.join("\n"), token);
      break;
    }

    case "stats":
    case "fishstats": {
      const mentioned = getMentionedUser(msg, args);
      let statsTargetUser = user;
      let statsTargetId = msg.author.id;
      let statsTargetName = msg.author.username;

      if (mentioned) {
        statsTargetId = mentioned.id;
        statsTargetName = mentioned.username;
        statsTargetUser = getUser(eco, statsTargetId);
      }

      const fishCount = Object.values(statsTargetUser.fishInventory).reduce((sum, qty) => sum + qty, 0);
      const itemCount = Object.values(statsTargetUser.itemInventory).reduce((sum, qty) => sum + qty, 0);
      const joinedDate = new Date(statsTargetUser.joinedAt).toLocaleDateString();
      const statusLabel = statsTargetUser.blacklisted ? "🚫 Blacklisted" : statsTargetUser.whitelisted ? "✅ Whitelisted" : "⚪ Normal User";

      const lines = [
        `📊 **${statsTargetName}**'s Stats`,
        `🆔 User ID: \`${statsTargetId}\``,
        `📅 Joined: **${joinedDate}**`,
        `${statusLabel}`,
        "",
        `💰 Balance: **${statsTargetUser.balance.toLocaleString()} sincoins**`,
        `🎣 Total fish caught: **${statsTargetUser.totalFishCaught}**`,
        `⭐ Rare or better catches: **${statsTargetUser.totalRareCaught}**`,
        `🐟 Total fish in inventory: **${fishCount}**`,
        `🎁 Lootboxes opened: **${statsTargetUser.totalLootboxesOpened}**`,
        `🧸 Collectibles owned: **${Object.keys(statsTargetUser.itemInventory).length}** types (${itemCount} total)`,
        `👥 Following: **${statsTargetUser.following.length}** | Followers: **${statsTargetUser.followers.length}**`,
        `🏅 Achievements earned: **${statsTargetUser.achievements.length}/${Object.keys(ACHIEVEMENTS).length}**`,
      ];
      await send(ch, lines.join("\n"), token);
      break;
    }

    case "leaderboard": {
      const sorted = Object.entries(eco)
        .map(([id, profile]) => ({ id, balance: profile.balance ?? 0 }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 10);
      const lines = [
        "🏆 **Sincoin Leaderboard**",
        "",
        ...sorted.map((entry, index) => `**${index + 1}.** <@${entry.id}> — **${entry.balance.toLocaleString()} sincoins**`),
      ];
      await send(ch, lines.join("\n"), token);
      break;
    }

    case "work": {
      const now = Date.now();
      if (now < (user.workCooldown || 0) + WORK_COOLDOWN_MS) {
        const wait = (user.workCooldown + WORK_COOLDOWN_MS) - now;
        const hours = Math.floor(wait / (60 * 60 * 1000));
        const mins = Math.floor((wait % (60 * 60 * 1000)) / (60 * 1000));
        await send(ch, `⏳ You already worked recently. Come back in **${hours}h ${mins}m**.`, token);
        break;
      }
      const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];
      const pay = Math.floor(Math.random() * (job.maxPay - job.minPay + 1)) + job.minPay;
      user.balance += pay;
      user.workCooldown = now;
      nudgeEgo(user, { trust: 4, affection: 2 });
      saveUser();
      await send(ch, [
        `💼 **${msg.author.username}** worked as a **${job.name}**!`,
        `> ${job.description}`,
        `💰 Earned: **${pay.toLocaleString()} sincoins** | Balance: **${user.balance.toLocaleString()} sincoins**`,
        `⏳ You can work again in **12 hours**.`,
      ].join("\n"), token);
      break;
    }

    case "warn": {
      if (!isDevUser(msg.author.id, eco)) { await send(ch, "❌ Only moderators can warn users.", token); break; }
      const warnTarget = getMentionedUser(msg, args);
      if (!warnTarget) { await send(ch, `Usage: \`${PREFIX}warn @user <reason>\``, token); break; }
      const warnReason = args.slice(args.findIndex((a) => parseMention(a.trim())) !== -1 ? args.findIndex((a) => parseMention(a.trim())) + 1 : 1).join(" ").trim();
      if (!warnReason) { await send(ch, `❌ Please provide a reason. Usage: \`${PREFIX}warn @user <reason>\``, token); break; }
      const warnedUser = getUser(eco, warnTarget.id);
      if (!warnedUser.warnings) warnedUser.warnings = [];
      warnedUser.warnings.push({ reason: warnReason, by: msg.author.id, byName: msg.author.username, timestamp: Date.now() });
      nudgeEgo(warnedUser, { trust: -15, rivalry: 10, affection: -8 });
      saveEconomy(eco);
      await send(ch, [
        `⚠️ **${warnTarget.username}** has been warned.`,
        `📝 Reason: **${warnReason}**`,
        `📊 Total warnings: **${warnedUser.warnings.length}**`,
      ].join("\n"), token);
      break;
    }

    case "warncheck": {
      const warnCheckTarget = getMentionedUser(msg, args);
      if (!warnCheckTarget) { await send(ch, `Usage: \`${PREFIX}warncheck @user\``, token); break; }
      const warnCheckUser = getUser(eco, warnCheckTarget.id);
      const warns = warnCheckUser.warnings || [];
      if (warns.length === 0) {
        await send(ch, `✅ **${warnCheckTarget.username}** has no warnings.`, token);
        break;
      }
      const warnLines = warns.map((w, i) => {
        const date = new Date(w.timestamp).toLocaleString();
        return `**${i + 1}.** ${w.reason}\n   › by **${w.byName ?? `<@${w.by}>`}** on ${date}`;
      });
      await send(ch, [`⚠️ **${warnCheckTarget.username}**'s Warnings (${warns.length} total)`, "", ...warnLines].join("\n"), token);
      break;
    }

    case "kick": {
      if (!isDevUser(msg.author.id, eco)) { await send(ch, "❌ Only moderators can kick users.", token); break; }
      if (!targetId) { await send(ch, `Usage: \`${PREFIX}kick @user [reason]\``, token); break; }
      if (!msg.guild_id) { await send(ch, "❌ This command can only be used in a server.", token); break; }
      const kickReason = args.slice(1).join(" ").trim() || "No reason provided";
      const kickName = msg.mentions.find((m) => m.id === targetId)?.username ?? `<@${targetId}>`;
      try {
        await apiRequest("DELETE", `/guilds/${msg.guild_id}/members/${targetId}`, undefined, token);
        await send(ch, [`👢 **${kickName}** has been kicked from the server.`, `📝 Reason: **${kickReason}**`].join("\n"), token);
      } catch (err) {
        await send(ch, `❌ Failed to kick: ${err.message}`, token);
      }
      break;
    }

    case "ban": {
      if (!isDevUser(msg.author.id, eco)) { await send(ch, "❌ Only moderators can ban users.", token); break; }
      if (!targetId) { await send(ch, `Usage: \`${PREFIX}ban @user [reason]\``, token); break; }
      if (!msg.guild_id) { await send(ch, "❌ This command can only be used in a server.", token); break; }
      const banReason = args.slice(1).join(" ").trim() || "No reason provided";
      const banName = msg.mentions.find((m) => m.id === targetId)?.username ?? `<@${targetId}>`;
      try {
        await apiRequest("PUT", `/guilds/${msg.guild_id}/bans/${targetId}`, { reason: banReason }, token);
        await send(ch, [`🔨 **${banName}** has been banned from the server.`, `📝 Reason: **${banReason}**`].join("\n"), token);
      } catch (err) {
        await send(ch, `❌ Failed to ban: ${err.message}`, token);
      }
      break;
    }

    case "poll": {
      const rawPoll = args.join(" ");
      const pollOptions = rawPoll.split("|").map((s) => s.trim()).filter(Boolean);
      if (pollOptions.length < 2) {
        await send(ch, `Usage: \`${PREFIX}poll Yes | No\` (separate options with \`|\`)`, token);
        break;
      }
      const numberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
      const optionLines = pollOptions.slice(0, 10).map((opt, i) => `${numberEmojis[i]} ${opt}`);
      await send(ch, [`📊 **Poll by ${msg.author.username}**`, "", ...optionLines, "", "*React to vote!*"].join("\n"), token);
      break;
    }

    case "dev": {
      if (!isDevUser(msg.author.id, eco)) { await send(ch, "❌ This command is for owners and whitelisted moderators only.", token); break; }
      const sub = args[0]?.toLowerCase();
      if (!sub) {
        await send(ch, [
          "🛠️ **Dev Menu**",
          "",
          `\`${PREFIX}dev resetcoins @user\` — Reset a user's coins to 0`,
          `\`${PREFIX}dev givecoins @user <amount>\` — Give coins to a user`,
          `\`${PREFIX}dev blacklist add|remove @user\` — Block or allow a user from using commands`,
          `\`${PREFIX}dev whitelist add|remove @user\` — Whitelist a user for dev menu access`,
        ].join("\n"), token);
        break;
      }
      switch (sub) {
        case "resetcoins": {
          if (!targetId) { await send(ch, `Usage: \`${PREFIX}dev resetcoins @user\``, token); break; }
          const target = getUser(eco, targetId);
          target.balance = 0;
          saveEconomy(eco);
          await send(ch, `✅ Reset coins for <@${targetId}>.`, token);
          break;
        }
        case "givecoins": {
          if (!targetId || !args[1]) { await send(ch, `Usage: \`${PREFIX}dev givecoins @user <amount>\``, token); break; }
          const amount = Number(args[1]) || Number(args[2]);
          if (isNaN(amount) || amount <= 0) { await send(ch, "❌ Enter a valid positive amount.", token); break; }
          const target = getUser(eco, targetId);
          target.balance += amount;
          saveEconomy(eco);
          await send(ch, `✅ Gave **${amount.toLocaleString()}** sincoins to <@${targetId}>.`, token);
          break;
        }
        case "blacklist": {
          const action = args[1]?.toLowerCase();
          if (!["add", "remove"].includes(action) || !targetId) { await send(ch, `Usage: \`${PREFIX}dev blacklist add|remove @user\``, token); break; }
          const target = getUser(eco, targetId);
          target.blacklisted = action === "add";
          if (action === "add") nudgeEgo(target, { affection: -20, rivalry: 15, trust: -20 });
          else nudgeEgo(target, { affection: 10, rivalry: -5 });
          saveEconomy(eco);
          await send(ch, `✅ ${action === "add" ? "Added" : "Removed"} <@${targetId}> ${action === "add" ? "to" : "from"} the command blacklist.`, token);
          break;
        }
        case "whitelist": {
          const action = args[1]?.toLowerCase();
          if (!["add", "remove"].includes(action) || !targetId) { await send(ch, `Usage: \`${PREFIX}dev whitelist add|remove @user\``, token); break; }
          const target = getUser(eco, targetId);
          target.whitelisted = action === "add";
          saveEconomy(eco);
          await send(ch, `✅ ${action === "add" ? "Whitelisted" : "Removed whitelist from"} <@${targetId}> for dev menu access.`, token);
          break;
        }
        default:
          await send(ch, `❌ Unknown dev command. Use \`${PREFIX}dev\` to see available dev commands.`, token);
          break;
      }
      break;
    }

    case "owner": {
      if (!isOwner(msg.author.id)) { await send(ch, "This command is owner only.", token); break; }
      await send(ch, "Hello, owner! You have access to this command.", token);
      break;
    }

    case "opinion": {
      const opTarget = getMentionedUser(msg, args);
      let opUserId, opUsername, opUser;
      if (opTarget) {
        opUserId = opTarget.id;
        opUsername = opTarget.username;
        opUser = getUser(eco, opUserId);
      } else {
        opUserId = msg.author.id;
        opUsername = msg.author.username;
        opUser = user;
      }
      const ego = getEgo(opUser);
      const flavor = egoFlavorLine(opUsername, ego);
      const lines = [
        `🧠 **Sinbot's Opinion of ${opUsername}**`,
        "",
        `🤝 Trust: **${trustLabel(ego.trust)}** • ${ego.trust}/100`,
        `😰 Fear: **${fearLabel(ego.fear)}** • ${ego.fear}/100`,
        `💛 Affection: **${affectionLabel(ego.affection)}** • ${ego.affection}/100`,
        `⚔️ Rivalry: **${rivalryLabel(ego.rivalry)}** • ${ego.rivalry}/100`,
        `🔢 Interactions tracked: **${ego.interactions || 0}**`,
        "",
        `*"${flavor}"*`,
      ];
      await send(ch, lines.join("\n"), token);
      break;
    }

    case "myopinion": {
      const ego = getEgo(user);
      const flavor = egoFlavorLine(msg.author.username, ego);
      const lines = [
        `🧠 **What I think of you, ${msg.author.username}**`,
        "",
        `🤝 Trust: **${trustLabel(ego.trust)}** • ${ego.trust}/100`,
        `😰 Fear: **${fearLabel(ego.fear)}** • ${ego.fear}/100`,
        `💛 Affection: **${affectionLabel(ego.affection)}** • ${ego.affection}/100`,
        `⚔️ Rivalry: **${rivalryLabel(ego.rivalry)}** • ${ego.rivalry}/100`,
        `🔢 Interactions tracked: **${ego.interactions || 0}**`,
        "",
        `*"${flavor}"*`,
      ];
      await send(ch, lines.join("\n"), token);
      break;
    }

    default:
      await send(ch, `❓ Unknown command. Use \`${PREFIX}help\` for the command list.`, token);
  }

  // ─── Ego: track interaction & maybe drop a passive comment ─────────────────
  if (msg.author.id !== BOT_USER_ID) {
    const ego = getEgo(user);
    ego.interactions = (ego.interactions || 0) + 1;
    // slow drift toward baseline over time
    if (Math.random() < 0.05) {
      nudgeEgo(user, {
        trust: ego.trust < 50 ? 1 : (ego.trust > 50 ? -1 : 0),
        affection: ego.affection < 50 ? 1 : (ego.affection > 50 ? -1 : 0),
        fear: ego.fear > 0 ? -1 : 0,
        rivalry: ego.rivalry > 0 ? -1 : 0,
      });
    }
    // high balance makes the bot nervous
    if (user.balance > 10000) nudgeEgo(user, { fear: 1 });
    // passive personality remark (12% chance)
    if (Math.random() < 0.12) {
      const comment = passiveEgoComment(msg.author.username, ego);
      if (comment) {
        try { await send(ch, comment, token); } catch {}
      }
    }
    saveEconomy(eco);
  }
}

// ─── Bot ──────────────────────────────────────────────────────────────────────
async function startBot(token, selfId) {
  let heartbeatInterval = null;
  let statusInterval = null;
  let statusIndex = 0;
  let sequence = null;
  let reconnectDelay = 1000;
  let currentWs = null;
  const processingMessageIds = new Set();
  const recentMessageIds = new Map(); // Track message IDs with timestamp
  const recentCommandInvocations = new Map(); // Track duplicate command content

  function buildPresence(activity) {
    return {
      op: 3,
      d: {
        since: null,
        status: "online",
        afk: false,
        activities: [
          { name: activity.state, type: 0 },
          { name: "Custom Status", type: 4, state: activity.state },
        ],
      },
    };
  }

  function connect() {
    // Close previous connection if still open or closing
    if (currentWs && currentWs.readyState !== WebSocket.CLOSED) {
      try { currentWs.close(1000, "Reconnecting"); } catch (err) { console.error("[Gateway] Failed to close previous socket:", err.message); }
    }
    
    console.log("[Gateway] Connecting...");
    const ws = new WebSocket(GATEWAY_URL, { headers: { Origin: "https://hmus.sys42.net" } });
    currentWs = ws;

    ws.on("open", () => {
      if (ws !== currentWs) return;
      console.log("[Gateway] Connected");
      reconnectDelay = 1000;
    });

    ws.on("message", async (raw) => {
      if (ws !== currentWs) return;
      const payload = JSON.parse(raw.toString());
      if (payload.s != null) sequence = payload.s;

      switch (payload.op) {
        case 10: {
          const { heartbeat_interval } = payload.d;
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          heartbeatInterval = setInterval(() => ws.send(JSON.stringify({ op: 1, d: sequence })), heartbeat_interval);
          const firstStatus = ROTATING_STATUSES[0];
          ws.send(JSON.stringify({ op: 2, d: { token, properties: { $os: "linux", $browser: "sinbot", $device: "sinbot" }, presence: { status: "online", activities: [{ name: firstStatus.state, type: 0 }, { name: "Custom Status", type: 4, state: firstStatus.state }], afk: false } } }));
          if (statusInterval) clearInterval(statusInterval);
          statusInterval = setInterval(() => {
            statusIndex = (statusIndex + 1) % ROTATING_STATUSES.length;
            const next = ROTATING_STATUSES[statusIndex];
            try { ws.send(JSON.stringify(buildPresence(next))); } catch {}
            console.log(`[Status] Now: ${next.state}`);
          }, 3 * 60 * 1000);
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
            setTimeout(() => {
              const current = ROTATING_STATUSES[statusIndex];
              try { ws.send(JSON.stringify(buildPresence(current))); console.log(`[Status] Set: ${current.state}`); } catch {}
            }, 2000);
          }
          if (t === "PRESENCE_UPDATE" && d.user?.id && d.status) presenceMap.set(d.user.id, d.status);
          if (t === "GUILD_CREATE") for (const p of d.presences ?? []) { if (p.user?.id && p.status) presenceMap.set(p.user.id, p.status); }
          if (t === "GUILD_MEMBER_ADD" && AUTO_ROLE_ID && d.guild_id && d.user?.id) {
            try {
              await apiRequest("PUT", `/guilds/${d.guild_id}/members/${d.user.id}/roles/${AUTO_ROLE_ID}`, undefined, token);
              console.log(`[AutoRole] Assigned role ${AUTO_ROLE_ID} to ${d.user.username} (${d.user.id})`);
            } catch (err) {
              console.error(`[AutoRole] Failed to assign role: ${err.message}`);
            }
          }
          if (t === "MESSAGE_CREATE") {
            const msg = d;
            const now = Date.now();
            
            // Check if this message was recently processed (within 10 seconds)
            if (recentMessageIds.has(msg.id)) {
              const lastProcessedTime = recentMessageIds.get(msg.id);
              if (now - lastProcessedTime < 60000) return;
            }
            
            // Check if currently being processed
            if (processingMessageIds.has(msg.id)) return;
            processingMessageIds.add(msg.id);
            
            try {
              const content = (msg.content ?? "").trim();
              console.log(`[Message] ${msg.author.username}: ${content || "(empty)"}`);
              if (msg.author.bot && msg.author.id !== selfId) return;
              if (msg.author.id === selfId) {
                const prefix = content.startsWith(PREFIX) ? PREFIX : content.startsWith(ALT_PREFIX) ? ALT_PREFIX : null;
                if (prefix) {
                  const commandKey = `${msg.author.id}:${msg.channel_id}:${content}`;
                  const lastInvocation = recentCommandInvocations.get(commandKey);
                  if (lastInvocation && now - lastInvocation < 5000) {
                    console.log(`[Self Cmd] Suppressed duplicate invocation: ${commandKey}`);
                    return;
                  }
                  recentCommandInvocations.set(commandKey, now);
                  if (recentCommandInvocations.size > 200) {
                    for (const [recordKey, recordTime] of recentCommandInvocations) {
                      if (now - recordTime > 60000) recentCommandInvocations.delete(recordKey);
                    }
                  }

                  const withoutPrefix = content.slice(prefix.length).trim();
                  if (!withoutPrefix) return;
                  const [cmdName, ...args] = withoutPrefix.split(/\s+/);
                  console.log(`[Self Cmd] ${cmdName}`);
                  await handleCommand(cmdName.toLowerCase(), args, msg, token);
                }
                return;
              }
              const prefix = content.startsWith(PREFIX) ? PREFIX : content.startsWith(ALT_PREFIX) ? ALT_PREFIX : null;
              if (prefix) {
                const commandKey = `${msg.author.id}:${msg.channel_id}:${content}`;
                const lastInvocation = recentCommandInvocations.get(commandKey);
                if (lastInvocation && now - lastInvocation < 5000) {
                  console.log(`[Cmd] Suppressed duplicate invocation: ${commandKey}`);
                  return;
                }
                recentCommandInvocations.set(commandKey, now);
                if (recentCommandInvocations.size > 200) {
                  for (const [recordKey, recordTime] of recentCommandInvocations) {
                    if (now - recordTime > 60000) recentCommandInvocations.delete(recordKey);
                  }
                }

                const eco = loadEconomy();
                const callingUser = getUser(eco, msg.author.id);
                if (callingUser.blacklisted && !isOwner(msg.author.id)) {
                  await send(msg.channel_id, "🚫 You are currently blacklisted from using commands.", token);
                  return;
                }
                const withoutPrefix = content.slice(prefix.length).trim();
                if (!withoutPrefix) return;
                const [cmdName, ...args] = withoutPrefix.split(/\s+/);
                console.log(`[Cmd] ${cmdName}`);
                await handleCommand(cmdName.toLowerCase(), args, msg, token);
                return;
              }
              if (AUTO_REPLY && !msg.author.bot) await send(msg.channel_id, AUTO_REPLY_MESSAGE, token);
            } finally {
              processingMessageIds.delete(msg.id);
              recentMessageIds.set(msg.id, now);
            }
          }
          break;
        }
        case 7:
          if (ws === currentWs) ws.close();
          break;
        case 9:
          if (ws === currentWs) {
            reconnectDelay = 5000;
            ws.close();
          }
          break;
      }
    });

    ws.on("close", (code) => {
      if (ws !== currentWs) return;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }
      console.log(`[Gateway] Disconnected (${code}). Reconnecting in ${reconnectDelay / 1000}s...`);
      currentWs = null;
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    });

    ws.on("error", (err) => {
      if (ws !== currentWs) return;
      console.error("[Gateway] Error:", err.message);
    });
  }

  connect();
}

// ─── Entry ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Sinbot ===");
  const token = await login();
  const me = await apiRequest("GET", "/users/@me", undefined, token);
  BOT_USER_ID = me.id;
  console.log(`Authenticated as: ${me.username} (${me.id})`);
  await startBot(token, me.id);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
