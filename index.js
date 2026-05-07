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

// ================= !SURVEY =================

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  if (message.content === "!survey") {

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("survey_start")
        .setLabel("Start Survey")
        .setStyle(ButtonStyle.Primary)
    );

    message.channel.send({
      content: "Click to start your survey",
      components: [row]
    });
  }
});

// ================= STEP 1 BUTTON =================

client.on(Events.InteractionCreate, async (interaction) => {

  if (!interaction.isButton()) return;

  const user = interaction.user;
  const guild = interaction.guild;

  // ================= STEP 1: CLICK START =================

  if (interaction.customId === "survey_start") {

    const openRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("open_channel")
        .setLabel("Open Your Survey Channel")
        .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({
      content: "Here is your channel",
      components: [openRow],
      ephemeral: true
    });
  }

  // ================= STEP 2: CREATE CHANNEL =================

  if (interaction.customId === "open_channel") {

    const user = interaction.user;

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
      content: `Your channel: ${channel}`,
      ephemeral: true
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

    const hostRaw = await ask("1. Do you want to be the Host?");
    const packageRaw = await ask("2. Select your package (1 / 2 / 3 / Unlimited)");
    const raidRaw = await ask("3. Select a raid");
    const robloxRaw = await ask("4. Roblox Username");

    // ================= QUEUE =================

    queue.push({
      userId: user.id,
      hostRaw,
      packageRaw,
      raidRaw,
      robloxRaw
    });

    updateStats(guild);

    channel.send("Survey complete. You are in queue.");

    setTimeout(() => {
      channel.delete().catch(() => {});
    }, 5000);
  }
});

// ================= STATS (FIXED RELIABLE VERSION) =================

async function updateStats(guild) {

  const channel = guild.channels.cache.find(c => c.name === "queue-stats");

  if (!channel) {
    console.log("[STATS ERROR] queue-stats not found");
    return;
  }

  const bot = guild.members.me;

  if (!channel.permissionsFor(bot)?.has(["ViewChannel", "SendMessages"])) {
    console.log("[STATS ERROR] missing permissions");
    return;
  }

  let text = "QUEUE STATS\n\n";

  if (queue.length === 0) {
    text += "No players in queue\n";
  } else {

    for (const e of queue) {
      text += `<@${e.userId}> has submitted the survey\n`;
      text += `Host: ${e.hostRaw}\n`;
      text += `Package: ${e.packageRaw}\n`;
      text += `Raid: ${e.raidRaw}\n`;
      text += `Roblox Username: ${e.robloxRaw}\n\n`;
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
