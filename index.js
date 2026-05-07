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
let statsMessageId = null;

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
});

// ================= BUTTON =================

client.on(Events.InteractionCreate, async (interaction) => {

  if (!interaction.isButton()) return;

  if (interaction.customId === "start_survey") {

    const guild = interaction.guild;
    const user = interaction.user;

    // CREATE PRIVATE CHANNEL
    const channel = await guild.channels.create({
      name: `survey-${user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
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

    await interaction.reply({
      content: `Survey created: ${channel}`,
      ephemeral: true
    });

    // SURVEY FLOW
    const ask = async (text) => {
      await channel.send(text);

      const collected = await channel.awaitMessages({
        filter: m => m.author.id === user.id,
        max: 1,
        time: 180000
      });

      return collected.first()?.content;
    };

    const username = await ask("1. What is your username?");
    const hostAns = await ask("2. Are you the host? (yes/no)");
    const raid = await ask("3. What raid do you want?");
    const pack = await ask("4. Package (1 / 2 / 3 / unlimited)");

    const isHost = hostAns?.toLowerCase().includes("y");

    queue.push({
      id: user.id,
      username,
      isHost,
      raid,
      package: pack
    });

    buildGroups();
    updateStats(guild);

    await channel.send("Survey complete. You have been added to the queue.");

    // DELETE AFTER 5 SECONDS
    setTimeout(() => {
      channel.delete().catch(() => {});
    }, 5000);
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
