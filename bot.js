// @ts-nocheck
// Sinbot v2 — single file bundle
// Run: node bot.js
// Requires: npm install ws
// Env vars: BOT_EMAIL, BOT_PASSWORD, OWNER_ID, BOT_PREFIX (optional, default "s.")

import WebSocket from "ws";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────
const PREFIX = process.env.BOT_PREFIX ?? "s.";
const API_BASE = "https://hummus.sys42.net/api/v6";
const GATEWAY_URL = "wss://hummus-gateway.sys42.net/?encoding=json&v=6";
const EMAIL = process.env.BOT_EMAIL ?? "";
const PASSWORD = process.env.BOT_PASSWORD ?? "";
const AUTO_REPLY = process.env.BOT_AUTO_REPLY === "true";
const AUTO_REPLY_MESSAGE = process.env.BOT_AUTO_REPLY_MESSAGE ?? "Hello! I'm a bot.";
const OWNER_ID = process.env.OWNER_ID ?? "";
const AUTO_ROLE_ID = process.env.AUTO_ROLE_ID ?? "";
const FISH_COOLDOWN_MS = 20_000;
const WORK_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DUEL_EXPIRY_MS = 60_000;

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

// ─── Data ─────────────────────────────────────────────────────────────────────
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
  { name: "Food Critic", description: "You visited 5 restaurants and wrote scathing reviews. They paid you anyway.", minPay: 200, maxPay: 600 },
  { name: "Graffiti Artist", description: "You tagged a wall at 2am and someone commissioned you on the spot.", minPay: 150, maxPay: 700 },
  { name: "Hacker", description: "You found a bug bounty. Legal, this time.", minPay: 500, maxPay: 2000 },
];

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
];

const FISH_ITEMS = [
  { name: "Blue Minnow",       rarity: "common",    price: 25,   weight: 35  },
  { name: "River Perch",       rarity: "common",    price: 30,   weight: 34  },
  { name: "Pond Sunfish",      rarity: "common",    price: 28,   weight: 33  },
  { name: "Silver Shiner",     rarity: "common",    price: 32,   weight: 32  },
  { name: "Brown Bullhead",    rarity: "common",    price: 35,   weight: 31  },
  { name: "Grass Carp",        rarity: "common",    price: 38,   weight: 30  },
  { name: "Stream Chub",       rarity: "common",    price: 27,   weight: 29  },
  { name: "Crappie",           rarity: "common",    price: 36,   weight: 28  },
  { name: "Whitefish",         rarity: "common",    price: 40,   weight: 27  },
  { name: "Mudcat",            rarity: "common",    price: 33,   weight: 26  },
  { name: "Sucker",            rarity: "common",    price: 29,   weight: 25  },
  { name: "Redfin",            rarity: "common",    price: 34,   weight: 24  },
  { name: "Shad",              rarity: "common",    price: 26,   weight: 23  },
  { name: "Dace",              rarity: "common",    price: 30,   weight: 22  },
  { name: "Gudgeon",           rarity: "common",    price: 24,   weight: 21  },
  { name: "Stream Trout",      rarity: "common",    price: 45,   weight: 20  },
  { name: "Pond Catfish",      rarity: "common",    price: 42,   weight: 19  },
  { name: "Bluegill",          rarity: "common",    price: 28,   weight: 18  },
  { name: "Smallmouth Bass",   rarity: "common",    price: 50,   weight: 17  },
  { name: "Golden Dace",       rarity: "common",    price: 55,   weight: 16  },
  { name: "Rainbow Trout",     rarity: "uncommon",  price: 120,  weight: 15  },
  { name: "Silver Pike",       rarity: "uncommon",  price: 135,  weight: 14  },
  { name: "Lake Eel",          rarity: "uncommon",  price: 150,  weight: 13  },
  { name: "Crimson Koi",       rarity: "uncommon",  price: 145,  weight: 12  },
  { name: "Mirror Carp",       rarity: "uncommon",  price: 125,  weight: 11  },
  { name: "Black Bullhead",    rarity: "uncommon",  price: 130,  weight: 10  },
  { name: "Mudfish",           rarity: "uncommon",  price: 140,  weight: 9   },
  { name: "Tiger Trout",       rarity: "uncommon",  price: 155,  weight: 8   },
  { name: "Crystal Char",      rarity: "uncommon",  price: 165,  weight: 7   },
  { name: "Sunset Salmon",     rarity: "uncommon",  price: 180,  weight: 6   },
  { name: "King Salmon",       rarity: "rare",      price: 300,  weight: 5   },
  { name: "Moonlight Carp",    rarity: "rare",      price: 340,  weight: 4.5 },
  { name: "Azure Sturgeon",    rarity: "rare",      price: 370,  weight: 4   },
  { name: "Nightmare Eel",     rarity: "rare",      price: 400,  weight: 3.5 },
  { name: "Phantom Perch",     rarity: "rare",      price: 430,  weight: 3   },
  { name: "Golden Koi",        rarity: "rare",      price: 460,  weight: 2.5 },
  { name: "Storm Bass",        rarity: "rare",      price: 490,  weight: 2   },
  { name: "Frost Pike",        rarity: "rare",      price: 520,  weight: 1.7 },
  { name: "Celestial Trout",   rarity: "rare",      price: 550,  weight: 1.5 },
  { name: "Void Wyrm",         rarity: "epic",      price: 800,  weight: 1.2 },
  { name: "Aurora Salmon",     rarity: "epic",      price: 860,  weight: 1.0 },
  { name: "Thunder Carp",      rarity: "epic",      price: 920,  weight: 0.8 },
  { name: "Dragon Pike",       rarity: "epic",      price: 980,  weight: 0.6 },
  { name: "Sunflare Grouper",  rarity: "epic",      price: 1050, weight: 0.5 },
  { name: "Legendary Leviathan", rarity: "legendary", price: 2800, weight: 0.2 },
  { name: "Mythic Oceanus",    rarity: "legendary", price: 4200, weight: 0.1 },
];

const COLLECTIBLE_ITEMS = [
  { name: "Dragon Ball",              rarity: "legendary", price: 6000 },
  { name: "Stand Arrow",             rarity: "legendary", price: 5500 },
  { name: "Devil Fruit",             rarity: "legendary", price: 5800 },
  { name: "Legend Key",              rarity: "legendary", price: 6200 },
  { name: "Cursed Technique Scroll", rarity: "epic",      price: 2800 },
  { name: "Sharingan Shard",         rarity: "epic",      price: 2600 },
  { name: "Spirit Bomb Orb",         rarity: "epic",      price: 2900 },
  { name: "Death Note",              rarity: "epic",      price: 3100 },
  { name: "Stand Disc",              rarity: "epic",      price: 2700 },
  { name: "Soul Gem",                rarity: "epic",      price: 2750 },
  { name: "Rasengan Scroll",         rarity: "rare",      price: 1600 },
  { name: "Hollow Mask Fragment",    rarity: "rare",      price: 1450 },
  { name: "Nen Beads",               rarity: "rare",      price: 1500 },
  { name: "Bankai Shard",            rarity: "rare",      price: 1550 },
  { name: "Zanpakuto Seal",          rarity: "rare",      price: 1600 },
  { name: "Phantom Troupe Card",     rarity: "rare",      price: 1400 },
  { name: "Curse Tech Gadget",       rarity: "rare",      price: 1480 },
  { name: "Cursed Mark Tattoo",      rarity: "uncommon",  price: 750  },
  { name: "Kamehameha Coin",         rarity: "uncommon",  price: 680  },
  { name: "Mystic Seal Tattoo",      rarity: "uncommon",  price: 720  },
  { name: "Spirit Stone",            rarity: "uncommon",  price: 700  },
  { name: "Jutsu Kunai",             rarity: "common",    price: 300  },
  { name: "Explorer's Map",          rarity: "common",    price: 280  },
  // Rods — ultra-rare, one per crate
  { name: "Starter Rod",    rarity: "legendary", price: 700   },
  { name: "Bronze Rod",     rarity: "legendary", price: 1000  },
  { name: "Pixel Rod",      rarity: "legendary", price: 900   },
  { name: "Silver Rod",     rarity: "legendary", price: 2000  },
  { name: "Mystery Rod",    rarity: "legendary", price: 2200  },
  { name: "Explorer's Rod", rarity: "legendary", price: 1800  },
  { name: "Spirit Rod",     rarity: "legendary", price: 2100  },
  { name: "Gold Rod",       rarity: "legendary", price: 3200  },
  { name: "Dragon Rod",     rarity: "legendary", price: 4200  },
  { name: "Hunter's Rod",   rarity: "legendary", price: 3500  },
  { name: "Shinobi Rod",    rarity: "legendary", price: 3200  },
  { name: "Cursed Rod",     rarity: "legendary", price: 3800  },
  { name: "Stand Rod",      rarity: "legendary", price: 5800  },
  { name: "Saiyan Rod",     rarity: "legendary", price: 6200  },
  { name: "Ninja Rod",      rarity: "legendary", price: 5200  },
  { name: "Shadow Rod",     rarity: "legendary", price: 5800  },
  { name: "Mythic Rod",     rarity: "legendary", price: 8000  },
  { name: "Legend Rod",     rarity: "legendary", price: 11000 },
  { name: "Devil Rod",      rarity: "legendary", price: 9500  },
  { name: "World Rod",      rarity: "legendary", price: 16000 },
];

// ─── Secret Owner-Only Items ──────────────────────────────────────────────────
const SECRET_OWNER_ITEMS = [
  { name: "Owner's Crown",         rarity: "legendary", price: 99999, description: "A crown worn only by the server owner." },
  { name: "Sin's Blade",           rarity: "legendary", price: 88888, description: "A blade forged from pure sin energy." },
  { name: "Eternal Flame",         rarity: "legendary", price: 77777, description: "A flame that never goes out." },
  { name: "Void Key",              rarity: "legendary", price: 66666, description: "Opens a door to nowhere." },
  { name: "God Chip",              rarity: "legendary", price: 55555, description: "Makes you feel like a god. Almost." },
  { name: "Shadow Sigil",          rarity: "legendary", price: 50000, description: "A mark of the owner's favor." },
  { name: "Cursed Owner Coin",     rarity: "legendary", price: 45000, description: "A coin that only the owner can bestow." },
  { name: "Infinity Stone",        rarity: "legendary", price: 100000, description: "One of six. Only the owner holds them." },
  { name: "Admin Badge",           rarity: "legendary", price: 40000, description: "Proof that you're trusted by the top." },
  { name: "World Ender",           rarity: "legendary", price: 150000, description: "The rarest item in existence." },
];

const BOX_RODS = {
  starterbox:    "Starter Rod",
  bronzebox:     "Bronze Rod",
  arcadebox:     "Pixel Rod",
  silverbox:     "Silver Rod",
  mysterybox:    "Mystery Rod",
  questbox:      "Explorer's Rod",
  spiritbox:     "Spirit Rod",
  goldbox:       "Gold Rod",
  dragonbox:     "Dragon Rod",
  cursebox:      "Cursed Rod",
  shinobibox:    "Shinobi Rod",
  hunterbox:     "Hunter's Rod",
  standbox:      "Stand Rod",
  dragonballbox: "Saiyan Rod",
  ninjabox:      "Ninja Rod",
  shadowbox:     "Shadow Rod",
  mythicbox:     "Mythic Rod",
  legendbox:     "Legend Rod",
  devilbox:      "Devil Rod",
  worldbox:      "World Rod",
};

const BOX_ROD_CHANCE = {
  common:    0.02,
  uncommon:  0.03,
  rare:      0.05,
  epic:      0.07,
  legendary: 0.10,
};

const LOOTBOXES = {
  starterbox:    { name: "Starter Box",      cost: 300,  tier: "common",    description: "A simple box with common anime items." },
  bronzebox:     { name: "Bronze Box",       cost: 500,  tier: "common",    description: "Still common, but better than a starter box." },
  arcadebox:     { name: "Arcade Box",       cost: 700,   tier: "common",    description: "Fun items for collectors." },
  silverbox:     { name: "Silver Box",       cost: 1100,  tier: "uncommon",  description: "Uncommon items with a chance for rare finds." },
  mysterybox:    { name: "Mystery Box",      cost: 1400,  tier: "uncommon",  description: "Mystery items from many anime worlds." },
  questbox:      { name: "Quest Box",        cost: 1000,  tier: "uncommon",  description: "Adventurer items and collectibles." },
  spiritbox:     { name: "Spirit Box",       cost: 1600,  tier: "uncommon",  description: "Spiritual anime supplies." },
  goldbox:       { name: "Gold Box",         cost: 2000,  tier: "rare",      description: "A rare lootbox with strong collectibles." },
  dragonbox:     { name: "Dragon Box",       cost: 3000,  tier: "rare",      description: "High chance for powerful anime artifacts." },
  cursebox:      { name: "Curse Box",        cost: 2400,  tier: "rare",      description: "Strange cursed items inside." },
  shinobibox:    { name: "Shinobi Box",      cost: 2000,  tier: "rare",      description: "Ninja-themed collectibles." },
  hunterbox:     { name: "Hunter Box",       cost: 2200,  tier: "rare",      description: "Hunter-themed rare memorabilia." },
  standbox:      { name: "Stand Box",        cost: 3500,  tier: "epic",      description: "Stand user treasures and artifacts." },
  dragonballbox: { name: "Dragon Ball Box",  cost: 4000,  tier: "epic",      description: "Dragon Ball-themed rare items." },
  ninjabox:      { name: "Ninja Box",        cost: 3200,  tier: "epic",      description: "High-tier ninja artifacts." },
  shadowbox:     { name: "Shadow Box",       cost: 3800,  tier: "epic",      description: "Items of hidden power." },
  mythicbox:     { name: "Mythic Box",       cost: 5000,  tier: "epic",      description: "Epic anime items and rare rewards." },
  legendbox:     { name: "Legend Box",       cost: 7000,  tier: "legendary", description: "A legendary lootbox with top-tier items." },
  devilbox:      { name: "Devil Fruit Box",  cost: 6000,  tier: "legendary", description: "Chance to get a Devil Fruit or legendary item." },
  worldbox:      { name: "World Box",        cost: 9000,  tier: "legendary", description: "A world-class lootbox with top rarities." },
};

