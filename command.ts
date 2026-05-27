import { PREFIX, FISH_COOLDOWN_MS, WORK_COOLDOWN_MS, DAILY_COOLDOWN_MS } from "./config.js";
import { SHOP_ITEMS, LOOTBOXES, JOKES, WORK_JOBS, ACHIEVEMENTS, FISH_ITEMS, COLLECTIBLE_ITEMS, SECURITY_LEVELS, TRIVIA_QUESTIONS } from "./data.js";
import {
  loadEconomy,
  saveEconomy,
  getUser,
  awardAchievement,
  getAchievementStatus,
  getFishPool,
  weightedRandom,
  openLootbox,
  formatDuration,
  findInventoryKey,
} from "./economy.js";
import { getEgo, nudgeEgo, trustLabel, fearLabel, affectionLabel, rivalryLabel, egoFlavorLine } from "./ego.js";
import { send, getMentionedUser, resolveUserId, calculate, isOwner, rarityEmoji, rnd } from "./utils.js";
import type { DiscordMessage } from "./types.js";

interface PendingDuel {
  challengerId: string;
  challengerName: string;
  targetId: string;
  bet: number;
  channelId: string;
  expiresAt: number;
}

const pendingDuels = new Map<string, PendingDuel>();
const DUEL_EXPIRY_MS = 60_000;

function cleanExpiredDuels(): void {
  const now = Date.now();
  for (const [key, duel] of pendingDuels) {
    if (now > duel.expiresAt) pendingDuels.delete(key);
  }
}

