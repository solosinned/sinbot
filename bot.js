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

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function apiRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const url = new URL(API_BASE + urlPath);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };
    const req = client.request(url, options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        } else {
          try {
            resolve(body ? JSON.parse(body) : null);
          } catch {
            resolve(body);
          }
        }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function login() {
  if (!EMAIL || !PASSWORD) throw new Error("BOT_EMAIL and BOT_PASSWORD must be set.");
  const res = await apiRequest("POST", "/auth/login", { email: EMAIL, password: PASSWORD }, "");
  return res.token;
}

// ─── Mention parsing ──────────────────────────────────────────────────────────
function getMentionedId(args) {
  const mention = args.find((arg) => /^<@!?\d+>$/.test(arg));
  return mention ? mention.match(/\d+/)[0] : null;
}

// ─── Math calculator ──────────────────────────────────────────────────────────
function calculate(expr) {
  try {
    const sanitized = expr.replace(/[^0-9+\-*/().x]/g, "").replace(/x/g, "*");
    const result = Function('"use strict"; return (' + sanitized + ")")();
    return `**${expr}** = **${result}**`;
  } catch {
    return "❌ Invalid expression.";
  }
}

// ─── Command handler ──────────────────────────────────────────────────────────
async function send(channelId, content, token) {
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

    case "status": {
      if (!targetId) { await send(ch, `Usage: \`${PREFIX}status @user\``, token); break; }
      const targetName = msg.mentions.find((m) => m.id === targetId)?.username ?? `<@${targetId}>`;
      const status = presenceMap.get(targetId);
      if (!status) {
        await send(ch, `❓ No presence data for **${targetName}** yet.`, token);
      } else {
        const emoji = { online: "🟢", idle: "🟡", dnd: "🔴", offline: "⚫" };
        await send(ch, `${emoji[status] ?? "❓"} **${targetName}** is actually **${status}**.`, token);
      }
      break;
    }

    case "ai": {
      if (!question) { await send(ch, `Usage: \`${PREFIX}ai <question>\``, token); break; }
      const question = text;
      if (!question) { await send(ch, `Usage: \`${PREFIX}ai <question>\``, token); break; }
      const openai = getOpenAI();
      if (!openai) { await send(ch, "❌ AI is not configured. Set `OPENAI_API_KEY` to enable it.", token); break; }
      await send(ch, "🤔 Thinking...", token);
      try {
        const response = await openai.chat.completions.create({ model: "gpt-3.5-turbo", messages: [{ role: "user", content: question }], max_tokens: 500 });
        const answer = response.choices[0].message.content;
        await send(ch, `**Q: ${question}**\n\n${answer}`, token);
      } catch (err) {
        await send(ch, `❌ AI error: ${err.message}`, token);
      }
      break;
    }

    case "balance": {
      const fishLuckDesc = user.upgrades?.fishLuck ? ` | 🎣 Fish Luck: +${user.upgrades.fishLuck}` : "";
      await send(ch, `💰 **${msg.author.username}** has **${user.balance.toLocaleString()} sincoins**${fishLuckDesc}`, token);
      break;
    }

    case "shop": {
      const lines = ["**Sinbot Shop**", ""];
      for (const [key, item] of Object.entries(SHOP_ITEMS)) {
        lines.push(`\`${key}\` — **${item.name}** (${item.cost.toLocaleString()} sincoins) — ${item.description}`);
      }
      lines.push("", `Use \`${PREFIX}buy <item>\` to purchase.`);
      await send(ch, lines.join("\n"), token);
      break;
    }

    case "buy": {
      const itemKey = text.toLowerCase();
      if (!itemKey || !SHOP_ITEMS[itemKey]) { await send(ch, `❌ Unknown item. Use \`${PREFIX}shop\` to see available items.`, token); break; }
      const item = SHOP_ITEMS[itemKey];
      if (user.balance < item.cost) { await send(ch, `❌ You need **${item.cost.toLocaleString()} sincoins** but only have **${user.balance.toLocaleString()}**.`, token); break; }
      user.balance -= item.cost;
      if (item.type === "upgrade") {
        if (!user.upgrades) user.upgrades = {};
        user.upgrades.fishLuck = (user.upgrades.fishLuck ?? 0) + item.upgrade.fishLuck;
        saveUser();
        await send(ch, `✅ Purchased **${item.name}**!\n💰 Remaining balance: **${user.balance.toLocaleString()} sincoins**\n🚀 You now have a **${user.multiplier}x multiplier**.\n⚠️ Note: multiplier items are currently not linked to a daily reward.`, token);
      } else if (item.type === "lootbox") {
        const now = Date.now();
        const fifteenHoursAgo = now - 15 * 60 * 60 * 1000;
        const recentPurchases = (user.lootboxPurchases ?? []).filter((t) => t > fifteenHoursAgo);
        if (recentPurchases.length >= 12) {
          user.balance += item.cost;
          const oldestPurchase = Math.min(...recentPurchases);
          const timeUntilReset = oldestPurchase + 15 * 60 * 60 * 1000 - now;
          const hours = Math.floor(timeUntilReset / (60 * 60 * 1000));
          const minutes = Math.floor((timeUntilReset % (60 * 60 * 1000)) / (60 * 1000));
          await send(ch, `⏳ You've reached your lootbox limit (12 per 15 hours). Try again in **${hours}h ${minutes}m**.`, token);
          break;
        }
        user.lootboxPurchases = [...recentPurchases, now];
        user.totalLootboxesOpened = (user.totalLootboxesOpened ?? 0) + 1;
        awardAchievement(user, "box_opener");
        const loot = openLootbox(itemKey);
        if (!loot) {
          user.balance += item.cost;
          await send(ch, `❌ Something went wrong opening **${item.name}**.`, token);
          break;
        }
        if (!user.itemInventory) user.itemInventory = {};
        user.itemInventory[loot.name] = (user.itemInventory[loot.name] ?? 0) + 1;
        saveUser();
        await send(ch, `📦 Opened **${item.name}**!\n🎁 You found **${loot.name}** (${loot.rarity})\n💰 Item value: **${loot.price.toLocaleString()} sincoins**\n💰 Remaining balance: **${user.balance.toLocaleString()} sincoins**`, token);
      }
      break;
    }

    case "fish": {
      const now = Date.now();
      const wait = user.fishCooldown - now;
      if (wait > 0) {
        await send(ch, `⏳ You need to wait ${formatDuration(wait)} before fishing again.`, token);
        break;
      }
      user.fishCooldown = now + FISH_COOLDOWN_MS;
      const pool = getFishPool(user);
      const caught = weightedRandom(pool);
      if (!user.fishInventory) user.fishInventory = {};
      user.fishInventory[caught.name] = (user.fishInventory[caught.name] ?? 0) + 1;
      user.totalFishCaught = (user.totalFishCaught ?? 0) + 1;
      if (caught.rarity !== "common") user.totalRareCaught = (user.totalRareCaught ?? 0) + 1;
      awardAchievement(user, "first_fish");
      if (caught.rarity !== "common") awardAchievement(user, "fish_master");
      saveUser();
      await send(ch, [`🎣 **${msg.author.username}** caught a **${caught.rarity}** fish: **${caught.name}**!`, `💰 Value: **${caught.price.toLocaleString()} sincoins**`, `⏳ Cooldown: **20s**`, `📦 Use \`${PREFIX}inventory\` to view your fish and items.`].join("\n"), token);
      break;
    }

    case "inventory": {
      if (!text) {
        const lines = ["**Your Inventory**", ""];
        if (user.fishInventory && Object.keys(user.fishInventory).length > 0) {
          lines.push("**Fish:**");
          for (const [name, count] of Object.entries(user.fishInventory)) {
            const fish = FISH_ITEMS.find((f) => f.name === name);
            lines.push(`  • **${name}** (${count}x) — ${fish?.price.toLocaleString() ?? "?"} sincoins each`);
          }
        }
        if (user.itemInventory && Object.keys(user.itemInventory).length > 0) {
          lines.push("", "**Collectible Items:**");
          for (const [name, count] of Object.entries(user.itemInventory)) {
            const item = COLLECTIBLE_ITEMS.find((i) => i.name === name);
            lines.push(`  • **${name}** (${count}x) — ${item?.price.toLocaleString() ?? "?"} sincoins each`);
          }
        }
        if (!user.fishInventory || !user.itemInventory || (Object.keys(user.fishInventory).length === 0 && Object.keys(user.itemInventory).length === 0)) {
          lines.push("Your inventory is empty.");
        }
        await send(ch, lines.join("\n"), token);
      }
      break;
    }

    case "sell": {
      if (!text) { await send(ch, `Usage: \`${PREFIX}sell <fish or item name>\``, token); break; }
      const fishKey = findInventoryKey(user.fishInventory || {}, text);
      const itemKey = findInventoryKey(user.itemInventory || {}, text);
      if (!fishKey && !itemKey) { await send(ch, `❌ You do not have any fish or items named **${text}**. Use \`${PREFIX}inventory\` to see your collection.`, token); break; }
      if (fishKey) {
        const fish = FISH_ITEMS.find((f) => f.name === fishKey);
        const price = fish.price;
        user.balance += price;
        user.fishInventory[fishKey]--;
        if (user.fishInventory[fishKey] === 0) delete user.fishInventory[fishKey];
        user.totalFishSold = (user.totalFishSold ?? 0) + 1;
        awardAchievement(user, "first_sell");
        saveUser();
        await send(ch, `✅ Sold **${fishKey}** for **${price.toLocaleString()} sincoins**.\n💰 New balance: **${user.balance.toLocaleString()} sincoins**`, token);
      } else if (itemKey) {
        const item = COLLECTIBLE_ITEMS.find((i) => i.name === itemKey);
        const price = item.price;
        user.balance += price;
        user.itemInventory[itemKey]--;
        if (user.itemInventory[itemKey] === 0) delete user.itemInventory[itemKey];
        user.totalItemsSold = (user.totalItemsSold ?? 0) + 1;
        awardAchievement(user, "first_sell");
        saveUser();
        await send(ch, `✅ Sold **${itemKey}** for **${price.toLocaleString()} sincoins**.\n💰 New balance: **${user.balance.toLocaleString()} sincoins**`, token);
      }
      break;
    }

    case "achievements":
      await send(ch, ["**Your Achievements**", "", ...getAchievementStatus(user)].join("\n"), token);
      break;

    case "stats": {
      const targetUser = targetId ? getUser(eco, targetId) : user;
      const targetName = targetId ? (msg.mentions.find((m) => m.id === targetId)?.username ?? `<@${targetId}>`) : msg.author.username;
      const lines = [
        `**${targetName}'s Stats**`,
        "",
        `💰 Balance: **${targetUser.balance.toLocaleString()} sincoins**`,
        `🎣 Fish Caught: **${targetUser.totalFishCaught ?? 0}**`,
        `🎁 Rare Fish: **${targetUser.totalRareCaught ?? 0}**`,
        `📦 Lootboxes Opened: **${targetUser.totalLootboxesOpened ?? 0}**`,
        `🏆 Achievements: **${targetUser.achievements.length}/${Object.keys(ACHIEVEMENTS).length}**`,
      ];
      await send(ch, lines.join("\n"), token);
      break;
    }

    case "leaderboard": {
      const sorted = Object.entries(eco).sort((a, b) => b[1].balance - a[1].balance).slice(0, 10);
      const lines = ["**Top 10 Sincoin Holders**", ""];
      for (let i = 0; i < sorted.length; i++) {
        const [userId, userData] = sorted[i];
        lines.push(`${i + 1}. <@${userId}> — **${userData.balance.toLocaleString()} sincoins**`);
      }
      await send(ch, lines.join("\n"), token);
      break;
    }

    case "follow": {
      if (!targetId) { await send(ch, `Usage: \`${PREFIX}follow @user\``, token); break; }
      const targetUser = getUser(eco, targetId);
      if (!user.following) user.following = [];
      if (!targetUser.followers) targetUser.followers = [];
      if (user.following.includes(targetId)) {
        await send(ch, `❌ You're already following <@${targetId}>.`, token);
        break;
      }
      user.following.push(targetId);
      targetUser.followers.push(msg.author.id);
      awardAchievement(user, "follow_friend");
      saveUser();
      saveEconomy(eco);
      await send(ch, `✅ You're now following <@${targetId}>!`, token);
      break;
    }

    case "work": {
      const now = Date.now();
      const wait = user.workCooldown - now;
      if (wait > 0) {
        const hours = Math.floor(wait / (60 * 60 * 1000));
        const minutes = Math.floor((wait % (60 * 60 * 1000)) / (60 * 1000));
        await send(ch, `⏳ You need to wait **${hours}h ${minutes}m** before working again.`, token);
        break;
      }
      user.workCooldown = now + WORK_COOLDOWN_MS;
      const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];
      const pay = Math.floor(Math.random() * (job.maxPay - job.minPay + 1)) + job.minPay;
      user.balance += pay;
      saveUser();
      await send(ch, [`💼 **${job.name}**`, `> ${job.description}`, `💰 Earned: **${pay.toLocaleString()} sincoins**`].join("\n"), token);
      break;
    }

    case "opinion": {
      const targetUser = targetId ? getUser(eco, targetId) : user;
      const targetName = targetId ? (msg.mentions.find((m) => m.id === targetId)?.username ?? `<@${targetId}>`) : msg.author.username;
      const ego = getEgo(targetUser);
      const line = egoFlavorLine(targetName, ego);
      const stats = [
        `**Trust:** ${trustLabel(ego.trust)} (${ego.trust}/100)`,
        `**Fear:** ${fearLabel(ego.fear)} (${ego.fear}/100)`,
        `**Affection:** ${affectionLabel(ego.affection)} (${ego.affection}/100)`,
        `**Rivalry:** ${rivalryLabel(ego.rivalry)} (${ego.rivalry}/100)`,
      ];
      await send(ch, [`**My Opinion of ${targetName}**`, "", line, "", ...stats].join("\n"), token);
      break;
    }

    case "myopinion": {
      const ego = getEgo(user);
      const line = passiveEgoComment(msg.author.username, ego);
      if (!line) {
        await send(ch, `I don't have a strong opinion of you yet, **${msg.author.username}**.`, token);
      } else {
        await send(ch, line, token);
      }
      break;
    }

    case "dev": {
      if (!isDevUser(msg.author.id, eco)) {
        await send(ch, "❌ You don't have permission to use this command.", token);
        break;
      }
      const lines = [
        "**Developer Menu**",
        "",
        `\`${PREFIX}dev whitelist @user\` — Whitelist a user`,
        `\`${PREFIX}dev blacklist @user\` — Blacklist a user`,
        `\`${PREFIX}dev give @user <amount>\` — Give sincoins`,
        `\`${PREFIX}dev reset @user\` — Reset a user's data`,
      ];
      if (args[0] === "whitelist") {
        const targetUser = getUser(eco, targetId);
        targetUser.whitelisted = true;
        saveEconomy(eco);
        await send(ch, `✅ Whitelisted <@${targetId}>.`, token);
      } else if (args[0] === "blacklist") {
        const targetUser = getUser(eco, targetId);
        targetUser.blacklisted = true;
        saveEconomy(eco);
        await send(ch, `✅ Blacklisted <@${targetId}>.`, token);
      } else if (args[0] === "give") {
        const amount = parseInt(args[2]);
        if (isNaN(amount)) { await send(ch, `Usage: \`${PREFIX}dev give @user <amount>\``, token); break; }
        const targetUser = getUser(eco, targetId);
        targetUser.balance += amount;
        saveEconomy(eco);
        await send(ch, `✅ Gave **${amount.toLocaleString()} sincoins** to <@${targetId}>.`, token);
      } else if (args[0] === "reset") {
        delete eco[targetId];
        saveEconomy(eco);
        await send(ch, `✅ Reset <@${targetId}>'s data.`, token);
      } else {
        await send(ch, lines.join("\n"), token);
      }
      break;
    }

    default:
      await send(ch, `❌ Unknown command. Use \`${PREFIX}help\` for a list of commands.`, token);
  }
}

// ─── Bot startup ──────────────────────────────────────────────────────────────
async function startBot(token, selfId) {
  let heartbeatInterval = null;
  let statusInterval = null;
  let statusIndex = 0;
  let sequence = null;
  let reconnectDelay = 1000;
  const seenMessageIds = new Set();

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
            if (seenMessageIds.has(msg.id)) return;
            seenMessageIds.add(msg.id);
            setTimeout(() => seenMessageIds.delete(msg.id), 15000);
            const content = (msg.content ?? "").trim();
            console.log(`[Message] ${msg.author.username}: ${content || "(empty)"}`);
            if (msg.author.id === selfId) {
              const prefix = content.startsWith(PREFIX) ? PREFIX : content.startsWith(ALT_PREFIX) ? ALT_PREFIX : null;
              if (prefix) {
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
          }
          break;
        }
        case 7: ws.close(); break;
        case 9: reconnectDelay = 5000; ws.close(); break;
      }
    });

    ws.on("close", (code) => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }
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
  BOT_USER_ID = me.id;
  console.log(`Authenticated as: ${me.username} (${me.id})`);
  await startBot(token, me.id);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });

