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

  if (message.content.trim() === "!survey") {

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("start_survey")
        .setLabel("Start Survey")
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({
      content: "Click to start your survey",
      components: [row]
    });
  }
});

// ================= BUTTON FLOW =================

client.on(Events.InteractionCreate, async (interaction) => {

  if (!interaction.isButton()) return;

  const user = interaction.user;
  const guild = interaction.guild;

  // ================= STEP 1 =================

  if (interaction.customId === "start_survey") {

    const channelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("create_channel")
        .setLabel("Open Survey Channel")
        .setStyle(ButtonStyle.Success)
    );

    return interaction.reply({
      content: "Here is your channel",
      components: [channelRow],
      ephemeral: true
    });
  }

  // ================= STEP 2 =================

  if (interaction.customId === "create_channel") {

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
      content: `Your survey channel: ${channel}`,
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
    const robloxRaw = await ask("4. What is your Roblox Username?");

    // ================= QUEUE =================

    queue.push({
      userId: user.id,
      hostRaw,
      packageRaw,
      raidRaw,
      robloxRaw
    });

    console.log("📥 NEW QUEUE ENTRY:", queue[queue.length - 1]);

    updateStats(guild);

    await channel.send("Survey complete. You are in the queue.");

    setTimeout(() => {
      channel.delete().catch(() => {});
    }, 5000);
  }
});

// ================= STATS (FULL DEBUG VERSION) =================

async function updateStats(guild) {

  console.log("🔥 updateStats CALLED");

  const channel = guild.channels.cache.find(c => c.name === "queue-stats");

  console.log("📌 queue-stats channel:", channel?.name);

  if (!channel) {
    console.log("❌ queue-stats NOT FOUND");
    return;
  }

  const bot = guild.members.me;

  if (!channel.permissionsFor(bot)?.has([
    "ViewChannel",
    "SendMessages",
    "ReadMessageHistory"
  ])) {
    console.log("❌ BOT MISSING PERMISSIONS IN queue-stats");
    return;
  }

  console.log("📊 queue length:", queue.length);

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

    console.log("📤 sending/editing stats...");

    if (!statsMessageId) {
      const msg = await channel.send(text);
      statsMessageId = msg.id;
      console.log("✅ stats message created");
    } else {
      const msg = await channel.messages.fetch(statsMessageId).catch(() => null);

      if (!msg) {
        const newMsg = await channel.send(text);
        statsMessageId = newMsg.id;
        console.log("♻ stats recreated");
      } else {
        await msg.edit(text);
        console.log("✏ stats updated");
      }
    }

  } catch (err) {
    console.log("💥 STATS ERROR:", err);
  }
}

// ================= LOGIN =================

client.login(process.env.TOKEN);
