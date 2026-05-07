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
let statsMessageId = null;

// ================= READY =================

client.once("ready", () => {
  console.log(`ONLINE: ${client.user.tag}`);
});

// ================= !SURVEY (BUTTON IN ORIGINAL CHAT) =================

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  if (message.content === "!survey") {

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("start_survey")
        .setLabel("Start Survey")
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({
      content: "Click to start your raid survey",
      components: [row]
    });
  }
});

// ================= BUTTON -> CREATE PRIVATE CHANNEL =================

client.on(Events.InteractionCreate, async (interaction) => {

  if (!interaction.isButton()) return;

  if (interaction.customId !== "start_survey") return;

  const user = interaction.user;
  const guild = interaction.guild;

  await interaction.reply({
    content: "Creating your private survey channel...",
    ephemeral: true
  });

  // ================= CREATE PRIVATE CHANNEL =================

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
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ManageChannels
        ]
      }
    ]
  });

  // ================= SURVEY =================

  const ask = async (text) => {
    await channel.send(text);

    const collected = await channel.awaitMessages({
      filter: m => m.author.id === user.id,
      max: 1,
      time: 180000
    });

    return collected.first()?.content || "Unknown";
  };

  const hostRaw = await ask("1. Do you want to be the Host? (Yes / No / YASSS etc)");
  const packageRaw = await ask("2. Select your package (1 / 2 / 3 / Unlimited)");
  const raidRaw = await ask("3. Select a raid");
  const robloxRaw = await ask("4. What is your Roblox Username?");

  // ================= QUEUE =================

  queue.push({
    userId: user.id,
    hostRaw,
    packageRaw,
    raidRaw,
    robloxRaw
  });

  updateStats(guild);

  await channel.send("Survey complete. You are added to the queue.");

  setTimeout(() => {
    channel.delete().catch(() => {});
  }, 5000);
});

// ================= STATS (FIXED + BULLETPROOF) =================

async function updateStats(guild) {

  const channel = guild.channels.cache.find(c => c.name === "queue-stats");

  if (!channel) {
    console.log("[STATS ERROR] queue-stats channel NOT FOUND");
    return;
  }

  const botMember = guild.members.me;

  if (!channel.permissionsFor(botMember)?.has([
    "ViewChannel",
    "SendMessages",
    "ReadMessageHistory"
  ])) {
    console.log("[STATS ERROR] missing permissions in queue-stats");
    return;
  }

  let text = "QUEUE STATS\n\n";

  if (queue.length === 0) {
    text += "No players in queue\n";
  } else {

    for (const entry of queue) {

      text += `<@${entry.userId}> has submitted the survey\n`;
      text += `Host: ${entry.hostRaw}\n`;
      text += `Package: ${entry.packageRaw}\n`;
      text += `Raid: ${entry.raidRaw}\n`;
      text += `Roblox Username: ${entry.robloxRaw}\n\n`;
    }
  }

  text += `Total in queue: ${queue.length}`;

  try {

    if (!statsMessageId) {
      const msg = await channel.send(text);
      statsMessageId = msg.id;
    } else {
      const msg = await channel.messages.fetch(statsMessageId).catch(() => null);

      if (!msg) {
        const newMsg = await channel.send(text);
        statsMessageId = newMsg.id;
      } else {
        await msg.edit(text);
      }
    }

  } catch (err) {
    console.log("[STATS ERROR]", err);
  }
}

// ================= LOGIN =================

client.login(process.env.TOKEN);