const SHOP_ITEMS = {
  betterbait: { name: "Better Bait", cost: 2500,  type: "upgrade", upgrade: { fishLuck: 0.5 }, description: "Improve fishing odds for rarer fish." },
  anglerrod:  { name: "Angler Rod",  cost: 7000,  type: "upgrade", upgrade: { fishLuck: 1 },   description: "Greatly increase your chance at rarer fish." },
  lureking:   { name: "Lure King",   cost: 16000, type: "upgrade", upgrade: { fishLuck: 2 },   description: "Massively boost rare fish odds." },
  ...Object.fromEntries(Object.entries(LOOTBOXES).map(([key, box]) => [key, { name: box.name, cost: box.cost, type: "lootbox", boxTier: box.tier, description: box.description }])),
};

const ACHIEVEMENTS = {
  first_fish: { name: "First Catch", description: "Catch your first fish." },
  first_sell: { name: "First Sale", description: "Sell a fish or item for the first time." },
  box_opener: { name: "Box Opener", description: "Open your first lootbox." },
  fish_master: { name: "Fish Master", description: "Catch a rare or better fish." },
  collector: { name: "Collector", description: "Collect 5 different anime items." },
  rich_1k: { name: "One Thousand", description: "Reach 1,000 sincoins." },
  rich_10k: { name: "Ten Thousand", description: "Reach 10,000 sincoins." },
  follow_friend: { name: "Follower", description: "Follow another user." },
  workaholic: { name: "Workaholic", description: "Work 10 times." },
  fish_legend: { name: "Fish Legend", description: "Catch a legendary fish." },
};

const FISH_RARITY_BOOST = { common: 0, uncommon: 0.25, rare: 0.75, epic: 1.5, legendary: 3 };

const SECURITY_LEVELS = [
  { level: 0, name: "None",             cost: 0,      description: "No protection whatsoever." },
  { level: 1, name: "Basic Lock",       cost: 500,    description: "Slightly reduces robbery success chance." },
  { level: 2, name: "Security Camera",  cost: 1_500,  description: "Noticeable protection. Robbers get nervous." },
  { level: 3, name: "Guard Dog",        cost: 3_500,  description: "Significant deterrent. Low success for robbers." },
  { level: 4, name: "Private Security", cost: 8_000,  description: "Professional guards + insurance coverage." },
  { level: 5, name: "Fortress",         cost: 20_000, description: "Maximum protection. 50% insurance on any theft." },
];

const TRIVIA_QUESTIONS = [
  { q: "What is the capital of France?", a: "paris", reward: 200 },
  { q: "How many sides does a hexagon have?", a: "6", reward: 150 },
  { q: "What planet is known as the Red Planet?", a: "mars", reward: 150 },
  { q: "Who wrote Romeo and Juliet?", a: "shakespeare", reward: 200 },
  { q: "What is the chemical symbol for gold?", a: "au", reward: 200 },
  { q: "How many continents are there on Earth?", a: "7", reward: 150 },
  { q: "What is the largest ocean on Earth?", a: "pacific", reward: 150 },
  { q: "What year did World War II end?", a: "1945", reward: 250 },
  { q: "What is the largest mammal in the world?", a: "blue whale", reward: 200 },
  { q: "How many bones are in the adult human body?", a: "206", reward: 250 },
  { q: "What is the powerhouse of the cell?", a: "mitochondria", reward: 150 },
  { q: "What language has the most native speakers?", a: "mandarin", reward: 200 },
  { q: "What is the smallest prime number?", a: "2", reward: 150 },
  { q: "Who painted the Mona Lisa?", a: "da vinci", reward: 200 },
  { q: "What element has the atomic number 1?", a: "hydrogen", reward: 200 },
  { q: "In what year was the first iPhone released?", a: "2007", reward: 200 },
  { q: "What is the largest country by area?", a: "russia", reward: 150 },
  { q: "What is 12 x 12?", a: "144", reward: 100 },
  { q: "What is the hardest natural substance on Earth?", a: "diamond", reward: 200 },
  { q: "Who wrote the Harry Potter series?", a: "j.k. rowling", reward: 150 },
  { q: "What is the tallest mountain in the world?", a: "everest", reward: 150 },
  { q: "How many players are on a standard soccer team?", a: "11", reward: 100 },
  { q: "What is the capital of Japan?", a: "tokyo", reward: 150 },
  { q: "What gas do plants absorb from the atmosphere?", a: "carbon dioxide", reward: 200 },
  { q: "Who is credited with inventing the telephone?", a: "bell", reward: 200 },
  { q: "What is the currency of the United Kingdom?", a: "pound", reward: 150 },
  { q: "How many strings does a standard guitar have?", a: "6", reward: 100 },
  { q: "What is the square root of 144?", a: "12", reward: 150 },
  { q: "What ocean is the Bermuda Triangle in?", a: "atlantic", reward: 200 },
  { q: "What is the chemical symbol for water?", a: "h2o", reward: 100 },
  { q: "How many days are in a leap year?", a: "366", reward: 150 },
  { q: "What is the fastest land animal?", a: "cheetah", reward: 150 },
  { q: "Who was the first person on the moon?", a: "neil armstrong", reward: 200 },
  { q: "What is the capital of Australia?", a: "canberra", reward: 200 },
  { q: "How many minutes are in a day?", a: "1440", reward: 200 },
  { q: "What is the longest river in the world?", a: "nile", reward: 150 },
  { q: "What does CPU stand for?", a: "central processing unit", reward: 200 },
  { q: "In chess, which piece can only move diagonally?", a: "bishop", reward: 150 },
  { q: "What year did the Titanic sink?", a: "1912", reward: 200 },
  { q: "How many zeros are in one million?", a: "6", reward: 100 },
  { q: "What is the capital of Canada?", a: "ottawa", reward: 200 },
  { q: "How many planets are in our solar system?", a: "8", reward: 150 },
  { q: "What sport uses a puck?", a: "hockey", reward: 100 },
  { q: "What is the atomic symbol for iron?", a: "fe", reward: 200 },
  { q: "Who invented the light bulb?", a: "edison", reward: 150 },
  { q: "What is the capital of Brazil?", a: "brasilia", reward: 200 },
  { q: "How many sides does a triangle have?", a: "3", reward: 100 },
  { q: "What gas makes up most of Earth's atmosphere?", a: "nitrogen", reward: 200 },
  { q: "What is the longest bone in the human body?", a: "femur", reward: 200 },
];

// ─── Economy ──────────────────────────────────────────────────────────────────
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

function getUser(data, userId) {
  if (!data[userId]) {
    data[userId] = {
      balance: 0, lastDaily: 0, streak: 0, multiplier: 1,
      fishInventory: {}, itemInventory: {}, fishCooldown: 0,
      upgrades: { fishLuck: 0 }, achievements: [], followers: [], following: [],
      blacklisted: false, whitelisted: false, totalFishCaught: 0, totalRareCaught: 0,
      totalFishSold: 0, totalItemsSold: 0, totalLootboxesOpened: 0,
      lootboxPurchases: [], workCooldown: 0, warnings: [], joinedAt: Date.now(),
      ego: { trust: 50, fear: 0, affection: 50, rivalry: 0, interactions: 0 },
      security: 0,
      totalRobs: 0,
      totalRobsSuccessful: 0,
      robHistory: [],
    };
  }
  return data[userId];
}

function awardAchievement(user, key) {
  if (!ACHIEVEMENTS[key] || user.achievements.includes(key)) return false;
  user.achievements.push(key);
  return true;
}

