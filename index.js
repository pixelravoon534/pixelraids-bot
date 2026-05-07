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

// ================= SURVEY ADD (SIMPLE ENTRY POINT) =================
// You can replace this later with your button/survey system

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith("!join")) {
    const args = message.content.split(" ");

    const username = args[1] || message.author.username;
    const raid = args[2] || "Unknown";
    const pack = args[3] || "1";

    queue.push({
      id: message.author.id,
      username,
      raid,
      package: pack,
      isHost: false
    });

    buildGroups();
    updateStats(message.guild);

    message.reply("Added to queue.");
  }
});

// ================= GROUP BUILDER =================

function buildGroups() {
  groups = [];

  let copy = [...queue];

  while (copy.length > 0) {
    const host = copy.shift();

    let group = [host];

    // fill up to 3 players max
    for (let i = 0; i < copy.length && group.length < 3; i++) {
      group.push(copy[i]);
      copy.splice(i, 1);
      i--;
    }

    groups.push(group);
  }
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

    const host = g[0];

    text += `Host: ${host?.username || "none"}\n`;

    const members = g.slice(1);

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

// ================= START RAID =================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content !== "!beginraids") return;
  if (message.channel.name !== "admin-control") return;

  if (!groups[0]) return message.reply("No groups ready.");

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
          PermissionsBitField.Flags.SendMessages
        ]
      }
    ]
  });

  let info = "PIXELRAIDS RAID STARTED\n\n";

  activeRaid.forEach(p => {
    info += `${p.username} | ${p.raid} | ${p.package}\n`;
  });

  raidChannel.send(info);

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
      log += `${p.username} | ${p.raid} | ${p.package}\n`;
    });

    logChannel.send(log);
  }

  activeRaid = null;
  message.reply("Raid finished.");
});

// ================= LOGIN =================

client.login(process.env.TOKEN);
