const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= STATE =================

let queue = [];
let groups = [];
let activeRaid = null;
let statsMessageId = null;

// ================= READY =================

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ================= SURVEY =================
// SIMPLE TEXT SURVEY SYSTEM

async function ask(channel, user, text) {
  await channel.send(text);

  try {
    const collected = await channel.awaitMessages({
      filter: m => m.author.id === user.id,
      max: 1,
      time: 180000
    });

    return collected.first().content;
  } catch {
    channel.send("Survey timed out.");
    return null;
  }
}

// ================= SURVEY START =================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!survey") {

    const ch = message.channel;

    const q1 = await ask(ch, message.author,
`1. What is your username?`);

    if (!q1) return;

    const q2 = await ask(ch, message.author,
`2. Are you the host? (yes/no)`);

    if (!q2) return;

    const q3 = await ask(ch, message.author,
`3. What raid do you want?`);

    if (!q3) return;

    const q4 = await ask(ch, message.author,
`4. Package (1 / 2 / 3 / unlimited)`);

    if (!q4) return;

    const isHost = q2.toLowerCase() === "yes";

    queue.push({
      id: message.author.id,
      username: q1,
      isHost,
      raid: q3,
      package: q4
    });

    buildGroups();
    updateStats(message.guild);

    ch.send("Added to queue.");
  }
});

// ================= GROUP BUILDER =================

function buildGroups() {

  groups = [];

  let hosts = queue.filter(p => p.isHost);
  let members = queue.filter(p => !p.isHost);

  if (hosts.length === 0) return;

  while (hosts.length > 0) {

    let host = hosts.shift();
    let group = [host];

    for (let i = 0; i < members.length && group.length < 3; i++) {
      group.push(members[i]);
      members.splice(i, 1);
      i--;
    }

    groups.push(group);
  }

  queue = members;
}

// ================= STATS =================

async function updateStats(guild) {

  const channel = guild.channels.cache.find(c => c.name === "queue-stats");
  if (!channel) return;

  let text = "PIXELRAIDS STATS\n\n";

  for (let i = 0; i < 3; i++) {

    const g = groups[i];

    text += `GROUP ${i + 1}:\n`;

    if (!g) {
      text += "No group\n\n";
      continue;
    }

    const host = g.find(p => p.isHost);
    const members = g.filter(p => !p.isHost);

    text += `Host: ${host?.username || "none"}\n`;

    if (members.length === 0) {
      text += "Members: none\n\n";
    } else {
      text += "Members:\n";
      members.forEach(m => {
        text += `- ${m.username}\n`;
      });
      text += "\n";
    }
  }

  text += `Waiting: ${queue.length}`;

  if (!statsMessageId) {
    const msg = await channel.send(text);
    statsMessageId = msg.id;
  } else {
    const msg = await channel.messages.fetch(statsMessageId).catch(() => null);
    if (msg) msg.edit(text);
  }
}

// ================= BEGIN RAIDS =================

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;
  if (message.content !== "!beginraids") return;
  if (message.channel.name !== "admin-control") return;

  if (!groups[0]) {
    return message.channel.send("No groups available.");
  }

  activeRaid = groups.shift();

  const guild = message.guild;

  const raidChannel = await guild.channels.create({
    name: `raid-${Date.now()}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ]
  });

  let msg = "PIXELRAIDS RAID STARTED\n\n";

  activeRaid.forEach(p => {
    msg += `${p.username} | ${p.raid} | ${p.package} | ${p.isHost ? "Host" : "Member"}\n`;
  });

  raidChannel.send(msg);

  updateStats(guild);
});

// ================= RAID FINISH =================

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;
  if (message.content !== "!raidfinish") return;
  if (message.channel.name !== "admin-control") return;

  const logChannel = message.guild.channels.cache.find(c => c.name === "raid-logs");

  const time = new Date().toISOString();

  if (activeRaid && logChannel) {

    let log = "PIXELRAIDS RAID LOG\n\n";
    log += `TIME (UTC): ${time}\n\n`;

    activeRaid.forEach(p => {
      log += `${p.username} | ${p.raid} | ${p.package} | ${p.isHost ? "Host" : "Member"}\n`;
    });

    logChannel.send(log);
  }

  activeRaid = null;

  message.channel.send("Raid finished.");
});

// ================= LOGIN =================

client.login(process.env.TOKEN);