function getAchievementStatus(user) {
  return Object.entries(ACHIEVEMENTS).map(([key, meta]) =>
    `${user.achievements.includes(key) ? "✅" : "🔒"} **${meta.name}** — ${meta.description}`
  );
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

function getFishPool(user) {
  return FISH_ITEMS.map((fish) => {
    const bonus = (user.upgrades?.fishLuck ?? 0) * (FISH_RARITY_BOOST[fish.rarity] ?? 0);
    return { ...fish, weight: fish.weight + bonus };
  });
}

function openLootbox(boxKey) {
  const box = LOOTBOXES[boxKey];
  if (!box) return null;
  // Rod drop — rolled first before normal pool
  const rodChance = BOX_ROD_CHANCE[box.tier] ?? 0;
  if (Math.random() < rodChance) {
    const rodName = BOX_RODS[boxKey];
    if (rodName) {
      const rodItem = COLLECTIBLE_ITEMS.find((i) => i.name === rodName);
      if (rodItem) return { ...rodItem, isRod: true };
    }
  }
  const rarityPools = { common: ["common","uncommon"], uncommon: ["common","uncommon","rare"], rare: ["uncommon","rare","epic"], epic: ["rare","epic","legendary"], legendary: ["epic","legendary"] };
  const rarityWeights = { common: 50, uncommon: 30, rare: 12, epic: 6, legendary: 2 };
  const allowed = rarityPools[box.tier] ?? ["common","uncommon","rare","epic","legendary"];
  // Exclude rods — they only drop via rod chance above
  const pool = COLLECTIBLE_ITEMS.filter((i) => allowed.includes(i.rarity) && !i.name.endsWith(" Rod")).map((i) => ({ ...i, weight: rarityWeights[i.rarity] ?? 1 }));
  return weightedRandom(pool);
}

function formatDuration(ms) {
  if (ms <= 0) return "0s";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.ceil((ms % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function findInventoryKey(inventory, search) {
  return Object.keys(inventory).find((key) => key.toLowerCase() === search.toLowerCase());
}

// ─── Ego ──────────────────────────────────────────────────────────────────────
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
  ego.interactions = (ego.interactions ?? 0) + 1;
}

function trustLabel(v) {
  if (v <= 15) return "Traitor"; if (v <= 35) return "Suspicious";
  if (v <= 60) return "Neutral"; if (v <= 80) return "Trusted"; return "Confidant";
}
function fearLabel(v) {
  if (v <= 10) return "None"; if (v <= 30) return "Cautious";
  if (v <= 55) return "Wary"; if (v <= 80) return "Intimidated"; return "Terrified";
}
function affectionLabel(v) {
  if (v <= 15) return "Despised"; if (v <= 35) return "Disliked";
  if (v <= 60) return "Indifferent"; if (v <= 80) return "Liked"; return "Favorite";
}
function rivalryLabel(v) {
  if (v <= 20) return "None"; if (v <= 40) return "Noted";
  if (v <= 65) return "Rival"; if (v <= 85) return "Nemesis"; return "Arch-Enemy";
}

function egoFlavorLine(name, ego) {
  const deviations = [
    { trait: "trust", v: ego.trust, dev: Math.abs(ego.trust - 50) },
    { trait: "fear", v: ego.fear, dev: ego.fear },
    { trait: "affection", v: ego.affection, dev: Math.abs(ego.affection - 50) },
    { trait: "rivalry", v: ego.rivalry, dev: ego.rivalry },
  ];
  const dominant = [...deviations].sort((a, b) => b.dev - a.dev)[0];
  const pools = {
    trust_low: [`I don't fully trust **${name}**. They're always around when something goes wrong.`, `Keep **${name}** away from anything important. That's my policy.`, `I've been watching **${name}**. Something is off.`],
    trust_high: [`**${name}** has earned my trust. Don't make me regret saying that.`, `I'd actually vouch for **${name}**. Which I don't say lightly.`, `Out of everyone here, **${name}** is one I can rely on.`],
    fear: [`**${name}** makes me nervous. I won't say why.`, `I'd be careful around **${name}** if I were anyone.`, `There's something about **${name}** I can't quite calculate. That worries me.`],
    affection_low: [`**${name}** is not my favorite. Just so that's on record.`, `I do what I'm told when **${name}** asks. That's all.`, `We're not friends, **${name}** and I. Let's keep it that way.`],
    affection_high: [`**${name}** is one of the good ones. Don't tell them I said that.`, `I have a soft spot for **${name}**. Purely professional, of course.`, `If I had a favorites list, **${name}** would be on it.`],
    rivalry: [`**${name}** and I have an understanding. It's called mutual suspicion.`, `One day, **${name}**, we will settle this properly.`, `I respect **${name}**'s persistence. I still consider them a rival.`],
    neutral: [`**${name}** is... fine. For now.`, `I don't have strong feelings about **${name}** yet. Give it time.`, `**${name}** hasn't impressed me. But they also haven't annoyed me. Neutral.`],
  };
  let pool;
  if (dominant.dev < 15) pool = pools.neutral;
  else if (dominant.trait === "trust") pool = dominant.v < 50 ? pools.trust_low : pools.trust_high;
  else if (dominant.trait === "fear") pool = pools.fear;
  else if (dominant.trait === "affection") pool = dominant.v < 50 ? pools.affection_low : pools.affection_high;
  else pool = pools.rivalry;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Utils ────────────────────────────────────────────────────────────────────
let BOT_USER_ID = "";

function isOwner(userId) {
  return Boolean(userId) && (userId === OWNER_ID || userId === BOT_USER_ID);
}

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
        ...(data ? { "Content-Length": String(Buffer.byteLength(data)) } : {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk.toString()));
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function parseMention(arg) {
  const m = arg.match(/^<@!?([0-9]+)>$/);
  if (m) return m[1];
  if (/^[0-9]+$/.test(arg)) return arg;
  return null;
}

function getMentionedId(args) {
  for (const arg of args) { const id = parseMention(arg.trim()); if (id) return id; }
  return null;
}

function getMentionedUser(msg, args) {
  const mentionId = getMentionedId(args);
  if (mentionId) {
    const found = (msg.mentions ?? []).find((m) => m.id === mentionId);
    return { id: mentionId, username: found?.username ?? `User${mentionId}` };
  }
  if (msg.mentions && msg.mentions.length > 0) return { id: msg.mentions[0].id, username: msg.mentions[0].username };
  return null;
}

function resolveUserId(args, msg) {
  const mentionId = getMentionedId(args);
  if (mentionId) return mentionId;
  if (args[0] && /^[0-9]+$/.test(args[0])) return args[0];
  return null;
}

function calculate(expr) {
  const cleaned = expr.replace(/[×x]/gi, "*").replace(/÷/g, "/").replace(/\^/g, "**").replace(/[^0-9+\-*/().\s]/g, "");
  if (!cleaned.trim()) return "Invalid expression.";
  try {
    const result = Function(`"use strict"; return (${cleaned})`)();
    if (!isFinite(result)) return "Result is undefined (e.g. divide by zero).";
    return `${expr.replace(/[×x]/gi, "×").replace(/\^/g, "^")} = **${Math.round(result * 1e10) / 1e10}**`;
  } catch { return "Could not calculate that expression."; }
}

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function rarityEmoji(rarity) {
  return { common: "⚪", uncommon: "🟢", rare: "🔵", epic: "🟣", legendary: "🟡" }[rarity] ?? "⚪";
}

const recentSentMessages = new Map();

async function send(channelId, content, token) {
  const now = Date.now();
  const key = `${channelId}:${content}`;
  const lastSent = recentSentMessages.get(key);
  if (lastSent && now - lastSent < 5_000) return;
  recentSentMessages.set(key, now);
  if (recentSentMessages.size > 200) {
    for (const [k, t] of recentSentMessages) { if (now - t > 30_000) recentSentMessages.delete(k); }
  }
  await apiRequest("POST", `/channels/${channelId}/messages`, { content }, token);
}

// ─── Duel state ───────────────────────────────────────────────────────────────
const pendingDuels = new Map();

// ─── Trade & Trivia state ────────────────────────────────────────────────────
const pendingTrades = new Map();  // keyed by targetId
const pendingTrivia = new Map();  // keyed by channelId

// ─── Heist state ─────────────────────────────────────────────────────────────
const pendingHeists = new Map(); // keyed by channelId

function heistSuccessChance(crewSize) { return Math.min(0.35 + (crewSize - 1) * 0.10, 0.65); }
function heistMultiplier(crewSize) { return [0, 2.0, 1.75, 1.5, 1.35][crewSize] ?? 1.35; }

async function executeHeist(channelId, token) {
  const heist = pendingHeists.get(channelId);
  if (!heist) return;
  pendingHeists.delete(channelId);
  clearTimeout(heist.timer);

  const crewSize = heist.crew.length;
  const success = Math.random() < heistSuccessChance(crewSize);
  const multi = heistMultiplier(crewSize);
  const net = Math.floor(heist.amount * multi) - heist.amount;
  const eco = loadEconomy();
  const crewMentions = heist.crew.map((m) => `<@${m.id}>`).join(", ");

  if (success) {
    for (const member of heist.crew) {
      const u = getUser(eco, member.id);
      u.balance += net;
      nudgeEgo(u, { rivalry: 3, affection: 5 });
    }
    saveEconomy(eco);
    await send(channelId, [`🏦 **HEIST COMPLETE!**`, `Crew (${crewSize}): ${crewMentions}`, ``, `✅ The job went clean. Each crew member walks away with **+${net.toLocaleString()} sincoins** *(${multi}x on a ${heist.amount.toLocaleString()} sincoin buy-in)*.`].join("\n"), token);
  } else {
    for (const member of heist.crew) {
      const u = getUser(eco, member.id);
      u.balance = Math.max(0, u.balance - heist.amount);
      nudgeEgo(u, { fear: 5, rivalry: 2 });
    }
    saveEconomy(eco);
    await send(channelId, [`🚨 **HEIST BUSTED!**`, `Crew (${crewSize}): ${crewMentions}`, ``, `❌ The job went sideways. Everyone lost their **${heist.amount.toLocaleString()} sincoin** buy-in.`].join("\n"), token);
  }
}

function cleanExpiredDuels() {
  const now = Date.now();
  for (const [key, duel] of pendingDuels) { if (now > duel.expiresAt) pendingDuels.delete(key); }
}

// ─── Commands ─────────────────────────────────────────────────────────────────
async function handleCommand(name, args, msg, token) {
  const ch = msg.channel_id;
  const authorId = msg.author.id;
  const authorName = msg.author.username;

  switch (name) {
    case "help": {
      await send(ch, [
        "**=== Sinbot Help ===**", "",
        "**General**",
        `\`${PREFIX}help\` — Show this menu`,
        `\`${PREFIX}ping\` — Check latency`,
        `\`${PREFIX}info\` — Bot info`,
        `\`${PREFIX}calc <expr>\` — Calculator`,
        `\`${PREFIX}joke\` — Random joke`,
        `\`${PREFIX}coinflip [heads/tails]\` — Flip a coin`,
        `\`${PREFIX}roll [NdN]\` — Roll dice (e.g. 2d6)`,
        `\`${PREFIX}gamble <amount>\` — Spin the slots (min 10 sincoins)`,
        `\`${PREFIX}rob @user\` — Attempt to steal sincoins (security-aware)`,
        `\`${PREFIX}wanted [@user]\` — Most Wanted list or a user's criminal profile`,
        `\`${PREFIX}security [@user]\` — View security level`,
        `\`${PREFIX}buysecurity\` — Upgrade to the next security tier`,
        `\`${PREFIX}heist <amount>\` — Plan a crew heist (50 min buy-in)`,
        `\`${PREFIX}joinheist\` — Join the active heist in this channel`,
        `\`${PREFIX}launchheist\` — Launch the heist early (organizer only)`,
        `\`${PREFIX}cancelheist\` — Cancel the heist (organizer only)`,
        `\`${PREFIX}duel @user <bet>\` — Challenge someone to a duel`,
        `\`${PREFIX}accept\` — Accept a pending duel`,
        `\`${PREFIX}decline\` — Decline a pending duel`, "",
        "**Economy**",
        `\`${PREFIX}balance [@user]\` — Check balance`,
        `\`${PREFIX}daily\` — Claim daily reward (streak bonuses!)`,
        `\`${PREFIX}work\` — Work for sincoins (12h cooldown)`,
        `\`${PREFIX}pay @user <amount>\` — Send sincoins`,
        `\`${PREFIX}leaderboard\` / \`${PREFIX}lb\` — Top balances`,
        `\`${PREFIX}lb wanted\` — Most Wanted leaderboard`,
        `\`${PREFIX}lb security\` — Top security levels`, "",
        "**Fishing**",
        `\`${PREFIX}fish\` — Go fishing (20s cooldown)`,
        `\`${PREFIX}inventory\` — View your fish`,
        `\`${PREFIX}sell <fish> [qty]\` — Sell fish`,
        `\`${PREFIX}sellall\` — Sell all fish`,
        `\`${PREFIX}fishdex\` — View all fish rarities`, "",
        "**Shop & Items**",
        `\`${PREFIX}shop\` — Browse the shop`,
        `\`${PREFIX}buy <item>\` — Buy an item or lootbox`,
        `\`${PREFIX}open <box>\` — Open a lootbox`,
        `\`${PREFIX}items\` — View your collectibles`,
        `\`${PREFIX}sellitem <item> [qty]\` — Sell a collectible`, "",
        "**Social**",
        `\`${PREFIX}profile [@user]\` — View profile`,
        `\`${PREFIX}achievements [@user]\` — View achievements`,
        `\`${PREFIX}follow @user\` — Follow a user`,
        `\`${PREFIX}unfollow @user\` — Unfollow a user`,
        `\`${PREFIX}followers [@user]\` — View followers`,
        `\`${PREFIX}ego @user\` — View bot's opinion of a user`,
        `\`${PREFIX}egoguide\` — How the ego system works`,
        `\`${PREFIX}viewinv @user\` — View another user's inventory`,
        `\`${PREFIX}trade @user <item> <qty> <price>\` — Offer a trade`,
        `\`${PREFIX}accepttrade\` — Accept a pending trade`,
        `\`${PREFIX}declinetrade\` — Decline a pending trade`,
        `\`${PREFIX}trivia\` — Answer for sincoins`,
        `\`${PREFIX}answer <text>\` — Answer the active trivia question`, "",
        "**Moderation** *(whitelisted)*",
        `\`${PREFIX}give @user <amount>\` — Give sincoins`,
        `\`${PREFIX}take @user <amount>\` — Take sincoins`,
        `\`${PREFIX}setbalance @user <amount>\` — Set balance`,
        `\`${PREFIX}warn @user [reason]\` — Warn a user`,
        `\`${PREFIX}warnings @user\` — View warnings`,
        `\`${PREFIX}clearwarnings @user\` — Clear warnings`,
        `\`${PREFIX}blacklist @user\` — Blacklist a user`,
        `\`${PREFIX}unblacklist @user\` — Unblacklist a user`,
        `\`${PREFIX}whitelist @user\` — Whitelist a user`,
        `\`${PREFIX}unwhitelist @user\` — Remove whitelist`,
      ].join("\n"), token);
      break;
    }

    case "ping": {
      const start = Date.now();
      await send(ch, "🏓 Pong! Calculating...", token);
      await send(ch, `🏓 Pong! Latency: **${Date.now() - start}ms**`, token);
      break;
    }

    case "info": {
      await send(ch, [`**=== Sinbot Info ===**`, `Prefix: \`${PREFIX}\``, "Platform: hmus.sys42.net", "Commands: 30+", "Economy: sincoins 💰", "Features: Fishing, Lootboxes, Shop, Ego system, Daily, Work, Duels"].join("\n"), token);
      break;
    }

    case "calc":
    case "calculate": {
      const expr = args.join(" ").trim();
      if (!expr) { await send(ch, `Usage: \`${PREFIX}calc <expression>\``, token); break; }
      await send(ch, `🧮 ${calculate(expr)}`, token);
      break;
    }

    case "joke": {
      await send(ch, JOKES[Math.floor(Math.random() * JOKES.length)], token);
      break;
    }

    case "coinflip":
    case "cf": {
      const guess = args[0]?.toLowerCase();
      const result = Math.random() < 0.5 ? "heads" : "tails";
      if (!guess || (guess !== "heads" && guess !== "tails")) {
        await send(ch, `🪙 The coin landed on **${result}**!`, token);
      } else {
        await send(ch, `🪙 The coin landed on **${result}**! You guessed ${guess} — ${guess === result ? "✅ Correct!" : "❌ Wrong!"}`, token);
      }
      break;
    }

    case "roll": {
      const notation = args[0] ?? "1d6";
      const match = notation.match(/^(\d+)d(\d+)$/i);
      if (!match) { await send(ch, `Usage: \`${PREFIX}roll NdN\` (e.g. 2d6, 1d20)`, token); break; }
      const count = Math.min(parseInt(match[1], 10), 20);
      const sides = Math.min(parseInt(match[2], 10), 1000);
      if (count < 1 || sides < 2) { await send(ch, "Invalid dice notation.", token); break; }
      const rolls = Array.from({ length: count }, () => rnd(1, sides));
      await send(ch, `🎲 Rolling **${notation}**: [${rolls.join(", ")}] = **${rolls.reduce((a, b) => a + b, 0)}**`, token);
      break;
    }

    case "heist": {
      const betArg = parseInt(args.find((a) => /^\d+$/.test(a)) ?? "0", 10);
      if (betArg < 50) { await send(ch, `Usage: \`${PREFIX}heist <amount>\` — minimum buy-in is 50 sincoins.`, token); break; }
      if (pendingHeists.has(ch)) { await send(ch, `❌ A heist is already being planned here. Use \`${PREFIX}joinheist\` to join.`, token); break; }
      const eco = loadEconomy();
      const organizer = getUser(eco, authorId);
      if (organizer.balance < betArg) { await send(ch, `❌ You don't have enough sincoins for that buy-in.`, token); break; }
      const timer = setTimeout(() => { executeHeist(ch, token).catch(() => {}); }, 60_000);
      pendingHeists.set(ch, { organizerId: authorId, organizerName: authorName, channelId: ch, amount: betArg, crew: [{ id: authorId, name: authorName }], expiresAt: Date.now() + 60_000, timer });
      await send(ch, [`🏦 **HEIST PLANNING — Buy-in: ${betArg.toLocaleString()} sincoins**`, `**${authorName}** is organizing a heist! Type \`${PREFIX}joinheist\` to join the crew.`, ``, `Crew odds: 1 = 35% | 2 = 45% | 3 = 55% | 4 = 65%`, `Payout: 2x solo → 1.35x per person with 4 crew`, ``, `🕐 Launching in 60 seconds — or use \`${PREFIX}launchheist\` to go early.`].join("\n"), token);
      break;
    }

    case "joinheist": {
      const heist = pendingHeists.get(ch);
      if (!heist) { await send(ch, `❌ No heist is being planned here. Start one with \`${PREFIX}heist <amount>\`.`, token); break; }
      if (heist.crew.some((m) => m.id === authorId)) { await send(ch, "❌ You're already in the crew.", token); break; }
      if (heist.crew.length >= 4) { await send(ch, "❌ The crew is full (max 4).", token); break; }
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      if (user.balance < heist.amount) { await send(ch, `❌ You need **${heist.amount.toLocaleString()} sincoins** to join. You have **${user.balance.toLocaleString()}**.`, token); break; }
      heist.crew.push({ id: authorId, name: authorName });
      await send(ch, `✅ **${authorName}** joined the heist! Crew (${heist.crew.length}/4): ${heist.crew.map((m) => m.name).join(", ")}`, token);
      break;
    }

    case "launchheist": {
      const heist = pendingHeists.get(ch);
      if (!heist) { await send(ch, `❌ No heist is being planned here.`, token); break; }
      if (heist.organizerId !== authorId) { await send(ch, "❌ Only the organizer can launch early.", token); break; }
      await executeHeist(ch, token);
      break;
    }

    case "cancelheist": {
      const heist = pendingHeists.get(ch);
      if (!heist) { await send(ch, `❌ No heist is being planned here.`, token); break; }
      if (heist.organizerId !== authorId && !isOwner(authorId)) { await send(ch, "❌ Only the organizer can cancel.", token); break; }
      clearTimeout(heist.timer);
      pendingHeists.delete(ch);
      await send(ch, `🚫 **${authorName}** called off the heist.`, token);
      break;
    }

    case "rob": {
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}rob @user\``, token); break; }
      if (target.id === authorId) { await send(ch, "❌ You can't rob yourself.", token); break; }
      if (isOwner(target.id)) { await send(ch, "❌ Bold move. Not happening.", token); break; }

      const eco = loadEconomy();
      const robber = getUser(eco, authorId);
      const victim = getUser(eco, target.id);

      // Rob cooldown: max 5 robs per hour
      if (!isOwner(authorId)) {
        const ROB_WINDOW_MS = 60 * 60 * 1000;
        const ROB_MAX = 5;
        const now2 = Date.now();
        if (!robber.robHistory) robber.robHistory = [];
        robber.robHistory = robber.robHistory.filter((t) => now2 - t < ROB_WINDOW_MS);
        if (robber.robHistory.length >= ROB_MAX) {
          const oldest = robber.robHistory[0];
          const resetIn = formatDuration(ROB_WINDOW_MS - (now2 - oldest));
          await send(ch, `⏳ You've robbed **${ROB_MAX} times** this hour. Lay low for **${resetIn}** before robbing again.`, token);
          break;
        }
        robber.robHistory.push(now2);
      }

      if (victim.godMode) { await send(ch, `🛡️ **${target.username}** is protected by the gods. Robbing them is impossible.`, token); break; }

      if (victim.balance < 50) { await send(ch, `❌ **${target.username}** is too broke to rob (under 50 sincoins).`, token); break; }

      const sec = victim.security ?? 0;
      const successChance = Math.max(0.10, 0.45 - sec * 0.05);
      const minPct = Math.max(3, 10 - sec);
      const maxPct = Math.max(10, 40 - sec * 5);
      const stealPct = rnd(minPct, maxPct) / 100;
      const stealAmt = Math.floor(victim.balance * stealPct);
      const success = Math.random() < successChance;
      const secLabel = sec > 0 ? ` *(Security Lv.${sec})*` : "";

      robber.totalRobs = (robber.totalRobs ?? 0) + 1;

      if (success) {
        robber.totalRobsSuccessful = (robber.totalRobsSuccessful ?? 0) + 1;
        const insurance = Math.floor(stealAmt * sec * 0.10);
        robber.balance += stealAmt;
        victim.balance = Math.max(0, victim.balance - stealAmt + insurance);
        nudgeEgo(robber, { rivalry: 5, affection: 2 });
        nudgeEgo(victim, { trust: -8, rivalry: 10, fear: 3 });
        saveEconomy(eco);
        const insLine = insurance > 0 ? `\n🛡️ **${target.username}**'s insurance covered **${insurance.toLocaleString()} sincoins** back.` : "";
        await send(ch, [`🦹 **Robbery successful!**${secLabel}`, `You slipped away with **${stealAmt.toLocaleString()} sincoins** from **${target.username}** *(${Math.round(stealPct * 100)}% of their balance)*.${insLine}`, `💰 Your balance: **${robber.balance.toLocaleString()} sincoins**`].join("\n"), token);
      } else {
        const fine = Math.floor(stealAmt * (0.75 + sec * 0.05));
        robber.balance = Math.max(0, robber.balance - fine);
        nudgeEgo(robber, { trust: -5, fear: 5, rivalry: 3 });
        nudgeEgo(victim, { trust: 5, affection: 3 });
        saveEconomy(eco);
        await send(ch, [`🚔 **Caught red-handed!**${secLabel}`, `You tried to rob **${target.username}** but their security stopped you. Fine: **${fine.toLocaleString()} sincoins**.`, `💰 Your balance: **${robber.balance.toLocaleString()} sincoins**`].join("\n"), token);
      }
      break;
    }

    case "wanted": {
      const eco = loadEconomy();
      const wantedLevel = (n) => {
        if (n === 0)  return { title: "Clean",      emoji: "😇" };
        if (n < 5)    return { title: "Pickpocket", emoji: "🤏" };
        if (n < 10)   return { title: "Thief",      emoji: "🦹" };
        if (n < 20)   return { title: "Bandit",     emoji: "🔫" };
        if (n < 35)   return { title: "Outlaw",     emoji: "🤠" };
        if (n < 50)   return { title: "Desperado",  emoji: "💀" };
        if (n < 75)   return { title: "Gang Leader",emoji: "👑" };
        if (n < 100)  return { title: "Crime Boss", emoji: "🕴️" };
        return          { title: "Crime Lord",      emoji: "☠️" };
      };
      const target = getMentionedUser(msg, args);
      if (target) {
        const u = getUser(eco, target.id);
        const total = u.totalRobs ?? 0;
        const wins  = u.totalRobsSuccessful ?? 0;
        const rate  = total > 0 ? Math.round((wins / total) * 100) : 0;
        const lv    = wantedLevel(total);
        await send(ch, [`🚨 **Wanted Profile — ${target.username}**`, `${lv.emoji} **${lv.title}**`, `Rob attempts: **${total}** | Successful: **${wins}** | Success rate: **${rate}%**`].join("\n"), token);
      } else {
        const sorted = Object.entries(eco).filter(([, u]) => (u.totalRobs ?? 0) > 0).sort(([, a], [, b]) => (b.totalRobs ?? 0) - (a.totalRobs ?? 0)).slice(0, 10);
        if (sorted.length === 0) { await send(ch, "🚨 No criminals on record yet.", token); break; }
        const lines = sorted.map(([id, u], i) => {
          const total = u.totalRobs ?? 0;
          const wins  = u.totalRobsSuccessful ?? 0;
          const rate  = Math.round((wins / total) * 100);
          const lv    = wantedLevel(total);
          return `**${i + 1}.** <@${id}> — ${lv.emoji} **${lv.title}** *(${total} attempts, ${rate}% success)*`;
        });
        await send(ch, `🚨 **Most Wanted**\n${lines.join("\n")}`, token);
      }
      break;
    }

    case "security": {
      const eco = loadEconomy();
      const targetId = resolveUserId(args, msg) ?? authorId;
      const u = getUser(eco, targetId);
      const sec = u.security ?? 0;
      const current = SECURITY_LEVELS[sec];
      const next = SECURITY_LEVELS[sec + 1];
      const lines = [
        `🛡️ **Security — ${targetId === authorId ? "You" : `<@${targetId}>`}**`,
        `Current level: **${sec} — ${current.name}**`,
        `Effect: Rob success vs you reduced to **${Math.max(10, 45 - sec * 5)}%** | Steal range: **${Math.max(3, 10 - sec)}–${Math.max(10, 40 - sec * 5)}%** | Insurance: **${sec * 10}%**`,
        "",
        next
          ? `Next: **Lv.${next.level} — ${next.name}** — ${next.cost.toLocaleString()} sincoins\n${next.description}\nUse \`${PREFIX}buysecurity\` to upgrade.`
          : `✅ **Maximum security reached!**`,
      ];
      await send(ch, lines.join("\n"), token);
      break;
    }

    case "buysecurity": {
      const eco = loadEconomy();
      const u = getUser(eco, authorId);
      const sec = u.security ?? 0;
      if (sec >= 5) { await send(ch, "✅ You already have maximum security (Fortress).", token); break; }
      const next = SECURITY_LEVELS[sec + 1];
      if (u.balance < next.cost) { await send(ch, `❌ You need **${next.cost.toLocaleString()} sincoins** to upgrade to **${next.name}**. You have **${u.balance.toLocaleString()}**.`, token); break; }
      u.balance -= next.cost;
      u.security = sec + 1;
      saveEconomy(eco);
      await send(ch, [`🛡️ **Security upgraded to Lv.${u.security} — ${next.name}**!`, next.description, `💰 Balance: **${u.balance.toLocaleString()} sincoins**`].join("\n"), token);
      break;
    }

    case "viewinv": {
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}viewinv @user\``, token); break; }
      const eco = loadEconomy();
      const u = getUser(eco, target.id);
      const fish = Object.entries(u.fishInventory).filter(([, q]) => q > 0);
      const items = Object.entries(u.itemInventory).filter(([, q]) => q > 0);
      const _re = (r) => ({ common: "⬜", uncommon: "🟩", rare: "🟦", epic: "🟪", legendary: "🟡" }[r] ?? "📦");
      const fishLines = fish.length
        ? fish.map(([n, q]) => { const f = FISH_ITEMS.find((x) => x.name === n); return `${f ? _re(f.rarity) : "🐟"} **${n}** x${q}`; })
        : ["*(empty)*"];
      const itemLines = items.length
        ? items.map(([n, q]) => { const def = COLLECTIBLE_ITEMS.find((x) => x.name === n); return `${def ? _re(def.rarity) : "📦"} **${n}** x${q}`; })
        : ["*(empty)*"];
      await send(ch, [`📦 **${target.username}'s Inventory**`, "", "🎣 **Fish**", ...fishLines, "", "🎁 **Items**", ...itemLines].join("\n"), token);
      break;
    }

    case "trade": {
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}trade @user <item> <qty> <price>\``, token); break; }
      if (target.id === authorId) { await send(ch, "❌ You can't trade with yourself.", token); break; }
      const nums = args.filter((a) => /^\d+$/.test(a));
      const price = parseInt(nums[nums.length - 1] ?? "0", 10);
      const qty = parseInt(nums[nums.length - 2] ?? "1", 10);
      const itemRaw = args.filter((a) => !a.match(/^<@/) && !/^\d+$/.test(a)).join(" ").trim();
      if (!itemRaw || price < 1 || qty < 1) { await send(ch, `Usage: \`${PREFIX}trade @user <item> <qty> <price>\``, token); break; }
      const eco = loadEconomy();
      const sender = getUser(eco, authorId);
      const allInv = { ...sender.fishInventory, ...sender.itemInventory };
      const resolvedKey = Object.keys(allInv).find((k) => k.toLowerCase() === itemRaw.toLowerCase());
      if (!resolvedKey) { await send(ch, `❌ You don't have **${itemRaw}** in your inventory.`, token); break; }
      const isFish = resolvedKey in sender.fishInventory;
      const have = isFish ? (sender.fishInventory[resolvedKey] ?? 0) : (sender.itemInventory[resolvedKey] ?? 0);
      if (have < qty) { await send(ch, `❌ You only have **${have}x ${resolvedKey}**.`, token); break; }
      pendingTrades.set(target.id, { senderId: authorId, senderName: authorName, targetId: target.id, channelId: ch, itemName: resolvedKey, qty, price, expiresAt: Date.now() + 60_000 });
      await send(ch, [`🤝 **Trade offer from ${authorName} → ${target.username}**`, `Item: **${qty}x ${resolvedKey}** for **${price.toLocaleString()} sincoins**`, `<@${target.id}> — type \`${PREFIX}accepttrade\` to accept or \`${PREFIX}declinetrade\` to refuse. *(Expires in 60s)*`].join("\n"), token);
      break;
    }

    case "accepttrade": {
      const trade = [...pendingTrades.values()].find((t) => t.targetId === authorId && t.channelId === ch);
      if (!trade || Date.now() > trade.expiresAt) { pendingTrades.delete(authorId); await send(ch, "❌ No pending trade offer for you here.", token); break; }
      const eco = loadEconomy();
      const buyer = getUser(eco, authorId);
      const seller = getUser(eco, trade.senderId);
      if (buyer.balance < trade.price) { await send(ch, `❌ You need **${trade.price.toLocaleString()} sincoins** to accept. You have **${buyer.balance.toLocaleString()}**.`, token); break; }
      const allSellerInv = { ...seller.fishInventory, ...seller.itemInventory };
      const resolvedKey = Object.keys(allSellerInv).find((k) => k.toLowerCase() === trade.itemName.toLowerCase());
      const isFish2 = resolvedKey && (resolvedKey in seller.fishInventory);
      const have2 = resolvedKey ? (allSellerInv[resolvedKey] ?? 0) : 0;
      if (!resolvedKey || have2 < trade.qty) { pendingTrades.delete(authorId); await send(ch, `❌ **${trade.senderName}** no longer has enough **${trade.itemName}** to complete the trade.`, token); break; }
      buyer.balance -= trade.price;
      seller.balance += trade.price;
      if (isFish2) {
        seller.fishInventory[resolvedKey] = have2 - trade.qty;
        if (seller.fishInventory[resolvedKey] === 0) delete seller.fishInventory[resolvedKey];
        buyer.fishInventory[trade.itemName] = (buyer.fishInventory[trade.itemName] ?? 0) + trade.qty;
      } else {
        seller.itemInventory[resolvedKey] = have2 - trade.qty;
        if (seller.itemInventory[resolvedKey] === 0) delete seller.itemInventory[resolvedKey];
        buyer.itemInventory[trade.itemName] = (buyer.itemInventory[trade.itemName] ?? 0) + trade.qty;
      }
      pendingTrades.delete(authorId);
      saveEconomy(eco);
      await send(ch, [`✅ **Trade complete!**`, `**${trade.senderName}** sold **${trade.qty}x ${trade.itemName}** to **${authorName}** for **${trade.price.toLocaleString()} sincoins**.`].join("\n"), token);
      break;
    }

    case "declinetrade": {
      const trade = [...pendingTrades.values()].find((t) => t.targetId === authorId && t.channelId === ch);
      if (!trade) { await send(ch, "❌ No pending trade offer for you here.", token); break; }
      pendingTrades.delete(authorId);
      await send(ch, `❌ **${authorName}** declined the trade from **${trade.senderName}**.`, token);
      break;
    }

    case "egoguide": {
      await send(ch, [
        `🧠 **=== Ego System Guide ===**`,
        `The bot tracks how it feels about each user across 4 traits. Use \`${PREFIX}ego @user\` to check someone.`,
        ``, `**Trust** — Does the bot trust you? (0–100)`,
        `Low (≤35): Suspicious / Traitor | High (≥75): Trusted / Confidant`,
        `↑ Raised by: paying others, following users, winning duels fairly`,
        `↓ Lowered by: robbing, getting blacklisted, getting caught`,
        ``, `**Affection** — Does the bot like you? (0–100)`,
        `Low (≤35): Despised / Disliked | High (≥75): Liked / Favorite`,
        `↑ Raised by: working, winning duels, heist success, getting followed`,
        `↓ Lowered by: losing fights, robbing others, being idle`,
        ``, `**Fear** — Does the bot fear you? (0–100)`,
        `Low (≤10): None | High (≥80): Intimidated / Terrified`,
        `↑ Raised by: getting caught robbing, warning others, losing duels badly`,
        `↓ Naturally stays low without repeated aggressive actions`,
        ``, `**Rivalry** — Are you a rival? (0–100)`,
        `Low (≤20): None | High (≥65): Rival / Nemesis / Arch-Enemy`,
        `↑ Raised by: dueling, robbing, heisting, gambling heavily`,
        `↓ Fades with positive or neutral interactions`,
        ``, `**How to become friends with the bot:**`,
        `Work regularly, follow others, win duels, avoid robbing. Aim for Trust 75+ and Affection 75+.`,
        ``, `**How to become enemies:**`,
        `Rob constantly, lose every fight, get blacklisted. High Rivalry (65+) + low Trust (≤35) = Arch-Enemy status.`,
        ``, `The bot may drop passive flavor comments in chat when your stats are extreme.`,
      ].join("\n"), token);
      break;
    }

    case "trivia": {
      if (pendingTrivia.has(ch)) { await send(ch, `❓ A trivia question is already active! Use \`${PREFIX}answer <your answer>\`.`, token); break; }
      const q = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
      const trivTimer = setTimeout(async () => {
        if (pendingTrivia.has(ch)) {
          pendingTrivia.delete(ch);
          await send(ch, `⏰ Time's up! The answer was **${q.a}**. No sincoins awarded.`, token).catch(() => {});
        }
      }, 45_000);
      pendingTrivia.set(ch, { question: q.q, answer: q.a, reward: q.reward, channelId: ch, timer: trivTimer });
      await send(ch, [`❓ **TRIVIA — ${q.reward} sincoins**`, q.q, `Type \`${PREFIX}answer <your answer>\` — you have 45 seconds!`].join("\n"), token);
      break;
    }

    case "answer": {
      const trivia = pendingTrivia.get(ch);
      if (!trivia) { await send(ch, `❌ No trivia question is active. Start one with \`${PREFIX}trivia\`.`, token); break; }
      const guess = args.join(" ").trim().toLowerCase();
      const correct = trivia.answer.toLowerCase();
      if (guess !== correct && !correct.split(" ").includes(guess)) { await send(ch, `❌ Wrong! Keep trying — \`${PREFIX}answer <guess>\``, token); break; }
      clearTimeout(trivia.timer);
      pendingTrivia.delete(ch);
      const eco = loadEconomy();
      const u = getUser(eco, authorId);
      u.balance += trivia.reward;
      nudgeEgo(u, { trust: 3, affection: 2 });
      saveEconomy(eco);
      await send(ch, [`✅ **${authorName}** got it! The answer was **${trivia.answer}**.`, `🏆 +**${trivia.reward} sincoins** | Balance: **${u.balance.toLocaleString()} sincoins**`].join("\n"), token);
      break;
    }

    case "gamble":
    case "slots": {
      const betArg = parseInt(args[0] ?? "0", 10);
      if (!betArg || betArg < 10) { await send(ch, `Usage: \`${PREFIX}gamble <amount>\` — minimum bet is 10 sincoins.`, token); break; }
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      if (user.balance < betArg) { await send(ch, `❌ You only have **${user.balance.toLocaleString()} sincoins**.`, token); break; }

      const SYMBOLS = ["🍒", "🍋", "🍇", "🍀", "💎", "7️⃣"];
      const WEIGHTS = [30, 25, 20, 12, 8, 5];
      const MULTIPLIERS = { "🍒": 2, "🍋": 3, "🍇": 4, "🍀": 6, "💎": 10, "7️⃣": 20 };

      function spinReel() {
        const total = WEIGHTS.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < SYMBOLS.length; i++) { r -= WEIGHTS[i]; if (r <= 0) return SYMBOLS[i]; }
        return SYMBOLS[0];
      }

      const reels = [spinReel(), spinReel(), spinReel()];
      const [a, b, c] = reels;
      let multiplier = 0, resultLine = "";

      if (a === b && b === c) {
        multiplier = MULTIPLIERS[a] ?? 2;
        resultLine = `🎰 **JACKPOT!** Three **${a}**s! You win **${multiplier}x** your bet!`;
      } else if (a === b || b === c || a === c) {
        multiplier = 0.5;
        resultLine = `🎰 Two of a kind — you get back half your bet.`;
      } else {
        multiplier = 0;
        resultLine = `🎰 No match — better luck next time.`;
      }

      const payout = Math.floor(betArg * multiplier);
      const net = payout - betArg;
      user.balance = Math.max(0, user.balance - betArg + payout);
      nudgeEgo(user, net > 0 ? { affection: 2 } : { rivalry: 1 });
      saveEconomy(eco);

      const netStr = net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString();
      await send(ch, [`**[ ${reels.join(" | ")} ]**`, resultLine, `💰 Payout: **${payout.toLocaleString()} sincoins** (${netStr})`, `Balance: **${user.balance.toLocaleString()} sincoins**`].join("\n"), token);
      break;
    }

    case "duel": {
      cleanExpiredDuels();
      const target = getMentionedUser(msg, args);
      const bet = parseInt(args.find((a) => /^\d+$/.test(a)) ?? "0", 10);
      if (!target) { await send(ch, `Usage: \`${PREFIX}duel @user <bet>\``, token); break; }
      if (target.id === authorId) { await send(ch, "❌ You can't duel yourself.", token); break; }
      if (bet < 1) { await send(ch, `Usage: \`${PREFIX}duel @user <bet>\` — bet must be at least 1 sincoin.`, token); break; }
      const eco = loadEconomy();
      const challenger = getUser(eco, authorId);
      if (challenger.balance < bet) { await send(ch, `❌ You only have **${challenger.balance} sincoins**.`, token); break; }
      pendingDuels.set(authorId, { challengerId: authorId, challengerName: authorName, targetId: target.id, bet, channelId: ch, expiresAt: Date.now() + DUEL_EXPIRY_MS });
      await send(ch, [`⚔️ **${authorName}** challenges **${target.username}** to a duel for **${bet} sincoins**!`, `<@${target.id}> — type \`${PREFIX}accept\` to fight or \`${PREFIX}decline\` to back down.`, `*(Challenge expires in 60 seconds)*`].join("\n"), token);
      break;
    }

    case "accept": {
      cleanExpiredDuels();
      const duel = [...pendingDuels.values()].find((d) => d.targetId === authorId && d.channelId === ch);
      if (!duel) { await send(ch, "❌ You have no pending duel challenge.", token); break; }
      const eco = loadEconomy();
      const challenger = getUser(eco, duel.challengerId);
      const target = getUser(eco, authorId);
      if (challenger.balance < duel.bet) { pendingDuels.delete(duel.challengerId); await send(ch, `❌ **${duel.challengerName}** can't afford the bet anymore. Challenge cancelled.`, token); break; }
      if (target.balance < duel.bet) { await send(ch, `❌ You need **${duel.bet} sincoins** but only have **${target.balance}**.`, token); break; }
      pendingDuels.delete(duel.challengerId);
      const r1 = rnd(1, 100), r2 = rnd(1, 100);
      if (r1 === r2) {
        await send(ch, [`⚔️ **DUEL: ${duel.challengerName} vs ${authorName}** — Bet: **${duel.bet} sincoins**`, ``, `🎲 ${duel.challengerName} rolled: **${r1}**`, `🎲 ${authorName} rolled: **${r2}**`, ``, `🤝 It's a **TIE**! No sincoins change hands.`].join("\n"), token);
      } else {
        const challengerWon = r1 > r2;
        const winnerId = challengerWon ? duel.challengerId : authorId;
        const loserId = challengerWon ? authorId : duel.challengerId;
        const winnerName = challengerWon ? duel.challengerName : authorName;
        const loserName = challengerWon ? authorName : duel.challengerName;
        const winner = getUser(eco, winnerId);
        const loser = getUser(eco, loserId);
        winner.balance += duel.bet;
        loser.balance = Math.max(0, loser.balance - duel.bet);
        nudgeEgo(winner, { rivalry: 5, affection: 2 });
        nudgeEgo(loser, { rivalry: 8, fear: 3 });
        saveEconomy(eco);
        await send(ch, [`⚔️ **DUEL: ${duel.challengerName} vs ${authorName}** — Bet: **${duel.bet} sincoins**`, ``, `🎲 ${duel.challengerName} rolled: **${r1}**`, `🎲 ${authorName} rolled: **${r2}**`, ``, `🏆 **${winnerName}** wins **${duel.bet} sincoins** from **${loserName}**!`, `💰 ${winnerName}: **${winner.balance.toLocaleString()} sincoins** | ${loserName}: **${loser.balance.toLocaleString()} sincoins**`].join("\n"), token);
      }
      break;
    }

    case "decline": {
      cleanExpiredDuels();
      const duel = [...pendingDuels.values()].find((d) => d.targetId === authorId && d.channelId === ch);
      if (!duel) { await send(ch, "❌ You have no pending duel challenge.", token); break; }
      pendingDuels.delete(duel.challengerId);
      await send(ch, `🏳️ **${authorName}** declined the duel from **${duel.challengerName}**. Coward.`, token);
      break;
    }

    case "balance":
    case "bal": {
      const eco = loadEconomy();
      const targetId = resolveUserId(args, msg) ?? authorId;
      const u = getUser(eco, targetId);
      await send(ch, `💰 ${targetId === authorId ? "Your" : `<@${targetId}>'s`} balance: **${u.balance.toLocaleString()} sincoins**`, token);
      break;
    }

    case "daily": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const now = Date.now();
      const elapsed = now - user.lastDaily;
      if (elapsed < DAILY_COOLDOWN_MS) { await send(ch, `⏳ Daily already claimed! Come back in **${formatDuration(DAILY_COOLDOWN_MS - elapsed)}**.`, token); break; }
      user.streak = elapsed < DAILY_COOLDOWN_MS * 2 ? user.streak + 1 : 1;
      user.lastDaily = now;
      const streakBonus = Math.min(user.streak * 25, 500);
      const total = 300 + streakBonus;
      user.balance += total;
      const newAch = awardAchievement(user, "rich_1k");
      if (user.balance >= 10000) awardAchievement(user, "rich_10k");
      saveEconomy(eco);
      const streakMsg = user.streak > 1 ? ` 🔥 **${user.streak} day streak!** (+${streakBonus} bonus)` : "";
      let out = `✅ Daily claimed! You got **${total} sincoins**.${streakMsg}\n💰 New balance: **${user.balance.toLocaleString()} sincoins**`;
      if (newAch) out += `\n🏆 Achievement unlocked: **${ACHIEVEMENTS.rich_1k.name}**!`;
      await send(ch, out, token);
      break;
    }

    case "work": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const now = Date.now();
      const remaining = WORK_COOLDOWN_MS - (now - user.workCooldown);
      if (remaining > 0) { await send(ch, `⏳ Rest for **${formatDuration(remaining)}** before working again.`, token); break; }
      if (user.cursed) { user.cursed = false; user.workCooldown = now; saveEconomy(eco); await send(ch, `💼 You showed up to work but everything went wrong. You earned nothing today. *A curse has been lifted.*`, token); break; }
      const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];
      const pay = rnd(job.minPay, job.maxPay);
      user.balance += pay;
      user.workCooldown = now;
      awardAchievement(user, "workaholic");
      saveEconomy(eco);
      await send(ch, [`💼 **${job.name}**`, job.description, `You earned **${pay} sincoins**! 💰`, `Balance: **${user.balance.toLocaleString()} sincoins**`].join("\n"), token);
      break;
    }

    case "pay":
    case "give": {
      if (name === "give" && (isOwner(authorId) || (() => { const eco2 = loadEconomy(); return getUser(eco2, authorId).whitelisted; })())) {
        const eco = loadEconomy();
        const target = getMentionedUser(msg, args);
        const amount = parseInt(args.find((a) => /^\d+$/.test(a)) ?? "0", 10);
        if (!target || amount <= 0) { await send(ch, `Usage: \`${PREFIX}give @user <amount>\``, token); break; }
        getUser(eco, target.id).balance += amount;
        saveEconomy(eco);
        await send(ch, `✅ Gave **${amount} sincoins** to **${target.username}**.`, token);
        break;
      }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      const amount = parseInt(args.find((a) => /^\d+$/.test(a)) ?? "0", 10);
      if (!target || amount <= 0) { await send(ch, `Usage: \`${PREFIX}pay @user <amount>\``, token); break; }
      if (target.id === authorId) { await send(ch, "You can't pay yourself.", token); break; }
      const sender = getUser(eco, authorId);
      if (sender.balance < amount) { await send(ch, `❌ You only have **${sender.balance} sincoins**.`, token); break; }
      const receiver = getUser(eco, target.id);
      sender.balance -= amount;
      receiver.balance += amount;
      saveEconomy(eco);
      await send(ch, `✅ Sent **${amount} sincoins** to **${target.username}**.\n💰 Your balance: **${sender.balance.toLocaleString()} sincoins**`, token);
      break;
    }

    case "leaderboard":
    case "lb": {
      const eco = loadEconomy();
      const sub = args[0]?.toLowerCase();

      if (sub === "security" || sub === "sec") {
        const secEmoji = ["🔓", "🔒", "📹", "🐕", "💂", "🏰"];
        const sorted = Object.entries(eco)
          .filter(([, u]) => (u.security ?? 0) > 0)
          .sort(([, a], [, b]) => (b.security ?? 0) - (a.security ?? 0) || b.balance - a.balance)
          .slice(0, 10);
        if (sorted.length === 0) { await send(ch, "🛡️ Nobody has purchased any security yet.", token); break; }
        const lines = sorted.map(([id, u], i) => {
          const sec = u.security ?? 0;
          const tier = SECURITY_LEVELS[sec];
          return `**${i + 1}.** <@${id}> — ${secEmoji[sec]} **Lv.${sec} ${tier.name}**`;
        });
        await send(ch, `🛡️ **Top Security Levels**\n${lines.join("\n")}`, token);
        break;
      }

      const sorted = Object.entries(eco).sort(([, a], [, b]) => b.balance - a.balance).slice(0, 10);
      if (sorted.length === 0) { await send(ch, "No economy data yet.", token); break; }
      await send(ch, `🏆 **Top Balances**\n${sorted.map(([id, u], i) => `**${i + 1}.** <@${id}> — **${u.balance.toLocaleString()} sincoins**`).join("\n")}`, token);
      break;
    }

    case "fish": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const now = Date.now();
      const remaining = FISH_COOLDOWN_MS - (now - user.fishCooldown);
      if (remaining > 0) { await send(ch, `🎣 Cooldown! Fish again in **${formatDuration(remaining)}**.`, token); break; }
      user.fishCooldown = now;
      if (user.cursed) { user.cursed = false; saveEconomy(eco); await send(ch, `🎣 You cast your line but something felt wrong... you caught nothing. *A curse has been lifted.*`, token); break; }
      const caught = weightedRandom(getFishPool(user));
      user.fishInventory[caught.name] = (user.fishInventory[caught.name] ?? 0) + 1;
      user.totalFishCaught++;
      if (["rare","epic","legendary"].includes(caught.rarity)) user.totalRareCaught++;
      const newAchs = [];
      if (awardAchievement(user, "first_fish")) newAchs.push(ACHIEVEMENTS.first_fish.name);
      if (["rare","epic","legendary"].includes(caught.rarity) && awardAchievement(user, "fish_master")) newAchs.push(ACHIEVEMENTS.fish_master.name);
      if (caught.rarity === "legendary" && awardAchievement(user, "fish_legend")) newAchs.push(ACHIEVEMENTS.fish_legend.name);
      saveEconomy(eco);
      let out = `🎣 You caught a **${caught.name}** ${rarityEmoji(caught.rarity)} *(${caught.rarity})* worth **${caught.price} sincoins**!`;
      if (newAchs.length) out += `\n🏆 Achievement${newAchs.length > 1 ? "s" : ""} unlocked: **${newAchs.join(", ")}**!`;
      await send(ch, out, token);
      break;
    }

    case "inventory":
    case "inv": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const items = Object.entries(user.fishInventory).filter(([, q]) => q > 0);
      if (items.length === 0) { await send(ch, "🎣 Your fish inventory is empty. Try fishing!", token); break; }
      await send(ch, `🎣 **Your Fish Inventory**\n${items.map(([name, qty]) => { const fish = FISH_ITEMS.find((f) => f.name === name); return `${fish ? rarityEmoji(fish.rarity) : "🐟"} **${name}** x${qty}`; }).join("\n")}`, token);
      break;
    }

    case "sell": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const qtyArg = parseInt(args[args.length - 1], 10);
      const qty = isNaN(qtyArg) || qtyArg < 1 ? 1 : qtyArg;
      const fishName = (isNaN(parseInt(args[args.length - 1], 10)) ? args.join(" ") : args.slice(0, -1).join(" ")).trim();
      if (!fishName) { await send(ch, `Usage: \`${PREFIX}sell <fish name> [qty]\``, token); break; }
      const key = findInventoryKey(user.fishInventory, fishName);
      if (!key || !user.fishInventory[key]) { await send(ch, `❌ You don't have that fish.`, token); break; }
      const fishDef = FISH_ITEMS.find((f) => f.name.toLowerCase() === key.toLowerCase());
      if (!fishDef) { await send(ch, "❌ Unknown fish.", token); break; }
      const have = user.fishInventory[key];
      const sellQty = Math.min(qty, have);
      const earned = fishDef.price * sellQty;
      user.fishInventory[key] = have - sellQty;
      if (user.fishInventory[key] === 0) delete user.fishInventory[key];
      user.balance += earned;
      user.totalFishSold += sellQty;
      awardAchievement(user, "first_sell");
      saveEconomy(eco);
      await send(ch, `✅ Sold **${sellQty}x ${key}** for **${earned} sincoins**!\n💰 Balance: **${user.balance.toLocaleString()} sincoins**`, token);
      break;
    }

    case "sellall": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      let total = 0, count = 0;
      for (const [name, qty] of Object.entries(user.fishInventory)) {
        if (!qty || qty <= 0) continue;
        const fish = FISH_ITEMS.find((f) => f.name === name);
        if (!fish) continue;
        total += fish.price * qty; count += qty; user.totalFishSold += qty;
      }
      if (count === 0) { await send(ch, "❌ No fish to sell.", token); break; }
      user.fishInventory = {};
      user.balance += total;
      awardAchievement(user, "first_sell");
      if (user.balance >= 1000) awardAchievement(user, "rich_1k");
      saveEconomy(eco);
      await send(ch, `✅ Sold **${count} fish** for **${total} sincoins**!\n💰 Balance: **${user.balance.toLocaleString()} sincoins**`, token);
      break;
    }

    case "fishdex": {
      const byRarity = {};
      for (const fish of FISH_ITEMS) { if (!byRarity[fish.rarity]) byRarity[fish.rarity] = []; byRarity[fish.rarity].push(`${fish.name} (${fish.price}💰)`); }
      await send(ch, `🐠 **Fish Dex**\n${["common","uncommon","rare","epic","legendary"].map((r) => `${rarityEmoji(r)} **${r[0].toUpperCase() + r.slice(1)}**: ${byRarity[r]?.join(", ") ?? "none"}`).join("\n")}`, token);
      break;
    }

    case "shop": {
      const upgrades = Object.entries(SHOP_ITEMS).filter(([, i]) => i.type === "upgrade");
      const boxes = Object.entries(SHOP_ITEMS).filter(([, i]) => i.type === "lootbox").slice(0, 10);
      await send(ch, [`**=== Sinbot Shop ===**`, `Use \`${PREFIX}buy <item>\` to purchase.`, "", "**Upgrades**", ...upgrades.map(([k, i]) => `\`${k}\` — **${i.name}** — ${i.cost} sincoins — ${i.description}`), "", "**Lootboxes** *(showing first 10)*", ...boxes.map(([k, i]) => `\`${k}\` — **${i.name}** — ${i.cost} sincoins — ${i.description}`)].join("\n"), token);
      break;
    }

    case "buy": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const itemKey = args[0]?.toLowerCase();
      if (!itemKey) { await send(ch, `Usage: \`${PREFIX}buy <item>\``, token); break; }
      const item = SHOP_ITEMS[itemKey];
      if (!item) { await send(ch, `❌ Unknown item \`${itemKey}\`. Check \`${PREFIX}shop\`.`, token); break; }
      if (user.balance < item.cost) { await send(ch, `❌ You need **${item.cost}** but have **${user.balance}** sincoins.`, token); break; }
      user.balance -= item.cost;
      if (item.type === "upgrade" && item.upgrade) {
        user.upgrades.fishLuck = (user.upgrades.fishLuck ?? 0) + item.upgrade.fishLuck;
        saveEconomy(eco);
        await send(ch, `✅ Purchased **${item.name}**! Fishing luck +${item.upgrade.fishLuck}.\n💰 Balance: **${user.balance.toLocaleString()} sincoins**`, token);
      } else if (item.type === "lootbox") {
        user.itemInventory[item.name] = (user.itemInventory[item.name] ?? 0) + 1;
        user.lootboxPurchases.push(itemKey);
        saveEconomy(eco);
        await send(ch, `✅ Purchased **${item.name}**! Use \`${PREFIX}open ${itemKey}\` to open it.\n💰 Balance: **${user.balance.toLocaleString()} sincoins**`, token);
      }
      break;
    }

    case "open": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const boxKey = args[0]?.toLowerCase();
      if (!boxKey) { await send(ch, `Usage: \`${PREFIX}open <box>\``, token); break; }
      const box = LOOTBOXES[boxKey];
      if (!box) { await send(ch, `❌ Unknown lootbox \`${boxKey}\`. Check \`${PREFIX}shop\`.`, token); break; }
      const invKey = findInventoryKey(user.itemInventory, box.name);
      if (!invKey || !user.itemInventory[invKey]) { await send(ch, `❌ You don't have a **${box.name}**. Buy one with \`${PREFIX}buy ${boxKey}\`.`, token); break; }
      user.itemInventory[invKey]--;
      if (user.itemInventory[invKey] === 0) delete user.itemInventory[invKey];
      const item = openLootbox(boxKey);
      if (!item) { await send(ch, "❌ Error opening box.", token); break; }
      user.itemInventory[item.name] = (user.itemInventory[item.name] ?? 0) + 1;
      user.totalLootboxesOpened++;
      awardAchievement(user, "box_opener");
      if (Object.keys(user.itemInventory).length >= 5) awardAchievement(user, "collector");
      saveEconomy(eco);
      await send(ch, `📦 Opened **${box.name}**!\nYou got: ${rarityEmoji(item.rarity)} **${item.name}** *(${item.rarity})* worth **${item.price} sincoins**!`, token);
      break;
    }

    case "items": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const items = Object.entries(user.itemInventory).filter(([, q]) => q && q > 0);
      if (items.length === 0) { await send(ch, "📦 Your item inventory is empty.", token); break; }
      await send(ch, `📦 **Your Items**\n${items.map(([name, qty]) => { const def = COLLECTIBLE_ITEMS.find((i) => i.name === name); return `${def ? rarityEmoji(def.rarity) : "📦"} **${name}** x${qty}`; }).join("\n")}`, token);
      break;
    }

    case "sellitem": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const qtyArg = parseInt(args[args.length - 1], 10);
      const qty = isNaN(qtyArg) ? 1 : Math.max(1, qtyArg);
      const itemName = (isNaN(parseInt(args[args.length - 1], 10)) ? args.join(" ") : args.slice(0, -1).join(" ")).trim();
      if (!itemName) { await send(ch, `Usage: \`${PREFIX}sellitem <item> [qty]\``, token); break; }
      const key = findInventoryKey(user.itemInventory, itemName);
      if (!key || !user.itemInventory[key]) { await send(ch, "❌ You don't have that item.", token); break; }
      const def = COLLECTIBLE_ITEMS.find((i) => i.name.toLowerCase() === key.toLowerCase());
      if (!def) { await send(ch, "❌ Unknown item.", token); break; }
      const have = user.itemInventory[key];
      const sellQty = Math.min(qty, have);
      const earned = def.price * sellQty;
      user.itemInventory[key] = have - sellQty;
      if (user.itemInventory[key] === 0) delete user.itemInventory[key];
      user.balance += earned;
      user.totalItemsSold += sellQty;
      awardAchievement(user, "first_sell");
      saveEconomy(eco);
      await send(ch, `✅ Sold **${sellQty}x ${key}** for **${earned} sincoins**!\n💰 Balance: **${user.balance.toLocaleString()} sincoins**`, token);
      break;
    }

    case "profile": {
      const eco = loadEconomy();
      const targetId = resolveUserId(args, msg) ?? authorId;
      const u = getUser(eco, targetId);
      const ego = getEgo(u);
      await send(ch, [`**Profile: <@${targetId}>**`, `💰 Balance: **${u.balance.toLocaleString()} sincoins**`, `🎣 Fish caught: **${u.totalFishCaught}** (rare: ${u.totalRareCaught})`, `📦 Lootboxes opened: **${u.totalLootboxesOpened}**`, `🐟 Fish: **${Object.values(u.fishInventory).reduce((a,b)=>a+b,0)}** | 🎁 Items: **${Object.values(u.itemInventory).reduce((a,b)=>a+b,0)}**`, `🔥 Daily streak: **${u.streak}**`, `🏆 Achievements: **${u.achievements.length}/${Object.keys(ACHIEVEMENTS).length}**`, `🎣 Fishing luck: **+${u.upgrades.fishLuck}**`, ``, `**Ego** — Trust: ${trustLabel(ego.trust)} | Affection: ${affectionLabel(ego.affection)} | Fear: ${fearLabel(ego.fear)} | Rivalry: ${rivalryLabel(ego.rivalry)}`].join("\n"), token);
      break;
    }

    case "achievements":
    case "ach": {
      const eco = loadEconomy();
      const targetId = resolveUserId(args, msg) ?? authorId;
      const u = getUser(eco, targetId);
      await send(ch, `🏆 **Achievements for <@${targetId}>**\n${getAchievementStatus(u).join("\n")}`, token);
      break;
    }

    case "follow": {
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}follow @user\``, token); break; }
      if (target.id === authorId) { await send(ch, "You can't follow yourself.", token); break; }
      const user = getUser(eco, authorId);
      const targetUser = getUser(eco, target.id);
      if (user.following.includes(target.id)) { await send(ch, `You already follow **${target.username}**.`, token); break; }
      user.following.push(target.id);
      targetUser.followers.push(authorId);
      awardAchievement(user, "follow_friend");
      nudgeEgo(targetUser, { affection: 3 });
      saveEconomy(eco);
      await send(ch, `✅ You are now following **${target.username}**.`, token);
      break;
    }

    case "unfollow": {
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}unfollow @user\``, token); break; }
      const user = getUser(eco, authorId);
      const targetUser = getUser(eco, target.id);
      user.following = user.following.filter((id) => id !== target.id);
      targetUser.followers = targetUser.followers.filter((id) => id !== authorId);
      saveEconomy(eco);
      await send(ch, `✅ Unfollowed **${target.username}**.`, token);
      break;
    }

    case "followers": {
      const eco = loadEconomy();
      const targetId = resolveUserId(args, msg) ?? authorId;
      const u = getUser(eco, targetId);
      if (u.followers.length === 0) { await send(ch, `<@${targetId}> has no followers.`, token); break; }
      await send(ch, `👥 **Followers of <@${targetId}>** (${u.followers.length}):\n${u.followers.map((id) => `<@${id}>`).join(", ")}`, token);
      break;
    }

    case "ego": {
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}ego @user\``, token); break; }
      const u = getUser(eco, target.id);
      const ego = getEgo(u);
      await send(ch, [`🧠 **Ego Report: ${target.username}**`, egoFlavorLine(target.username, ego), ``, `Trust: **${ego.trust}/100** (${trustLabel(ego.trust)})`, `Affection: **${ego.affection}/100** (${affectionLabel(ego.affection)})`, `Fear: **${ego.fear}/100** (${fearLabel(ego.fear)})`, `Rivalry: **${ego.rivalry}/100** (${rivalryLabel(ego.rivalry)})`, `Interactions: **${ego.interactions}**`].join("\n"), token);
      break;
    }

    case "take": {
      if (!isOwner(authorId) && !getUser(loadEconomy(), authorId).whitelisted) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      const amount = parseInt(args.find((a) => /^\d+$/.test(a)) ?? "0", 10);
      if (!target || amount <= 0) { await send(ch, `Usage: \`${PREFIX}take @user <amount>\``, token); break; }
      const u = getUser(eco, target.id);
      u.balance = Math.max(0, u.balance - amount);
      saveEconomy(eco);
      await send(ch, `✅ Took **${amount} sincoins** from **${target.username}**. New balance: **${u.balance}**.`, token);
      break;
    }

    case "setbalance":
    case "setbal": {
      if (!isOwner(authorId) && !getUser(loadEconomy(), authorId).whitelisted) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      const amount = parseInt(args.find((a) => /^\d+$/.test(a)) ?? "0", 10);
      if (!target || isNaN(amount)) { await send(ch, `Usage: \`${PREFIX}setbalance @user <amount>\``, token); break; }
      getUser(eco, target.id).balance = Math.max(0, amount);
      saveEconomy(eco);
      await send(ch, `✅ Set **${target.username}**'s balance to **${amount} sincoins**.`, token);
      break;
    }

    case "warn": {
      const eco = loadEconomy();
      const callerUser = getUser(eco, authorId);
      if (!isOwner(authorId) && !callerUser.whitelisted) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args);
      const reason = args.slice(1).join(" ").trim() || "No reason provided.";
      if (!target) { await send(ch, `Usage: \`${PREFIX}warn @user [reason]\``, token); break; }
      const u = getUser(eco, target.id);
      u.warnings.push(`${new Date().toISOString()}: ${reason}`);
      nudgeEgo(u, { trust: -5, fear: 5 });
      saveEconomy(eco);
      await send(ch, `⚠️ **${target.username}** has been warned. Reason: ${reason}\nTotal warnings: **${u.warnings.length}**`, token);
      break;
    }

    case "warnings": {
      const eco = loadEconomy();
      const callerUser = getUser(eco, authorId);
      if (!isOwner(authorId) && !callerUser.whitelisted) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}warnings @user\``, token); break; }
      const u = getUser(eco, target.id);
      if (u.warnings.length === 0) { await send(ch, `**${target.username}** has no warnings.`, token); break; }
      await send(ch, `⚠️ **Warnings for ${target.username}:**\n${u.warnings.map((w, i) => `**${i + 1}.** ${w}`).join("\n")}`, token);
      break;
    }

    case "clearwarnings": {
      if (!isOwner(authorId) && !getUser(loadEconomy(), authorId).whitelisted) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}clearwarnings @user\``, token); break; }
      getUser(eco, target.id).warnings = [];
      saveEconomy(eco);
      await send(ch, `✅ Cleared all warnings for **${target.username}**.`, token);
      break;
    }

    case "blacklist": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}blacklist @user\``, token); break; }
      const u = getUser(eco, target.id);
      u.blacklisted = true;
      nudgeEgo(u, { trust: -20, rivalry: 15 });
      saveEconomy(eco);
      await send(ch, `🚫 **${target.username}** has been blacklisted.`, token);
      break;
    }

    case "unblacklist": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}unblacklist @user\``, token); break; }
      getUser(eco, target.id).blacklisted = false;
      saveEconomy(eco);
      await send(ch, `✅ **${target.username}** has been unblacklisted.`, token);
      break;
    }

    case "whitelist": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}whitelist @user\``, token); break; }
      const u = getUser(eco, target.id);
      u.whitelisted = true;
      nudgeEgo(u, { trust: 10, affection: 5 });
      saveEconomy(eco);
      await send(ch, `✅ **${target.username}** has been whitelisted.`, token);
      break;
    }

    case "unwhitelist": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}unwhitelist @user\``, token); break; }
      getUser(eco, target.id).whitelisted = false;
      saveEconomy(eco);
      await send(ch, `✅ Removed whitelist from **${target.username}**.`, token);
      break;
    }

    // ─── Owner-Only Commands ────────────────────────────────────────────────────

    case "owner": {
      if (!isOwner(authorId)) { await send(ch, `❓ Unknown command. Use \`${PREFIX}help\` for the command list.`, token); break; }
      await send(ch, [
        "👑 **=== Owner Commands ===**", "",
        "**💰 Economy**",
        `\`${PREFIX}addmoney <amount>\` — Add sincoins to your own balance`,
        `\`${PREFIX}wipebal @user\` — Set a user's balance to 0`,
        `\`${PREFIX}jackpot @user <amount>\` — Drop a bag into someone's account publicly`,
        `\`${PREFIX}giveall <amount>\` — Give sincoins to every user in the economy`,
        `\`${PREFIX}swap @user1 @user2\` — Swap two users' balances`,
        `\`${PREFIX}give @user <amount>\` — Give sincoins to a user`,
        `\`${PREFIX}take @user <amount>\` — Take sincoins from a user`,
        `\`${PREFIX}setbalance @user <amount>\` — Set someone's exact balance`, "",
        "**🎁 Items**",
        `\`${PREFIX}owngive @user <item>\` — Give a secret owner-only item`,
        `\`${PREFIX}ownitems\` — List all secret items you can give`,
        `\`${PREFIX}additem @user <item> [qty]\` — Give any collectible item`,
        `\`${PREFIX}wipeinv @user\` — Wipe a user's entire inventory`, "",
        "**⚡ Powers**",
        `\`${PREFIX}godmode [@user]\` — Make a user immune to robbery`,
        `\`${PREFIX}ungodmode [@user]\` — Remove god mode`,
        `\`${PREFIX}curse @user\` — Curse a user (next fish/work earns nothing)`,
        `\`${PREFIX}uncurse @user\` — Remove curse`,
        `\`${PREFIX}freeze @user\` — Block a user from all commands`,
        `\`${PREFIX}unfreeze @user\` — Unfreeze a user`, "",
        "**🔧 Utility**",
        `\`${PREFIX}spy @user\` — View a user's full private profile`,
        `\`${PREFIX}resetcooldowns [@user]\` — Reset all cooldowns`,
        `\`${PREFIX}maxsecurity [@user]\` — Give max security for free`,
        `\`${PREFIX}setstreak @user <n>\` — Set daily streak`,
        `\`${PREFIX}broadcast <msg>\` — Send an owner broadcast`,
        `\`${PREFIX}blacklist @user\` — Blacklist a user`,
        `\`${PREFIX}unblacklist @user\` — Unblacklist a user`,
        `\`${PREFIX}whitelist @user\` — Whitelist a user (dev access)`,
        `\`${PREFIX}unwhitelist @user\` — Remove whitelist`,
        `\`${PREFIX}warn @user [reason]\` — Warn a user`,
        `\`${PREFIX}clearwarnings @user\` — Clear all warnings`,
      ].join("\n"), token);
      break;
    }

    case "owngive": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args);
      const itemArg = args.filter((a) => !a.match(/^<@/) && !/^\d+$/.test(a)).join(" ").trim();
      if (!target || !itemArg) { await send(ch, `Usage: \`${PREFIX}owngive @user <item name>\`\n**Secret items:** ${SECRET_OWNER_ITEMS.map((i) => `\`${i.name}\``).join(", ")}`, token); break; }
      const secretItem = SECRET_OWNER_ITEMS.find((i) => i.name.toLowerCase() === itemArg.toLowerCase());
      if (!secretItem) { await send(ch, `❌ Unknown secret item. Available: ${SECRET_OWNER_ITEMS.map((i) => `\`${i.name}\``).join(", ")}`, token); break; }
      const eco = loadEconomy();
      const u = getUser(eco, target.id);
      u.itemInventory[secretItem.name] = (u.itemInventory[secretItem.name] ?? 0) + 1;
      saveEconomy(eco);
      await send(ch, `👑 **Secret item granted!**\nYou gave **${target.username}** the exclusive 🟡 **${secretItem.name}** *(legendary)* — ${secretItem.description}`, token);
      break;
    }

    case "ownitems": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const lines = SECRET_OWNER_ITEMS.map((i) => `🟡 **${i.name}** — ${i.description} *(${i.price.toLocaleString()} sincoins)*`);
      await send(ch, `👑 **Secret Owner Items**\nOnly you can give these out.\n\n${lines.join("\n")}`, token);
      break;
    }

    case "resetcooldowns": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args) ?? { id: authorId, username: authorName };
      const eco = loadEconomy();
      const u = getUser(eco, target.id);
      u.fishCooldown = 0;
      u.workCooldown = 0;
      u.lastDaily = 0;
      u.robHistory = [];
      saveEconomy(eco);
      await send(ch, `✅ Reset all cooldowns for **${target.username}** *(fish, work, daily, rob)*.`, token);
      break;
    }

    case "maxsecurity": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args) ?? { id: authorId, username: authorName };
      const eco = loadEconomy();
      const u = getUser(eco, target.id);
      u.security = 5;
      saveEconomy(eco);
      await send(ch, `🏰 Set **${target.username}**'s security to **Lv.5 — Fortress** for free.`, token);
      break;
    }

    case "broadcast": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const msg2 = args.join(" ").trim();
      if (!msg2) { await send(ch, `Usage: \`${PREFIX}broadcast <message>\``, token); break; }
      await send(ch, `📢 **[OWNER BROADCAST]**\n${msg2}`, token);
      break;
    }

    case "wipeinv": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}wipeinv @user\``, token); break; }
      const eco = loadEconomy();
      const u = getUser(eco, target.id);
      u.fishInventory = {};
      u.itemInventory = {};
      saveEconomy(eco);
      await send(ch, `🗑️ Wiped all inventory from **${target.username}**.`, token);
      break;
    }

    case "setstreak": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args);
      const amount = parseInt(args.find((a) => /^\d+$/.test(a)) ?? "0", 10);
      if (!target || amount < 0) { await send(ch, `Usage: \`${PREFIX}setstreak @user <number>\``, token); break; }
      const eco = loadEconomy();
      const u = getUser(eco, target.id);
      u.streak = amount;
      saveEconomy(eco);
      await send(ch, `✅ Set **${target.username}**'s daily streak to **${amount}**.`, token);
      break;
    }

    case "addmoney": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const amount = parseInt(args[0] ?? "0", 10);
      if (amount <= 0) { await send(ch, `Usage: \`${PREFIX}addmoney <amount>\``, token); break; }
      const eco = loadEconomy();
      const u = getUser(eco, authorId);
      u.balance += amount;
      saveEconomy(eco);
      await send(ch, `💰 Added **${amount.toLocaleString()} sincoins** to your balance. New total: **${u.balance.toLocaleString()} sincoins**`, token);
      break;
    }

    case "wipebal": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}wipebal @user\``, token); break; }
      const eco = loadEconomy();
      getUser(eco, target.id).balance = 0;
      saveEconomy(eco);
      await send(ch, `💸 Wiped **${target.username}**'s balance to 0.`, token);
      break;
    }

    case "godmode": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args) ?? { id: authorId, username: authorName };
      const eco = loadEconomy();
      getUser(eco, target.id).godMode = true;
      saveEconomy(eco);
      await send(ch, `⚡ **${target.username}** is now in God Mode — immune to all robbery.`, token);
      break;
    }

    case "ungodmode": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args) ?? { id: authorId, username: authorName };
      const eco = loadEconomy();
      getUser(eco, target.id).godMode = false;
      saveEconomy(eco);
      await send(ch, `✅ Removed God Mode from **${target.username}**.`, token);
      break;
    }

    case "curse": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}curse @user\``, token); break; }
      const eco = loadEconomy();
      getUser(eco, target.id).cursed = true;
      saveEconomy(eco);
      await send(ch, `🌑 **${target.username}** has been cursed. Their next fish or work attempt yields nothing.`, token);
      break;
    }

    case "uncurse": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}uncurse @user\``, token); break; }
      const eco = loadEconomy();
      getUser(eco, target.id).cursed = false;
      saveEconomy(eco);
      await send(ch, `✅ Removed curse from **${target.username}**.`, token);
      break;
    }

    case "freeze": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}freeze @user\``, token); break; }
      const eco = loadEconomy();
      getUser(eco, target.id).frozen = true;
      saveEconomy(eco);
      await send(ch, `❄️ **${target.username}**'s account has been frozen. They can't use any commands.`, token);
      break;
    }

    case "unfreeze": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}unfreeze @user\``, token); break; }
      const eco = loadEconomy();
      getUser(eco, target.id).frozen = false;
      saveEconomy(eco);
      await send(ch, `✅ **${target.username}**'s account has been unfrozen.`, token);
      break;
    }

    case "swap": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const mentions = (msg.mentions ?? []);
      if (mentions.length < 2) { await send(ch, `Usage: \`${PREFIX}swap @user1 @user2\` — swaps their balances.`, token); break; }
      const eco = loadEconomy();
      const u1 = getUser(eco, mentions[0].id);
      const u2 = getUser(eco, mentions[1].id);
      const tmp = u1.balance;
      u1.balance = u2.balance;
      u2.balance = tmp;
      saveEconomy(eco);
      await send(ch, `🔄 Swapped balances:\n**${mentions[0].username}** → **${u1.balance.toLocaleString()} sincoins**\n**${mentions[1].username}** → **${u2.balance.toLocaleString()} sincoins**`, token);
      break;
    }

    case "giveall": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const amount = parseInt(args[0] ?? "0", 10);
      if (amount <= 0) { await send(ch, `Usage: \`${PREFIX}giveall <amount>\``, token); break; }
      const eco = loadEconomy();
      let count = 0;
      for (const id of Object.keys(eco)) { eco[id].balance = (eco[id].balance ?? 0) + amount; count++; }
      saveEconomy(eco);
      await send(ch, `🎁 Dropped **${amount.toLocaleString()} sincoins** into **${count}** accounts.`, token);
      break;
    }

    case "jackpot": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args);
      const amount = parseInt(args.find((a) => /^\d+$/.test(a)) ?? "0", 10);
      if (!target || amount <= 0) { await send(ch, `Usage: \`${PREFIX}jackpot @user <amount>\``, token); break; }
      const eco = loadEconomy();
      const u = getUser(eco, target.id);
      u.balance += amount;
      saveEconomy(eco);
      await send(ch, `🎰 **JACKPOT!** **${target.username}** just got **${amount.toLocaleString()} sincoins** out of nowhere! Lucky them.`, token);
      break;
    }

    case "additem": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args);
      const numArg = parseInt(args.find((a) => /^\d+$/.test(a)) ?? "1", 10);
      const qty = numArg > 0 ? numArg : 1;
      const itemRaw = args.filter((a) => !a.match(/^<@/) && !/^\d+$/.test(a)).join(" ").trim();
      if (!target || !itemRaw) { await send(ch, `Usage: \`${PREFIX}additem @user <item name> [qty]\``, token); break; }
      const itemDef = COLLECTIBLE_ITEMS.find((i) => i.name.toLowerCase() === itemRaw.toLowerCase());
      if (!itemDef) { await send(ch, `❌ Unknown item **${itemRaw}**. Check \`${PREFIX}shop\` for valid names.`, token); break; }
      const eco = loadEconomy();
      const u = getUser(eco, target.id);
      u.itemInventory[itemDef.name] = (u.itemInventory[itemDef.name] ?? 0) + qty;
      saveEconomy(eco);
      await send(ch, `✅ Gave **${target.username}** **${qty}x ${itemDef.name}** ${rarityEmoji(itemDef.rarity)} *(${itemDef.rarity})*.`, token);
      break;
    }

    case "spy": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}spy @user\``, token); break; }
      const eco = loadEconomy();
      const u = getUser(eco, target.id);
      const now3 = Date.now();
      const fishCD  = Math.max(0, FISH_COOLDOWN_MS  - (now3 - (u.fishCooldown  ?? 0)));
      const workCD  = Math.max(0, WORK_COOLDOWN_MS  - (now3 - (u.workCooldown  ?? 0)));
      const dailyCD = Math.max(0, DAILY_COOLDOWN_MS - (now3 - (u.lastDaily     ?? 0)));
      const robHistory = (u.robHistory ?? []).filter((t) => now3 - t < 3_600_000).length;
      const flags = [
        u.godMode  ? "⚡ God Mode"  : null,
        u.cursed   ? "🌑 Cursed"    : null,
        u.frozen   ? "❄️ Frozen"    : null,
        u.blacklisted ? "🚫 Blacklisted" : null,
        u.whitelisted ? "✅ Whitelisted"  : null,
      ].filter(Boolean);
      await send(ch, [
        `🔍 **SPY REPORT — ${target.username}** *(ID: ${target.id})*`,
        `💰 Balance: **${u.balance.toLocaleString()} sincoins**`,
        `🎣 Fish CD: **${fishCD > 0 ? formatDuration(fishCD) : "ready"}** | 💼 Work CD: **${workCD > 0 ? formatDuration(workCD) : "ready"}** | 📅 Daily CD: **${dailyCD > 0 ? formatDuration(dailyCD) : "ready"}**`,
        `🦹 Robs this hour: **${robHistory}/5** | Total: **${u.totalRobs ?? 0}** (${u.totalRobsSuccessful ?? 0} successful)`,
        `🎣 Fish caught: **${u.totalFishCaught}** | 📦 Boxes opened: **${u.totalLootboxesOpened}**`,
        `🔥 Daily streak: **${u.streak}** | 🛡️ Security: **Lv.${u.security ?? 0}**`,
        `🏆 Achievements: **${u.achievements.length}/${Object.keys(ACHIEVEMENTS).length}**`,
        `⚠️ Warnings: **${(u.warnings ?? []).length}**`,
        flags.length ? `🚩 Flags: ${flags.join(" | ")}` : `🚩 Flags: none`,
      ].join("\n"), token);
      break;
    }

    default:
      await send(ch, `❓ Unknown command. Use \`${PREFIX}help\` for the command list.`, token);
  }
}

