// @ts-nocheck
import WebSocket from "ws";
import fs from "fs";
import OpenAI from "openai";

const GATEWAY_URL = "wss://hummus-gateway.sys42.net/?encoding=json&v=6";
const API_BASE = "https://hummus.sys42.net/api/v6";

const PREFIX = "s.";

let BOT_USER_ID = "";
let seq = null;

// ────────────────────────────────
// Economy Storage
// ────────────────────────────────
const ECO_FILE = "./economy.json";

function loadEco() {
  try { return JSON.parse(fs.readFileSync(ECO_FILE)); }
  catch { return {}; }
}

function saveEco(data) {
  fs.writeFileSync(ECO_FILE, JSON.stringify(data, null, 2));
}

function getUser(eco, id) {
  if (!eco[id]) {
    eco[id] = {
      balance: 0,
      fish: {},
      cooldowns: {},
      ego: { trust: 50, fear: 0, affection: 50, rivalry: 0 }
    };
  }
  return eco[id];
}

// ────────────────────────────────
// Utilities
// ────────────────────────────────
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const now = () => Date.now();

function send(ws, channel_id, content) {
  ws.send(JSON.stringify({
    op: 4,
    d: { channel_id, content }
  }));
}

// ────────────────────────────────
// AI (optional)
// ────────────────────────────────
let openai;
function ai() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// ────────────────────────────────
// Commands System
// ────────────────────────────────
const commands = new Map();

function cmd(name, fn) {
  commands.set(name, fn);
}

// ────────────────────────────────
// COMMANDS
// ────────────────────────────────

// ping
cmd("ping", async ({ send }) => {
  send("Pong 🏓");
});

// help
cmd("help", async ({ send }) => {
  send("Commands: ping, balance, fish, work, inventory, ai");
});

// balance
cmd("balance", async ({ u, send }) => {
  send(`💰 Balance: ${u.balance}`);
});

// fish
cmd("fish", async ({ u, eco, send }) => {
  const cd = u.cooldowns.fish || 0;
  if (now() - cd < 20000) return send("⏳ Cooldown active");

  const fishList = [
    { name: "Carp", price: 10 },
    { name: "Bass", price: 40 },
    { name: "Golden Koi", price: 120 }
  ];

  const fish = rand(fishList);

  u.fish[fish.name] = (u.fish[fish.name] || 0) + 1;
  u.cooldowns.fish = now();

  saveEco(eco);

  send(`🎣 You caught **${fish.name}**`);
});

// work
cmd("work", async ({ u, eco, send }) => {
  const cd = u.cooldowns.work || 0;
  if (now() - cd < 12 * 60 * 60 * 1000)
    return send("⏳ You already worked recently");

  const jobs = [
    "Barista",
    "Programmer",
    "Streamer",
    "Delivery Driver"
  ];

  const pay = Math.floor(Math.random() * 300) + 100;

  u.balance += pay;
  u.cooldowns.work = now();

  saveEco(eco);

  send(`💼 You worked as a **${rand(jobs)}** and earned **${pay}**`);
});

// inventory
cmd("inventory", async ({ u, send }) => {
  send("🐟 Fish: " + JSON.stringify(u.fish));
});

// ai
cmd("ai", async ({ args, send }) => {
  const q = args.join(" ");
  if (!q) return send("Usage: s.ai <question>");

  const client = ai();
  if (!client) return send("AI not configured");

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: q }]
  });

  send(res.choices[0].message.content);
});

// joke
cmd("joke", async ({ send }) => {
  const jokes = [
    "Why don't scientists trust atoms?",
    "I told my computer I needed a break..."
  ];

  send(rand(jokes));
});

// ────────────────────────────────
// Command Runner
// ────────────────────────────────
async function run(ws, msg, name, args) {
  const eco = loadEco();
  const u = getUser(eco, msg.author.id);

  const fn = commands.get(name);
  if (!fn) return send(ws, msg.channel_id, "Unknown command");

  await fn({
    ws,
    msg,
    args,
    eco,
    u,
    send: (m) => send(ws, msg.channel_id, m)
  });

  saveEco(eco);
}

// ────────────────────────────────
// Gateway
// ────────────────────────────────
function connect(token) {
  const ws = new WebSocket(GATEWAY_URL);

  ws.on("message", async (raw) => {
    const p = JSON.parse(raw);

    if (p.s) seq = p.s;

    if (p.op === 10) {
      setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: seq }));
      }, p.d.heartbeat_interval);

      ws.send(JSON.stringify({
        op: 2,
        d: { token }
      }));
    }

    if (p.t === "MESSAGE_CREATE") {
      const msg = p.d;
      const content = msg.content?.trim();
      if (!content) return;

      if (!content.startsWith(PREFIX)) return;

      const [name, ...args] = content
        .slice(PREFIX.length)
        .split(/\s+/);

      await run(ws, msg, name.toLowerCase(), args);
    }
  });

  ws.on("close", () => setTimeout(() => connect(token), 3000));
}

// ────────────────────────────────
// LOGIN
// ────────────────────────────────
async function login() {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.BOT_EMAIL,
      password: process.env.BOT_PASSWORD
    })
  });

  const data = await res.json();
  return data.token;
}

// ────────────────────────────────
// START
// ────────────────────────────────
(async () => {
  const token = await login();
  console.log("Bot logged in");
  connect(token);
})();