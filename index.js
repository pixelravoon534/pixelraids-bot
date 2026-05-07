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

// temporary survey storage
let surveySessions = new Map();

// ================= READY =================

client.once("ready", () => {
  console.log(`ONLINE: ${client.user.tag}`);
});

// ================= PANEL =================

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
      content: "RAID PANEL",
      components: [row]
    });
  }

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
            PermissionsBitField.Flags.SendMessages
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

  if (message.content === "!raidfinish") {

    const logChannel = message.guild.channels.cache.find(c => c.name === "raid-logs");
    const time = new Date().toISOString();

    if (activeRaid && logChannel) {

      let log = "RAID LOG\n\n";
      log += `UTC TIME: ${time}\n\n`;

      activeRaid.forEach(p => {
        log += `${p.username} | ${p.raid} | ${p.package} | ${p.isHost ? "Host" : "Member"}\n`;
      });

      logChannel.send(log);
    }

    activeRaid = null;
    message.reply("Raid finished.");
  }
});

// ================= BUTTON SURVEY =================

client.on(Events.InteractionCreate, async (interaction) => {

  if (!interaction.isButton()) return;

  // START SURVEY
  if (interaction.customId === "start_survey") {

    const userId = interaction.user.id;

    surveySessions.set(userId, { step: 1 });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("host_yes")
        .setLabel("Host")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("host_no")
        .setLabel("Member")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: "1. Are you the host?",
      components: [row],
      ephemeral: true
    });
  }

  // HOST CHOICE
  if (interaction.customId === "host_yes" || interaction.customId === "host_no") {

    const session = surveySessions.get(interaction.user.id);
    if (!session) return;

    session.isHost = interaction.customId === "host_yes";

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("pkg_1").setLabel("1").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("pkg_2").setLabel("2").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("pkg_3").setLabel("3").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("pkg_u").setLabel("Unlimited").setStyle(ButtonStyle.Danger)
    );

    await interaction.update({
      content: "2. Select package:",
      components: [row]
    });
  }

  // PACKAGE CHOICE
  if (interaction.customId.startsWith("pkg_")) {

    const session = surveySessions.get(interaction.user.id);
    if (!session) return;

    const map = {
      pkg_1: "1",
      pkg_2: "2",
      pkg_3: "3",
      pkg_u: "unlimited"
    };

    session.package = map[interaction.customId];

    const channel = interaction.channel;

    await interaction.update({
      content: "3. Send your username in chat",
      components: []
    });

    const collected = await channel.awaitMessages({
      filter: m => m.author.id === interaction.user.id,
      max: 1,
      time: 180000
    });

    const username = collected.first()?.content;

    session.username = username;
    session.raid = "default";

    queue.push({
      id: interaction.user.id,
      username,
      isHost: session.isHost,
      raid: session.raid,
      package: session.package
    });

    surveySessions.delete(interaction.user.id);

    buildGroups();
    updateStats(interaction.guild);

    channel.send(`${username} added to queue.`);
  }
});

// ================= GROUP SYSTEM =================

function buildGroups() {

  groups = [];

  let hosts = queue.filter(p => p.isHost);
  let members = queue.filter(p => !p.isHost);

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

    members.forEach(m => {
      text += `- ${m.username}\n`;
    });

    text += "\n";
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