interface PendingHeist {
  organizerId: string;
  organizerName: string;
  channelId: string;
  amount: number;
  crew: Array<{ id: string; name: string }>;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

const pendingHeists = new Map<string, PendingHeist>(); // keyed by channelId

function heistSuccessChance(crewSize: number): number {
  return Math.min(0.35 + (crewSize - 1) * 0.10, 0.65);
}

function heistMultiplier(crewSize: number): number {
  return [0, 2.0, 1.75, 1.5, 1.35][crewSize] ?? 1.35;
}

interface PendingTrade {
  senderId: string;
  senderName: string;
  targetId: string;
  channelId: string;
  itemName: string;
  qty: number;
  price: number;
  expiresAt: number;
}

interface PendingTrivia {
  question: string;
  answer: string;
  reward: number;
  channelId: string;
  timer: ReturnType<typeof setTimeout>;
}

const pendingTrades = new Map<string, PendingTrade>(); // keyed by targetId
const pendingTrivia = new Map<string, PendingTrivia>(); // keyed by channelId

async function executeHeist(channelId: string, token: string): Promise<void> {
  const heist = pendingHeists.get(channelId);
  if (!heist) return;
  pendingHeists.delete(channelId);
  clearTimeout(heist.timer);

  const crewSize = heist.crew.length;
  const successChance = heistSuccessChance(crewSize);
  const success = Math.random() < successChance;
  const multi = heistMultiplier(crewSize);
  const payout = Math.floor(heist.amount * multi);
  const net = payout - heist.amount;

  const eco = loadEconomy();
  const crewLines = heist.crew.map((m) => `<@${m.id}>`).join(", ");

  if (success) {
    for (const member of heist.crew) {
      const u = getUser(eco, member.id);
      u.balance += net;
      nudgeEgo(u, { rivalry: 3, affection: 5 });
    }
    saveEconomy(eco);
    await send(channelId, [
      `🏦 **HEIST COMPLETE!**`,
      `Crew (${crewSize}): ${crewLines}`,
      ``,
      `✅ The job went clean. Each crew member walks away with **+${net.toLocaleString()} sincoins** *(${multi}x on a ${heist.amount.toLocaleString()} sincoin buy-in)*.`,
    ].join("\n"), token);
  } else {
    for (const member of heist.crew) {
      const u = getUser(eco, member.id);
      u.balance = Math.max(0, u.balance - heist.amount);
      nudgeEgo(u, { fear: 5, rivalry: 2 });
    }
    saveEconomy(eco);
    await send(channelId, [
      `🚨 **HEIST BUSTED!**`,
      `Crew (${crewSize}): ${crewLines}`,
      ``,
      `❌ The job went sideways. Everyone lost their **${heist.amount.toLocaleString()} sincoin** buy-in.`,
    ].join("\n"), token);
  }
}

export async function handleCommand(
  name: string,
  args: string[],
  msg: DiscordMessage,
  token: string
): Promise<void> {
  const ch = msg.channel_id;
  const authorId = msg.author.id;
  const authorName = msg.author.username;

  switch (name) {
    // ─── General ────────────────────────────────────────────────────────────
    case "help": {
      const sections = [
        "**=== Sinbot Help ===**",
        "",
        "**General**",
        `\`${PREFIX}help\` — Show this menu`,
        `\`${PREFIX}ping\` — Check bot latency`,
        `\`${PREFIX}info\` — Bot information`,
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
        `\`${PREFIX}decline\` — Decline a pending duel`,
        "",
        "**Economy**",
        `\`${PREFIX}balance [@user]\` — Check balance`,
        `\`${PREFIX}daily\` — Claim daily reward (streak bonuses!)`,
        `\`${PREFIX}work\` — Work for sincoins (12h cooldown)`,
        `\`${PREFIX}pay @user <amount>\` — Send sincoins`,
        `\`${PREFIX}leaderboard\` / \`${PREFIX}lb\` — Top balances`,
        `\`${PREFIX}lb wanted\` — Most Wanted leaderboard`,
        `\`${PREFIX}lb security\` — Top security levels`,
        "",
        "**Fishing**",
        `\`${PREFIX}fish\` — Go fishing (20s cooldown)`,
        `\`${PREFIX}inventory\` — View your fish`,
        `\`${PREFIX}sell <fish> [qty]\` — Sell fish`,
        `\`${PREFIX}sellall\` — Sell all fish`,
        `\`${PREFIX}fishdex\` — View all fish rarities`,
        "",
        "**Shop & Items**",
        `\`${PREFIX}shop\` — Browse the shop`,
        `\`${PREFIX}buy <item>\` — Buy an item or lootbox`,
        `\`${PREFIX}open <box>\` — Open a lootbox`,
        `\`${PREFIX}items\` — View your collectibles`,
        `\`${PREFIX}sellitem <item> [qty]\` — Sell a collectible`,
        "",
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
        `\`${PREFIX}answer <text>\` — Answer the active trivia question`,
        "",
        "**Moderation** *(owner/whitelisted only)*",
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
      ];
      await send(ch, sections.join("\n"), token);
      break;
    }

    case "ping": {
      const start = Date.now();
      await send(ch, "🏓 Pong! Calculating...", token);
      await send(ch, `🏓 Pong! Latency: **${Date.now() - start}ms**`, token);
      break;
    }

    case "info": {
      await send(
        ch,
        [
          "**=== Sinbot Info ===**",
          `Prefix: \`${PREFIX}\``,
          "Platform: hmus.sys42.net",
          "Commands: 30+",
          "Economy: sincoins 💰",
          "Features: Fishing, Lootboxes, Shop, Ego system, Daily rewards, Work",
        ].join("\n"),
        token
      );
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
      await send(ch, JOKES[Math.floor(Math.random() * JOKES.length)]!, token);
      break;
    }

    case "coinflip":
    case "cf": {
      const guess = args[0]?.toLowerCase();
      const result = Math.random() < 0.5 ? "heads" : "tails";
      const emoji = result === "heads" ? "🪙" : "🪙";
      if (!guess || (guess !== "heads" && guess !== "tails")) {
        await send(ch, `${emoji} The coin landed on **${result}**!`, token);
      } else {
        const won = guess === result;
        await send(
          ch,
          `${emoji} The coin landed on **${result}**! You guessed ${guess} — ${won ? "✅ Correct!" : "❌ Wrong!"}`,
          token
        );
      }
      break;
    }

    case "roll": {
      const notation = args[0] ?? "1d6";
      const match = notation.match(/^(\d+)d(\d+)$/i);
      if (!match) { await send(ch, `Usage: \`${PREFIX}roll NdN\` (e.g. 2d6, 1d20)`, token); break; }
      const count = Math.min(parseInt(match[1]!, 10), 20);
      const sides = Math.min(parseInt(match[2]!, 10), 1000);
      if (count < 1 || sides < 2) { await send(ch, "Invalid dice notation.", token); break; }
      const rolls = Array.from({ length: count }, () => rnd(1, sides));
      const total = rolls.reduce((a, b) => a + b, 0);
      await send(
        ch,
        `🎲 Rolling **${notation}**: [${rolls.join(", ")}] = **${total}**`,
        token
      );
      break;
    }

    // ─── Heist ───────────────────────────────────────────────────────────────
    case "heist": {
      const betArg = parseInt(args.find((a) => /^\d+$/.test(a)) ?? "0", 10);
      if (betArg < 50) { await send(ch, `Usage: \`${PREFIX}heist <amount>\` — minimum buy-in is 50 sincoins.`, token); break; }
      if (pendingHeists.has(ch)) { await send(ch, `❌ A heist is already being planned in this channel. Use \`${PREFIX}joinheist\` to join.`, token); break; }

      const eco = loadEconomy();
      const organizer = getUser(eco, authorId);
      if (organizer.balance < betArg) { await send(ch, `❌ You don't have enough sincoins for that buy-in.`, token); break; }

      const timer = setTimeout(() => { executeHeist(ch, token).catch(() => {}); }, 60_000);
      pendingHeists.set(ch, {
        organizerId: authorId,
        organizerName: authorName,
        channelId: ch,
        amount: betArg,
        crew: [{ id: authorId, name: authorName }],
        expiresAt: Date.now() + 60_000,
        timer,
      });

      await send(ch, [
        `🏦 **HEIST PLANNING — Buy-in: ${betArg.toLocaleString()} sincoins**`,
        `**${authorName}** is organizing a heist! Type \`${PREFIX}joinheist\` to join the crew.`,
        ``,
        `Crew odds: 1 person = 35% | 2 = 45% | 3 = 55% | 4 = 65%`,
        `Payout: 2x solo → 1.35x per person with 4 crew`,
        ``,
        `🕐 Launching in 60 seconds — or use \`${PREFIX}launchheist\` to go early.`,
      ].join("\n"), token);
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
      const crewNames = heist.crew.map((m) => m.name).join(", ");
      await send(ch, `✅ **${authorName}** joined the heist! Crew (${heist.crew.length}/4): ${crewNames}`, token);
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

    // ─── Rob ─────────────────────────────────────────────────────────────────
    case "rob": {
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}rob @user\``, token); break; }
      if (target.id === authorId) { await send(ch, "❌ You can't rob yourself.", token); break; }
      if (isOwner(target.id)) { await send(ch, "❌ Bold move. Not happening.", token); break; }

      const eco = loadEconomy();
      const robber = getUser(eco, authorId);
      const victim = getUser(eco, target.id);

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
        await send(ch, [
          `🦹 **Robbery successful!**${secLabel}`,
          `You slipped away with **${stealAmt.toLocaleString()} sincoins** from **${target.username}** *(${Math.round(stealPct * 100)}% of their balance)*.${insLine}`,
          `💰 Your balance: **${robber.balance.toLocaleString()} sincoins**`,
        ].join("\n"), token);
      } else {
        const fine = Math.floor(stealAmt * (0.75 + sec * 0.05));
        robber.balance = Math.max(0, robber.balance - fine);
        nudgeEgo(robber, { trust: -5, fear: 5, rivalry: 3 });
        nudgeEgo(victim, { trust: 5, affection: 3 });
        saveEconomy(eco);
        await send(ch, [
          `🚔 **Caught red-handed!**${secLabel}`,
          `You tried to rob **${target.username}** but their security stopped you. Fine: **${fine.toLocaleString()} sincoins**.`,
          `💰 Your balance: **${robber.balance.toLocaleString()} sincoins**`,
        ].join("\n"), token);
      }
      break;
    }

    case "wanted": {
      const eco = loadEconomy();
      const wantedLevel = (n: number) => {
        if (n === 0)   return { title: "Clean",       emoji: "😇" };
        if (n < 5)     return { title: "Pickpocket",  emoji: "🤏" };
        if (n < 10)    return { title: "Thief",        emoji: "🦹" };
        if (n < 20)    return { title: "Bandit",       emoji: "🔫" };
        if (n < 35)    return { title: "Outlaw",       emoji: "🤠" };
        if (n < 50)    return { title: "Desperado",    emoji: "💀" };
        if (n < 75)    return { title: "Gang Leader",  emoji: "👑" };
        if (n < 100)   return { title: "Crime Boss",   emoji: "🕴️" };
        return           { title: "Crime Lord",        emoji: "☠️" };
      };
      const target = getMentionedUser(msg, args);
      if (target) {
        const u = getUser(eco, target.id);
        const total = u.totalRobs ?? 0;
        const wins  = u.totalRobsSuccessful ?? 0;
        const rate  = total > 0 ? Math.round((wins / total) * 100) : 0;
        const lv    = wantedLevel(total);
        await send(ch, [
          `🚨 **Wanted Profile — ${target.username}**`,
          `${lv.emoji} **${lv.title}**`,
          `Rob attempts: **${total}** | Successful: **${wins}** | Success rate: **${rate}%**`,
        ].join("\n"), token);
      } else {
        const sorted = Object.entries(eco)
          .filter(([, u]) => (u.totalRobs ?? 0) > 0)
          .sort(([, a], [, b]) => (b.totalRobs ?? 0) - (a.totalRobs ?? 0))
          .slice(0, 10);
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
      const current = SECURITY_LEVELS[sec]!;
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
      const next = SECURITY_LEVELS[sec + 1]!;
      if (u.balance < next.cost) { await send(ch, `❌ You need **${next.cost.toLocaleString()} sincoins** to upgrade to **${next.name}**. You have **${u.balance.toLocaleString()}**.`, token); break; }
      u.balance -= next.cost;
      u.security = sec + 1;
      saveEconomy(eco);
      await send(ch, [
        `🛡️ **Security upgraded to Lv.${u.security} — ${next.name}**!`,
        next.description,
        `💰 Balance: **${u.balance.toLocaleString()} sincoins**`,
      ].join("\n"), token);
      break;
    }

    case "viewinv": {
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}viewinv @user\``, token); break; }
      const eco = loadEconomy();
      const u = getUser(eco, target.id);
      const fish = Object.entries(u.fishInventory).filter(([, q]) => q > 0);
      const items = Object.entries(u.itemInventory).filter(([, q]) => q > 0);
      const fishLines = fish.length
        ? fish.map(([n, q]) => { const f = FISH_ITEMS.find((x) => x.name === n); return `${f ? rarityEmoji(f.rarity) : "🐟"} **${n}** x${q}`; })
        : ["*(empty)*"];
      const itemLines = items.length
        ? items.map(([n, q]) => { const def = COLLECTIBLE_ITEMS.find((x) => x.name === n); return `${def ? rarityEmoji(def.rarity) : "📦"} **${n}** x${q}`; })
        : ["*(empty)*"];
      await send(ch, [
        `📦 **${target.username}'s Inventory**`,
        "", "🎣 **Fish**", ...fishLines,
        "", "🎁 **Items**", ...itemLines,
      ].join("\n"), token);
      break;
    }

    case "trade": {
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}trade @user <item> <qty> <price>\``, token); break; }
      if (target.id === authorId) { await send(ch, "❌ You can't trade with yourself.", token); break; }
      const nums = args.filter((a) => /^\d+$/.test(a));
      const price = parseInt(nums[nums.length - 1] ?? "0", 10);
      const qty = parseInt(nums[nums.length - 2] ?? "1", 10);
      const itemRaw = args
        .filter((a) => !a.match(/^<@/) && !/^\d+$/.test(a))
        .join(" ")
        .trim();
      if (!itemRaw || price < 1 || qty < 1) { await send(ch, `Usage: \`${PREFIX}trade @user <item> <qty> <price>\``, token); break; }
      const eco = loadEconomy();
      const sender = getUser(eco, authorId);
      const fishKey = findInventoryKey(sender.fishInventory, itemRaw);
      const itemKey = findInventoryKey(sender.itemInventory, itemRaw);
      const resolvedKey = fishKey ?? itemKey;
      const isFish = Boolean(fishKey);
      if (!resolvedKey) { await send(ch, `❌ You don't have **${itemRaw}** in your inventory.`, token); break; }
      const have = isFish ? (sender.fishInventory[resolvedKey] ?? 0) : (sender.itemInventory[resolvedKey] ?? 0);
      if (have < qty) { await send(ch, `❌ You only have **${have}x ${resolvedKey}**.`, token); break; }
      pendingTrades.set(target.id, {
        senderId: authorId, senderName: authorName, targetId: target.id,
        channelId: ch, itemName: resolvedKey, qty, price, expiresAt: Date.now() + 60_000,
      });
      await send(ch, [
        `🤝 **Trade offer from ${authorName} → ${target.username}**`,
        `Item: **${qty}x ${resolvedKey}** for **${price.toLocaleString()} sincoins**`,
        `<@${target.id}> — type \`${PREFIX}accepttrade\` to accept or \`${PREFIX}declinetrade\` to refuse. *(Expires in 60s)*`,
      ].join("\n"), token);
      break;
    }

    case "accepttrade": {
      const trade = [...pendingTrades.values()].find((t) => t.targetId === authorId && t.channelId === ch);
      if (!trade || Date.now() > trade.expiresAt) { pendingTrades.delete(authorId); await send(ch, "❌ No pending trade offer for you here.", token); break; }
      const eco = loadEconomy();
      const buyer = getUser(eco, authorId);
      const seller = getUser(eco, trade.senderId);
      if (buyer.balance < trade.price) { await send(ch, `❌ You need **${trade.price.toLocaleString()} sincoins** to accept. You have **${buyer.balance.toLocaleString()}**.`, token); break; }
      const fishKey = findInventoryKey(seller.fishInventory, trade.itemName);
      const itemKey = findInventoryKey(seller.itemInventory, trade.itemName);
      const isFish = Boolean(fishKey);
      const resolvedKey = fishKey ?? itemKey;
      const have = resolvedKey ? (isFish ? (seller.fishInventory[resolvedKey] ?? 0) : (seller.itemInventory[resolvedKey] ?? 0)) : 0;
      if (!resolvedKey || have < trade.qty) { pendingTrades.delete(authorId); await send(ch, `❌ **${trade.senderName}** no longer has enough **${trade.itemName}** to complete the trade.`, token); break; }
      buyer.balance -= trade.price;
      seller.balance += trade.price;
      if (isFish) {
        seller.fishInventory[resolvedKey] = have - trade.qty;
        if (seller.fishInventory[resolvedKey] === 0) delete seller.fishInventory[resolvedKey];
        buyer.fishInventory[trade.itemName] = (buyer.fishInventory[trade.itemName] ?? 0) + trade.qty;
      } else {
        seller.itemInventory[resolvedKey] = have - trade.qty;
        if (seller.itemInventory[resolvedKey] === 0) delete seller.itemInventory[resolvedKey];
        buyer.itemInventory[trade.itemName] = (buyer.itemInventory[trade.itemName] ?? 0) + trade.qty;
      }
      pendingTrades.delete(authorId);
      saveEconomy(eco);
      await send(ch, [
        `✅ **Trade complete!**`,
        `**${trade.senderName}** sold **${trade.qty}x ${trade.itemName}** to **${authorName}** for **${trade.price.toLocaleString()} sincoins**.`,
      ].join("\n"), token);
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
        ``,
        `**Trust** — Does the bot trust you? (0–100)`,
        `Low (≤35): Suspicious / Traitor | High (≥75): Trusted / Confidant`,
        `↑ Raised by: paying others, following users, winning duels fairly`,
        `↓ Lowered by: robbing, getting blacklisted, getting caught`,
        ``,
        `**Affection** — Does the bot like you? (0–100)`,
        `Low (≤35): Despised / Disliked | High (≥75): Liked / Favorite`,
        `↑ Raised by: working, winning duels, heist success, getting followed`,
        `↓ Lowered by: losing fights, robbing others, being idle`,
        ``,
        `**Fear** — Does the bot fear you? (0–100)`,
        `Low (≤10): None | High (≥80): Intimidated / Terrified`,
        `↑ Raised by: getting caught robbing, warning others, losing duels badly`,
        `↓ Naturally stays low without repeated aggressive actions`,
        ``,
        `**Rivalry** — Are you a rival? (0–100)`,
        `Low (≤20): None | High (≥65): Rival / Nemesis / Arch-Enemy`,
        `↑ Raised by: dueling, robbing, heisting, gambling heavily`,
        `↓ Fades with positive or neutral interactions`,
        ``,
        `**How to become friends with the bot:**`,
        `Work regularly, follow others, win duels, avoid robbing. Aim for Trust 75+ and Affection 75+.`,
        ``,
        `**How to become enemies:**`,
        `Rob constantly, lose every fight, get blacklisted. High Rivalry (65+) + low Trust (≤35) = Arch-Enemy status.`,
        ``,
        `The bot may drop passive flavor comments in chat when your stats are extreme.`,
      ].join("\n"), token);
      break;
    }

    case "trivia": {
      if (pendingTrivia.has(ch)) { await send(ch, `❓ A trivia question is already active! Use \`${PREFIX}answer <your answer>\`.`, token); break; }
      const q = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)]!;
      const timer = setTimeout(async () => {
        if (pendingTrivia.has(ch)) {
          pendingTrivia.delete(ch);
          await send(ch, `⏰ Time's up! The answer was **${q.a}**. No sincoins awarded.`, token).catch(() => {});
        }
      }, 45_000);
      pendingTrivia.set(ch, { question: q.q, answer: q.a, reward: q.reward, channelId: ch, timer });
      await send(ch, [
        `❓ **TRIVIA — ${q.reward} sincoins**`,
        q.q,
        `Type \`${PREFIX}answer <your answer>\` — you have 45 seconds!`,
      ].join("\n"), token);
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
      await send(ch, [
        `✅ **${authorName}** got it! The answer was **${trivia.answer}**.`,
        `🏆 +**${trivia.reward} sincoins** | Balance: **${u.balance.toLocaleString()} sincoins**`,
      ].join("\n"), token);
      break;
    }

    // ─── Gamble ──────────────────────────────────────────────────────────────
    case "gamble":
    case "slots": {
      const betArg = parseInt(args[0] ?? "0", 10);
      if (!betArg || betArg < 10) { await send(ch, `Usage: \`${PREFIX}gamble <amount>\` — minimum bet is 10 sincoins.`, token); break; }
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      if (user.balance < betArg) { await send(ch, `❌ You only have **${user.balance.toLocaleString()} sincoins**.`, token); break; }

      const SYMBOLS = ["🍒", "🍋", "🍇", "🍀", "💎", "7️⃣"];
      const WEIGHTS = [30, 25, 20, 12, 8, 5];
      const MULTIPLIERS: Record<string, number> = { "🍒": 2, "🍋": 3, "🍇": 4, "🍀": 6, "💎": 10, "7️⃣": 20 };

      function spinReel(): string {
        const total = WEIGHTS.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < SYMBOLS.length; i++) {
          r -= WEIGHTS[i]!;
          if (r <= 0) return SYMBOLS[i]!;
        }
        return SYMBOLS[0]!;
      }

      const reels = [spinReel(), spinReel(), spinReel()];
      const [a, b, c] = reels;

      let multiplier = 0;
      let resultLine = "";

      if (a === b && b === c) {
        multiplier = MULTIPLIERS[a!] ?? 2;
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
      await send(
        ch,
        [
          `**[ ${reels.join(" | ")} ]**`,
          resultLine,
          `💰 Payout: **${payout.toLocaleString()} sincoins** (${netStr})`,
          `Balance: **${user.balance.toLocaleString()} sincoins**`,
        ].join("\n"),
        token
      );
      break;
    }

    // ─── Duel ────────────────────────────────────────────────────────────────
    case "duel": {
      cleanExpiredDuels();
      const target = getMentionedUser(msg, args);
      const betArg = args.find((a) => /^\d+$/.test(a));
      const bet = betArg ? parseInt(betArg, 10) : 0;

      if (!target) { await send(ch, `Usage: \`${PREFIX}duel @user <bet>\``, token); break; }
      if (target.id === authorId) { await send(ch, "❌ You can't duel yourself.", token); break; }
      if (bet < 1) { await send(ch, `Usage: \`${PREFIX}duel @user <bet>\` — bet must be at least 1 sincoin.`, token); break; }

      const eco = loadEconomy();
      const challenger = getUser(eco, authorId);
      if (challenger.balance < bet) {
        await send(ch, `❌ You don't have enough sincoins. You have **${challenger.balance}** but tried to bet **${bet}**.`, token);
        break;
      }

      const duelKey = target.id;
      if (pendingDuels.has(duelKey) && pendingDuels.get(duelKey)!.targetId === authorId) {
        await send(ch, `⚔️ **${target.username}** already has a pending duel for you! Use \`${PREFIX}accept\` or \`${PREFIX}decline\`.`, token);
        break;
      }

      pendingDuels.set(authorId, {
        challengerId: authorId,
        challengerName: authorName,
        targetId: target.id,
        bet,
        channelId: ch,
        expiresAt: Date.now() + DUEL_EXPIRY_MS,
      });

      await send(
        ch,
        [
          `⚔️ **${authorName}** challenges **${target.username}** to a duel for **${bet} sincoins**!`,
          `<@${target.id}> — type \`${PREFIX}accept\` to fight or \`${PREFIX}decline\` to back down.`,
          `*(Challenge expires in 60 seconds)*`,
        ].join("\n"),
        token
      );
      break;
    }

    case "accept": {
      cleanExpiredDuels();
      const duel = [...pendingDuels.values()].find((d) => d.targetId === authorId && d.channelId === ch);
      if (!duel) { await send(ch, "❌ You have no pending duel challenge.", token); break; }

      const eco = loadEconomy();
      const challenger = getUser(eco, duel.challengerId);
      const target = getUser(eco, authorId);

      if (challenger.balance < duel.bet) {
        pendingDuels.delete(duel.challengerId);
        await send(ch, `❌ **${duel.challengerName}** no longer has enough sincoins for this duel. Challenge cancelled.`, token);
        break;
      }
      if (target.balance < duel.bet) {
        await send(ch, `❌ You don't have enough sincoins. You need **${duel.bet}** but only have **${target.balance}**.`, token);
        break;
      }

      pendingDuels.delete(duel.challengerId);

      const challengerRoll = rnd(1, 100);
      const targetRoll = rnd(1, 100);
      const tie = challengerRoll === targetRoll;

      let result: string;
      if (tie) {
        result = [
          `⚔️ **DUEL: ${duel.challengerName} vs ${authorName}** — Bet: **${duel.bet} sincoins**`,
          ``,
          `🎲 ${duel.challengerName} rolled: **${challengerRoll}**`,
          `🎲 ${authorName} rolled: **${targetRoll}**`,
          ``,
          `🤝 It's a **TIE**! No sincoins change hands.`,
        ].join("\n");
      } else {
        const challengerWon = challengerRoll > targetRoll;
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

        result = [
          `⚔️ **DUEL: ${duel.challengerName} vs ${authorName}** — Bet: **${duel.bet} sincoins**`,
          ``,
          `🎲 ${duel.challengerName} rolled: **${challengerRoll}**`,
          `🎲 ${authorName} rolled: **${targetRoll}**`,
          ``,
          `🏆 **${winnerName}** wins **${duel.bet} sincoins** from **${loserName}**!`,
          `💰 ${winnerName}: **${winner.balance.toLocaleString()} sincoins** | ${loserName}: **${loser.balance.toLocaleString()} sincoins**`,
        ].join("\n");
      }

      saveEconomy(eco);
      await send(ch, result, token);
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

    // ─── Economy ─────────────────────────────────────────────────────────────
    case "balance":
    case "bal": {
      const eco = loadEconomy();
      const targetId = resolveUserId(args, msg) ?? authorId;
      const targetUser = getUser(eco, targetId);
      const name = targetId === authorId ? "Your" : `<@${targetId}>'s`;
      await send(ch, `💰 ${name} balance: **${targetUser.balance.toLocaleString()} sincoins**`, token);
      break;
    }

    case "daily": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const now = Date.now();
      const elapsed = now - user.lastDaily;
      if (elapsed < DAILY_COOLDOWN_MS) {
        const remaining = DAILY_COOLDOWN_MS - elapsed;
        await send(ch, `⏳ Daily already claimed! Come back in **${formatDuration(remaining)}**.`, token);
        break;
      }
      const wasStreak = elapsed < DAILY_COOLDOWN_MS * 2;
      user.streak = wasStreak ? user.streak + 1 : 1;
      user.lastDaily = now;
      const base = 300;
      const streakBonus = Math.min(user.streak * 25, 500);
      const total = base + streakBonus;
      user.balance += total;
      const newAch = awardAchievement(user, "rich_1k");
      if (user.balance >= 10000) awardAchievement(user, "rich_10k");
      saveEconomy(eco);
      const streakMsg = user.streak > 1 ? ` 🔥 **${user.streak} day streak!** (+${streakBonus} bonus)` : "";
      let msg2 = `✅ Daily claimed! You got **${total} sincoins**.${streakMsg}\n💰 New balance: **${user.balance.toLocaleString()} sincoins**`;
      if (newAch) msg2 += `\n🏆 Achievement unlocked: **${ACHIEVEMENTS["rich_1k"]!.name}**!`;
      await send(ch, msg2, token);
      break;
    }

    case "work": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const now = Date.now();
      const remaining = WORK_COOLDOWN_MS - (now - user.workCooldown);
      if (remaining > 0) {
        await send(ch, `⏳ You already worked! Rest for **${formatDuration(remaining)}**.`, token);
        break;
      }
      const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)]!;
      const pay = rnd(job.minPay, job.maxPay);
      user.balance += pay;
      user.workCooldown = now;
      const totalWorks = (user.warnings.length ?? 0); // reuse field not ideal, track separately
      awardAchievement(user, "workaholic");
      saveEconomy(eco);
      nudgeEgo(user, { affection: 1 });
      await send(
        ch,
        [
          `💼 **${job.name}**`,
          job.description,
          `You earned **${pay} sincoins**! 💰`,
          `Balance: **${user.balance.toLocaleString()} sincoins**`,
        ].join("\n"),
        token
      );
      break;
    }

    case "pay":
    case "give": {
      if (isOwner(authorId) && name === "give") {
        const eco = loadEconomy();
        const target = getMentionedUser(msg, args);
        const amount = parseInt(args.find((a) => /^\d+$/.test(a)) ?? "0", 10);
        if (!target || amount <= 0) { await send(ch, `Usage: \`${PREFIX}give @user <amount>\``, token); break; }
        const targetUser = getUser(eco, target.id);
        targetUser.balance += amount;
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
      if (sender.balance < amount) { await send(ch, `❌ Insufficient funds. You have **${sender.balance} sincoins**.`, token); break; }
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

      if (sub === "wanted") {
        const wantedLevel = (n: number) => {
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
        const sorted = Object.entries(eco)
          .filter(([, u]) => (u.totalRobs ?? 0) > 0)
          .sort(([, a], [, b]) => (b.totalRobs ?? 0) - (a.totalRobs ?? 0))
          .slice(0, 10);
        if (sorted.length === 0) { await send(ch, "🚨 No criminals on record yet.", token); break; }
        const lines = sorted.map(([id, u], i) => {
          const total = u.totalRobs ?? 0;
          const wins  = u.totalRobsSuccessful ?? 0;
          const rate  = Math.round((wins / total) * 100);
          const lv    = wantedLevel(total);
          return `**${i + 1}.** <@${id}> — ${lv.emoji} **${lv.title}** *(${total} attempts, ${rate}% success)*`;
        });
        await send(ch, `🚨 **Most Wanted**\n${lines.join("\n")}`, token);
        break;
      }

      if (sub === "security" || sub === "sec") {
        const secEmoji = ["🔓", "🔒", "📹", "🐕", "💂", "🏰"];
        const sorted = Object.entries(eco)
          .filter(([, u]) => (u.security ?? 0) > 0)
          .sort(([, a], [, b]) => (b.security ?? 0) - (a.security ?? 0) || b.balance - a.balance)
          .slice(0, 10);
        if (sorted.length === 0) { await send(ch, "🛡️ Nobody has purchased any security yet.", token); break; }
        const lines = sorted.map(([id, u], i) => {
          const sec = u.security ?? 0;
          const tier = SECURITY_LEVELS[sec]!;
          return `**${i + 1}.** <@${id}> — ${secEmoji[sec]} **Lv.${sec} ${tier.name}**`;
        });
        await send(ch, `🛡️ **Top Security Levels**\n${lines.join("\n")}`, token);
        break;
      }

      const sorted = Object.entries(eco)
        .sort(([, a], [, b]) => b.balance - a.balance)
        .slice(0, 10);
      if (sorted.length === 0) { await send(ch, "No economy data yet.", token); break; }
      const lines = sorted.map(([id, u], i) => `**${i + 1}.** <@${id}> — **${u.balance.toLocaleString()} sincoins**`);
      await send(ch, `🏆 **Top Balances**\n${lines.join("\n")}`, token);
      break;
    }

    // ─── Fishing ─────────────────────────────────────────────────────────────
    case "fish": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const now = Date.now();
      const remaining = FISH_COOLDOWN_MS - (now - user.fishCooldown);
      if (remaining > 0) {
        await send(ch, `🎣 Cooldown! You can fish again in **${formatDuration(remaining)}**.`, token);
        break;
      }
      user.fishCooldown = now;
      const pool = getFishPool(user);
      const caught = weightedRandom(pool);
      user.fishInventory[caught.name] = (user.fishInventory[caught.name] ?? 0) + 1;
      user.totalFishCaught++;
      if (["rare", "epic", "legendary"].includes(caught.rarity)) user.totalRareCaught++;
      const newAchs: string[] = [];
      if (awardAchievement(user, "first_fish")) newAchs.push(ACHIEVEMENTS["first_fish"]!.name);
      if (["rare", "epic", "legendary"].includes(caught.rarity) && awardAchievement(user, "fish_master")) {
        newAchs.push(ACHIEVEMENTS["fish_master"]!.name);
      }
      if (caught.rarity === "legendary" && awardAchievement(user, "fish_legend")) {
        newAchs.push(ACHIEVEMENTS["fish_legend"]!.name);
      }
      saveEconomy(eco);
      let response = `🎣 You caught a **${caught.name}** ${rarityEmoji(caught.rarity)} *(${caught.rarity})* worth **${caught.price} sincoins**!`;
      if (newAchs.length > 0) response += `\n🏆 Achievement${newAchs.length > 1 ? "s" : ""} unlocked: **${newAchs.join(", ")}**!`;
      await send(ch, response, token);
      break;
    }

    case "inventory":
    case "inv": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const items = Object.entries(user.fishInventory).filter(([, q]) => q > 0);
      if (items.length === 0) { await send(ch, "🎣 Your fish inventory is empty. Try fishing!", token); break; }
      const lines = items.map(([name, qty]) => {
        const fish = FISH_ITEMS.find((f) => f.name === name);
        const emoji = fish ? rarityEmoji(fish.rarity) : "🐟";
        return `${emoji} **${name}** x${qty}`;
      });
      await send(ch, `🎣 **Your Fish Inventory**\n${lines.join("\n")}`, token);
      break;
    }

    case "sell": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const fishName = args.slice(0, -1).join(" ") || args.join(" ");
      const qtyArg = parseInt(args[args.length - 1] ?? "1", 10);
      const qty = isNaN(qtyArg) || qtyArg < 1 ? 1 : qtyArg;
      if (!fishName) { await send(ch, `Usage: \`${PREFIX}sell <fish name> [qty]\``, token); break; }
      const key = findInventoryKey(user.fishInventory, fishName.replace(/\s+\d+$/, "").trim());
      if (!key || !user.fishInventory[key]) { await send(ch, `❌ You don't have that fish.`, token); break; }
      const have = user.fishInventory[key]!;
      const sellQty = Math.min(qty, have);
      
      const fishDef = FISH_ITEMS.find((f) => f.name.toLowerCase() === key.toLowerCase());
      if (!fishDef) { await send(ch, "❌ Unknown fish.", token); break; }
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
      
      let total = 0;
      let count = 0;
      for (const [name, qty] of Object.entries(user.fishInventory)) {
        if (!qty || qty <= 0) continue;
        const fish = FISH_ITEMS.find((f) => f.name === name);
        if (!fish) continue;
        total += fish.price * qty;
        count += qty;
        user.totalFishSold += qty;
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
      
      const byRarity: Record<string, string[]> = {};
      for (const fish of FISH_ITEMS) {
        if (!byRarity[fish.rarity]) byRarity[fish.rarity] = [];
        byRarity[fish.rarity]!.push(`${fish.name} (${fish.price}💰)`);
      }
      const order = ["common", "uncommon", "rare", "epic", "legendary"];
      const lines = order.map((r) => `${rarityEmoji(r)} **${r.charAt(0).toUpperCase() + r.slice(1)}**: ${byRarity[r]?.join(", ") ?? "none"}`);
      await send(ch, `🐠 **Fish Dex**\n${lines.join("\n")}`, token);
      break;
    }

    // ─── Shop & Items ─────────────────────────────────────────────────────────
    case "shop": {
      const upgrades = Object.entries(SHOP_ITEMS).filter(([, i]) => i.type === "upgrade");
      const boxes = Object.entries(SHOP_ITEMS).filter(([, i]) => i.type === "lootbox").slice(0, 10);
      const uLines = upgrades.map(([k, i]) => `\`${k}\` — **${i.name}** — ${i.cost} sincoins — ${i.description}`);
      const bLines = boxes.map(([k, i]) => `\`${k}\` — **${i.name}** — ${i.cost} sincoins — ${i.description}`);
      await send(
        ch,
        [
          `**=== Sinbot Shop ===**`,
          `Use \`${PREFIX}buy <item>\` to purchase.`,
          "",
          "**Upgrades**",
          ...uLines,
          "",
          "**Lootboxes** *(showing first 10, more available)*",
          ...bLines,
        ].join("\n"),
        token
      );
      break;
    }

    case "buy": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const itemKey = args[0]?.toLowerCase();
      if (!itemKey) { await send(ch, `Usage: \`${PREFIX}buy <item>\``, token); break; }
      const item = SHOP_ITEMS[itemKey];
      if (!item) { await send(ch, `❌ Unknown item \`${itemKey}\`. Check \`${PREFIX}shop\`.`, token); break; }
      if (user.balance < item.cost) {
        await send(ch, `❌ Not enough sincoins. You need **${item.cost}** but have **${user.balance}**.`, token);
        break;
      }
      user.balance -= item.cost;
      if (item.type === "upgrade" && item.upgrade) {
        user.upgrades.fishLuck = (user.upgrades.fishLuck ?? 0) + item.upgrade.fishLuck;
        saveEconomy(eco);
        await send(ch, `✅ Purchased **${item.name}**! Fishing luck boosted by +${item.upgrade.fishLuck}.\n💰 Balance: **${user.balance.toLocaleString()} sincoins**`, token);
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
      if (!invKey || !user.itemInventory[invKey]) {
        await send(ch, `❌ You don't have a **${box.name}**. Buy one with \`${PREFIX}buy ${boxKey}\`.`, token);
        break;
      }
      user.itemInventory[invKey]!--;
      if (user.itemInventory[invKey] === 0) delete user.itemInventory[invKey];
      const item = openLootbox(boxKey);
      if (!item) { await send(ch, "❌ Error opening box.", token); break; }
      user.itemInventory[item.name] = (user.itemInventory[item.name] ?? 0) + 1;
      user.totalLootboxesOpened++;
      awardAchievement(user, "box_opener");
      if (Object.keys(user.itemInventory).length >= 5) awardAchievement(user, "collector");
      saveEconomy(eco);
      await send(
        ch,
        `📦 Opened **${box.name}**!\nYou got: ${rarityEmoji(item.rarity)} **${item.name}** *(${item.rarity})* worth **${item.price} sincoins**!`,
        token
      );
      break;
    }

    case "items": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const items = Object.entries(user.itemInventory).filter(([, q]) => q && q > 0);
      if (items.length === 0) { await send(ch, "📦 Your item inventory is empty.", token); break; }
      
      const lines = items.map(([name, qty]) => {
        const def = COLLECTIBLE_ITEMS.find((i) => i.name === name);
        const emoji = def ? rarityEmoji(def.rarity) : "📦";
        return `${emoji} **${name}** x${qty}`;
      });
      await send(ch, `📦 **Your Items**\n${lines.join("\n")}`, token);
      break;
    }

    case "sellitem": {
      const eco = loadEconomy();
      const user = getUser(eco, authorId);
      const qtyArg = parseInt(args[args.length - 1] ?? "1", 10);
      const qty = isNaN(qtyArg) ? 1 : Math.max(1, qtyArg);
      const itemNameRaw = isNaN(parseInt(args[args.length - 1] ?? "", 10))
        ? args.join(" ")
        : args.slice(0, -1).join(" ");
      if (!itemNameRaw) { await send(ch, `Usage: \`${PREFIX}sellitem <item> [qty]\``, token); break; }
      
      const key = findInventoryKey(user.itemInventory, itemNameRaw.trim());
      if (!key || !user.itemInventory[key]) { await send(ch, "❌ You don't have that item.", token); break; }
      const def = COLLECTIBLE_ITEMS.find((i) => i.name.toLowerCase() === key.toLowerCase());
      if (!def) { await send(ch, "❌ Unknown item.", token); break; }
      const have = user.itemInventory[key]!;
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

    // ─── Social ───────────────────────────────────────────────────────────────
    case "profile": {
      const eco = loadEconomy();
      const targetId = resolveUserId(args, msg) ?? authorId;
      const u = getUser(eco, targetId);
      const ego = getEgo(u);
      const fishCount = Object.values(u.fishInventory).reduce((a, b) => a + b, 0);
      const itemCount = Object.values(u.itemInventory).reduce((a, b) => a + b, 0);
      const lines = [
        `**Profile: <@${targetId}>**`,
        `💰 Balance: **${u.balance.toLocaleString()} sincoins**`,
        `🎣 Fish caught: **${u.totalFishCaught}** (rare: ${u.totalRareCaught})`,
        `📦 Lootboxes opened: **${u.totalLootboxesOpened}**`,
        `🐟 Fish in inventory: **${fishCount}**`,
        `🎁 Items in inventory: **${itemCount}**`,
        `🔥 Daily streak: **${u.streak}** day${u.streak !== 1 ? "s" : ""}`,
        `🏆 Achievements: **${u.achievements.length}/${Object.keys(ACHIEVEMENTS).length}**`,
        `🎣 Fishing luck: **+${u.upgrades.fishLuck}**`,
        "",
        `**Ego** — Trust: ${trustLabel(ego.trust)} | Affection: ${affectionLabel(ego.affection)} | Fear: ${fearLabel(ego.fear)} | Rivalry: ${rivalryLabel(ego.rivalry)}`,
      ];
      await send(ch, lines.join("\n"), token);
      break;
    }

    case "achievements":
    case "ach": {
      const eco = loadEconomy();
      const targetId = resolveUserId(args, msg) ?? authorId;
      const u = getUser(eco, targetId);
      const lines = getAchievementStatus(u);
      await send(ch, `🏆 **Achievements for <@${targetId}>**\n${lines.join("\n")}`, token);
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
      const targetUser = getUser(eco, target.id);
      const ego = getEgo(targetUser);
      const flavor = egoFlavorLine(target.username, ego);
      await send(
        ch,
        [
          `🧠 **Ego Report: ${target.username}**`,
          flavor,
          "",
          `Trust: **${ego.trust}/100** (${trustLabel(ego.trust)})`,
          `Affection: **${ego.affection}/100** (${affectionLabel(ego.affection)})`,
          `Fear: **${ego.fear}/100** (${fearLabel(ego.fear)})`,
          `Rivalry: **${ego.rivalry}/100** (${rivalryLabel(ego.rivalry)})`,
          `Interactions: **${ego.interactions}**`,
        ].join("\n"),
        token
      );
      break;
    }

    // ─── Moderation ───────────────────────────────────────────────────────────
    case "take": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      const amount = parseInt(args.find((a) => /^\d+$/.test(a)) ?? "0", 10);
      if (!target || amount <= 0) { await send(ch, `Usage: \`${PREFIX}take @user <amount>\``, token); break; }
      const targetUser = getUser(eco, target.id);
      targetUser.balance = Math.max(0, targetUser.balance - amount);
      saveEconomy(eco);
      await send(ch, `✅ Took **${amount} sincoins** from **${target.username}**. New balance: **${targetUser.balance}**.`, token);
      break;
    }

    case "setbalance":
    case "setbal": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      const amount = parseInt(args.find((a) => /^\d+$/.test(a)) ?? "0", 10);
      if (!target || isNaN(amount)) { await send(ch, `Usage: \`${PREFIX}setbalance @user <amount>\``, token); break; }
      const targetUser = getUser(eco, target.id);
      targetUser.balance = Math.max(0, amount);
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
      const targetUser = getUser(eco, target.id);
      targetUser.warnings.push(`${new Date().toISOString()}: ${reason}`);
      nudgeEgo(targetUser, { trust: -5, fear: 5 });
      saveEconomy(eco);
      await send(ch, `⚠️ **${target.username}** has been warned. Reason: ${reason}\nTotal warnings: **${targetUser.warnings.length}**`, token);
      break;
    }

    case "warnings": {
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}warnings @user\``, token); break; }
      const callerUser = getUser(eco, authorId);
      if (!isOwner(authorId) && !callerUser.whitelisted) { await send(ch, "❌ No permission.", token); break; }
      const targetUser = getUser(eco, target.id);
      if (targetUser.warnings.length === 0) { await send(ch, `**${target.username}** has no warnings.`, token); break; }
      const lines = targetUser.warnings.map((w, i) => `**${i + 1}.** ${w}`);
      await send(ch, `⚠️ **Warnings for ${target.username}:**\n${lines.join("\n")}`, token);
      break;
    }

    case "clearwarnings": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}clearwarnings @user\``, token); break; }
      const targetUser = getUser(eco, target.id);
      targetUser.warnings = [];
      saveEconomy(eco);
      await send(ch, `✅ Cleared all warnings for **${target.username}**.`, token);
      break;
    }

    case "blacklist": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}blacklist @user\``, token); break; }
      const targetUser = getUser(eco, target.id);
      targetUser.blacklisted = true;
      nudgeEgo(targetUser, { trust: -20, rivalry: 15 });
      saveEconomy(eco);
      await send(ch, `🚫 **${target.username}** has been blacklisted.`, token);
      break;
    }

    case "unblacklist": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}unblacklist @user\``, token); break; }
      const targetUser = getUser(eco, target.id);
      targetUser.blacklisted = false;
      saveEconomy(eco);
      await send(ch, `✅ **${target.username}** has been unblacklisted.`, token);
      break;
    }

    case "whitelist": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}whitelist @user\``, token); break; }
      const targetUser = getUser(eco, target.id);
      targetUser.whitelisted = true;
      nudgeEgo(targetUser, { trust: 10, affection: 5 });
      saveEconomy(eco);
      await send(ch, `✅ **${target.username}** has been whitelisted.`, token);
      break;
    }

    case "unwhitelist": {
      if (!isOwner(authorId)) { await send(ch, "❌ No permission.", token); break; }
      const eco = loadEconomy();
      const target = getMentionedUser(msg, args);
      if (!target) { await send(ch, `Usage: \`${PREFIX}unwhitelist @user\``, token); break; }
      const targetUser = getUser(eco, target.id);
      targetUser.whitelisted = false;
      saveEconomy(eco);
      await send(ch, `✅ Removed whitelist from **${target.username}**.`, token);
      break;
    }

    default: {
      await send(ch, `❓ Unknown command. Use \`${PREFIX}help\` for the command list.`, token);
      break;
    }
  }

  // Passive ego nudge on command use
  try {
    const eco = loadEconomy();
    const user = getUser(eco, authorId);
    nudgeEgo(user, { interactions: 1 } as never);
    saveEconomy(eco);
  } catch {}
}