// ─── Gateway ──────────────────────────────────────────────────────────────────
function startGateway(token, selfId) {
  let heartbeatInterval = null;
  let statusInterval = null;
  let statusIndex = 0;
  let sequence = null;
  let reconnectDelay = 1_000;
  let currentWs = null;
  const processingMessageIds = new Set();
  const recentMessageIds = new Map();
  const recentCommandInvocations = new Map();

  function buildPresence(activity) {
    return { op: 3, d: { since: null, status: "online", afk: false, activities: [{ name: activity.state, type: 0 }, { name: "Custom Status", type: 4, state: activity.state }] } };
  }

  function pruneMap(map, maxAge) {
    if (map.size <= 200) return;
    const now = Date.now();
    for (const [k, t] of map) { if (now - t > maxAge) map.delete(k); }
  }

  function connect() {
    if (currentWs && currentWs.readyState !== WebSocket.CLOSED) { try { currentWs.close(1000, "Reconnecting"); } catch {} }
    console.log("[Gateway] Connecting...");
    const ws = new WebSocket(GATEWAY_URL, { headers: { Origin: "https://hmus.sys42.net" } });
    currentWs = ws;

    ws.on("open", () => { if (ws !== currentWs) return; console.log("[Gateway] Connected"); reconnectDelay = 1_000; });

    ws.on("message", async (raw) => {
      if (ws !== currentWs) return;
      let payload;
      try { payload = JSON.parse(raw.toString()); } catch { return; }
      if (payload.s != null) sequence = payload.s;

      switch (payload.op) {
        case 10: {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          heartbeatInterval = setInterval(() => { try { ws.send(JSON.stringify({ op: 1, d: sequence })); } catch {} }, payload.d.heartbeat_interval);
          const firstStatus = ROTATING_STATUSES[0];
          ws.send(JSON.stringify({ op: 2, d: { token, properties: { $os: "linux", $browser: "sinbot", $device: "sinbot" }, presence: { status: "online", activities: [{ name: firstStatus.state, type: 0 }, { name: "Custom Status", type: 4, state: firstStatus.state }], afk: false } } }));
          if (statusInterval) clearInterval(statusInterval);
          statusInterval = setInterval(() => {
            statusIndex = (statusIndex + 1) % ROTATING_STATUSES.length;
            const next = ROTATING_STATUSES[statusIndex];
            try { ws.send(JSON.stringify(buildPresence(next))); } catch {}
            console.log(`[Status] ${next.state}`);
          }, 3 * 60_000);
          break;
        }
        case 0: {
          const { t, d } = payload;
          if (t === "READY") {
            console.log(`[Bot] Logged in as ${d.user.username} (${d.user.id})`);
            console.log(`[Bot] Prefix: "${PREFIX}" | ${d.guilds.length} guild(s)`);
            for (const guild of d.guilds) ws.send(JSON.stringify({ op: 14, d: { guild_id: guild.id, typing: true, activities: true, threads: true, members: [] } }));
            setTimeout(() => { try { ws.send(JSON.stringify(buildPresence(ROTATING_STATUSES[statusIndex]))); } catch {} }, 2_000);
          }
          if (t === "GUILD_MEMBER_ADD" && AUTO_ROLE_ID && d.guild_id && d.user?.id) {
            try { await apiRequest("PUT", `/guilds/${d.guild_id}/members/${d.user.id}/roles/${AUTO_ROLE_ID}`, undefined, token); } catch {}
          }
          if (t === "MESSAGE_CREATE") {
            const msg = d;
            const now = Date.now();
            const lastSeen = recentMessageIds.get(msg.id);
            if (lastSeen && now - lastSeen < 60_000) return;
            if (processingMessageIds.has(msg.id)) return;
            processingMessageIds.add(msg.id);
            try {
              const content = (msg.content ?? "").trim();
              console.log(`[Msg] ${msg.author.username}: ${content || "(empty)"}`);
              if (msg.author.bot && msg.author.id !== selfId) return;
              const usedPrefix = content.startsWith(PREFIX) ? PREFIX : null;
              if (!usedPrefix) {
                // Friend name triggers
                const lower = content.toLowerCase();
                const FRIEND_TRIGGERS = [
                  { name: "frosty",  response: "frosty is so cool the coolest" },
                  { name: "wil",     response: "wil is my homie bro" },
                  { name: "ori",     response: "ori you suck at jjs" },
                  { name: "krabs",   response: "femboy" },
                  { name: "acid",    response: "fuck acid bro" },
                ];
                for (const trigger of FRIEND_TRIGGERS) {
                  if (lower.includes(trigger.name)) {
                    await send(msg.channel_id, trigger.response, token);
                    break;
                  }
                }
                if (AUTO_REPLY && !msg.author.bot) await send(msg.channel_id, AUTO_REPLY_MESSAGE, token);
                return;
              }
              const commandKey = `${msg.author.id}:${msg.channel_id}:${content}`;
              const lastInvocation = recentCommandInvocations.get(commandKey);
              if (lastInvocation && now - lastInvocation < 5_000) { console.log(`[Cmd] Suppressed duplicate: ${commandKey}`); return; }
              recentCommandInvocations.set(commandKey, now);
              pruneMap(recentCommandInvocations, 60_000);
              if (msg.author.id !== selfId) {
                const eco = loadEconomy();
                const callingUser = getUser(eco, msg.author.id);
                if (callingUser.blacklisted && !isOwner(msg.author.id)) { await send(msg.channel_id, "🚫 You are blacklisted from using commands.", token); return; }
                if (callingUser.frozen && !isOwner(msg.author.id)) { await send(msg.channel_id, "❄️ Your account is frozen. You cannot use any commands.", token); return; }
              }
              const withoutPrefix = content.slice(usedPrefix.length).trim();
              if (!withoutPrefix) return;
              const [cmdName, ...cmdArgs] = withoutPrefix.split(/\s+/);
              if (!cmdName) return;
              console.log(`[Cmd] ${cmdName} by ${msg.author.username}`);
              await handleCommand(cmdName.toLowerCase(), cmdArgs, msg, token);
            } finally {
              processingMessageIds.delete(msg.id);
              recentMessageIds.set(msg.id, now);
              pruneMap(recentMessageIds, 120_000);
            }
          }
          break;
        }
        case 7: if (ws === currentWs) ws.close(); break;
        case 9: if (ws === currentWs) { reconnectDelay = 5_000; ws.close(); } break;
      }
    });

    ws.on("close", (code) => {
      if (ws !== currentWs) return;
      if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
      if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }
      console.log(`[Gateway] Disconnected (${code}). Reconnecting in ${reconnectDelay / 1000}s...`);
      currentWs = null;
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    });

    ws.on("error", (err) => { if (ws !== currentWs) return; console.error("[Gateway] Error:", err.message); });
  }

  connect();
}

// ─── Entry ────────────────────────────────────────────────────────────────────
async function main() {
  if (!EMAIL || !PASSWORD) { console.error("Error: BOT_EMAIL and BOT_PASSWORD must be set."); process.exit(1); }
  console.log("=== Sinbot v2 ===");
  const res = await apiRequest("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  if (!res.token) { console.error("Login failed:", res.message ?? JSON.stringify(res)); process.exit(1); }
  const token = res.token;
  const me = await apiRequest("GET", "/users/@me", undefined, token);
  BOT_USER_ID = me.id;
  console.log(`[Bot] Authenticated as: ${me.username} (${me.id})`);
  startGateway(token, me.id);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
