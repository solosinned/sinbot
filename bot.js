// @ts-nocheck

import WebSocket from "ws";

const WS_URL = "wss://hmus.sys42.net/"; // change if your bot uses a different endpoint
const PREFIX = "s.";

const ws = new WebSocket(WS_URL);

// ================= STATE =================

const users = new Map();

const fishTable = [
  { name: "Boot", value: 1, rarity: "trash" },
  { name: "Carp", value: 5, rarity: "common" },
  { name: "Salmon", value: 10, rarity: "common" },
  { name: "Pufferfish", value: 20, rarity: "uncommon" },
  { name: "Shark", value: 50, rarity: "rare" },
  { name: "Golden Fish", value: 200, rarity: "legendary" }
];

// ================= HELPERS =================

function getUser(id) {
  if (!users.has(id)) {
    users.set(id, {
      balance: 0,
      fish: [],
      notes: [],
      lastDaily: 0
    });
  }
  return users.get(id);
}

function send(data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ================= CONNECTION =================

ws.on("open", () => {
  console.log("Bot connected.");
});

// ================= MESSAGE HANDLER =================

ws.on("message", (raw) => {
  let msg;

  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  const text = msg.content;
  const user = msg.author;

  if (!text || !user) return;
  if (!text.startsWith(PREFIX)) return;

  const args = text.slice(PREFIX.length).trim().split(/ +/g);
  const cmd = args.shift()?.toLowerCase();

  const u = getUser(user.id);

  // ================= HELP =================
  if (cmd === "help") {
    return send({
      content:
`📜 COMMANDS

🧠 Utility:
s.help, s.ping, s.remind, s.search, s.note

🎣 Fishing:
s.fish, s.inv, s.collection, s.sell all

💰 Economy:
s.balance, s.daily, s.leaderboard, s.crate, s.evolve

🎮 Fun:
s.roll, s.riddle, s.event`
    });
  }

  // ================= PING =================
  if (cmd === "ping") {
    return send({ content: "🏓 Pong!" });
  }

  // ================= BALANCE =================
  if (cmd === "balance") {
    return send({ content: `💰 Balance: ${u.balance}` });
  }

  // ================= DAILY =================
  if (cmd === "daily") {
    const now = Date.now();
    if (now - u.lastDaily < 86400000) {
      return send({ content: "⏳ Already claimed daily reward." });
    }

    const reward = 50 + Math.floor(Math.random() * 150);
    u.balance += reward;
    u.lastDaily = now;

    return send({ content: `🎁 Daily +${reward} coins` });
  }

  // ================= FISH =================
  if (cmd === "fish") {
    const fish = rand(fishTable);
    u.fish.push(fish);
    u.balance += fish.value;

    return send({
      content: `🎣 Caught ${fish.name} (${fish.rarity}) +${fish.value}`
    });
  }

  // ================= INVENTORY =================
  if (cmd === "inv") {
    if (!u.fish.length) return send({ content: "🎒 Empty inventory" });

    return send({
      content:
        "🎒 Fish:\n" +
        u.fish.map((f, i) => `${i + 1}. ${f.name}`).join("\n")
    });
  }

  // ================= SELL ALL =================
  if (cmd === "sell" && args[0] === "all") {
    let total = u.fish.reduce((a, f) => a + f.value, 0);

    u.balance += total;
    u.fish = [];

    return send({ content: `💰 Sold all for ${total}` });
  }

  // ================= COLLECTION =================
  if (cmd === "collection") {
    const unique = [...new Set(u.fish.map(f => f.name))];

    return send({
      content: unique.length
        ? `📘 Collected: ${unique.join(", ")}`
        : "📘 Nothing collected yet"
    });
  }

  // ================= NOTES =================
  if (cmd === "note") {
    const sub = args[0];

    if (sub === "add") {
      u.notes.push(args.slice(1).join(" "));
      return send({ content: "📝 Added note" });
    }

    if (sub === "view") {
      return send({
        content: u.notes.length
          ? u.notes.map((n, i) => `${i + 1}. ${n}`).join("\n")
          : "No notes"
      });
    }

    if (sub === "remove") {
      const i = parseInt(args[1]) - 1;
      u.notes.splice(i, 1);
      return send({ content: "🗑️ Removed note" });
    }
  }

  // ================= LEADERBOARD =================
  if (cmd === "leaderboard") {
    const top = [...users.entries()]
      .sort((a, b) => b[1].balance - a[1].balance)
      .slice(0, 5);

    return send({
      content:
        "🏆 Leaderboard:\n" +
        top.map(([id, u], i) => `${i + 1}. ${id} - ${u.balance}`).join("\n")
    });
  }

  // ================= CRATE =================
  if (cmd === "crate") {
    const reward = Math.random() < 0.1 ? 500 : 75;
    u.balance += reward;

    return send({ content: `📦 Crate: +${reward}` });
  }

  // ================= ROLL =================
  if (cmd === "roll") {
    return send({ content: `🎲 ${Math.floor(Math.random() * 100)}` });
  }

  // ================= RIDDLE =================
  if (cmd === "riddle") {
    return send({ content: "🧠 What has keys but no locks?" });
  }

  // ================= EVENT =================
  if (cmd === "event") {
    const events = [
      "💰 Double coins!",
      "🎣 Rare fish boosted!",
      "⚡ XP boost!"
    ];
    return send({ content: rand(events) });
  }

  // ================= EVOLVE =================
  if (cmd === "evolve") {
    return send({
      content: `🧬 Level: ${Math.floor(u.balance / 100)}`
    });
  }

  // ================= SEARCH =================
  if (cmd === "search") {
    return send({ content: `🔎 ${args.join(" ")}` });
  }

  // ================= REMIND =================
  if (cmd === "remind") {
    const time = parseInt(args[0]);
    const msgText = args.slice(1).join(" ");

    if (!time || !msgText) {
      return send({ content: "Usage: s.remind <sec> <msg>" });
    }

    send({ content: `⏳ Reminder set (${time}s)` });

    setTimeout(() => {
      send({ content: `⏰ Reminder: ${msgText}` });
    }, time * 1000);
  }
});