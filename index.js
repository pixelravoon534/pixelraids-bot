const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events
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

// ================= PANEL COMMAND =================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!panel") {

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("start_survey")
        .setLabel("Start Survey")
        .setStyle(ButtonStyle.Primary)
    );

    message.channel.send({
      content: "Raid System Panel",
      components: [row]
    });
  }

  // BEGIN RAIDS
  if (message.content === "!beginraids") {
    if (!groups[0]) return message.reply("No groups available.");

    activeRaid = groups.shift();

    const raidChannel = await message.guild.channels.create({
      name: `raid-${Date.now()}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: message.guild.id,
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

    let text = "RAID STARTED\n\n";

    activeRaid.forEach(p => {
      text += `${p.username} | ${p.raid} | ${p.package} | ${p.isHost ? "Host" : "Member"}\n`;
    });

    raidChannel.send(text);

    updateStats(message.guild);
  }

  // RAID FINISH
  if (message.content === "!raidfinish") {

    const logChannel = message.guild.channels.cache.find(c => c.name === "raid-logs");

    const time = new Date().toISOString();

    if (activeRaid && logChannel) {

      let log = "RAID LOG\n\n";
      log += `TIME (UTC): ${time}\n\n`;

      activeRaid.forEach(p => {
        log += `${p.username} | ${p.raid} | ${p.package} | ${p.isHost ? "Host" : "Member"}\n`;
      });

      logChannel.send(log);
    }

    activeRaid = null;
    message.reply("Raid finished.");
  }
});

// ================= BUTTON HANDLER =================

client.on(Events.InteractionCreate, async (interaction) => {

  if (!interaction.isButton()) return;

  if (interaction.customId === "start_survey") {

    await interaction.reply({
      content: "Survey started in this channel.",
      ephemeral: true
    });

    const user = interaction.user;
    const channel = interaction.channel;

    const ask = async (text) => {
      await channel.send(`1. ${text}`);

      const collected = await channel.awaitMessages({
        filter: m => m.author.id === user.id,
        max: 1,
        time: 180000
      });

      return collected.first()?.content;
    };

    const q1 = await ask("What is your username?");
    const q2 = await ask("Are you the host? (yes/no)");
    const q3 = await ask("What raid do you want?");
    const q4 = await ask("Package (1 / 2 / 3 / unlimited)");

    const isHost = q2?.toLowerCase() === "yes";

    queue.push({
      id: user.id,
      username: q1,
      isHost,
      raid: q3,
      package: q4
    });

    buildGroups();
    updateStats(interaction.guild);

    channel.send(`${user.username} added to queue.`);
  }
});

// ================= GROUP SYSTEM =================

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

  let text = "RAID STATS\n\n";

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

// ================= LOGIN =================

client.login(process.env.TOKEN);
