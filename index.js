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

// ================= CONFIG =================

const OWNER_ID = "1471335626522624151";

const ADMIN_CHANNEL_NAME = "admin-control";
const QUEUE_CHANNEL_NAME = "queue-status";
const LOG_CHANNEL_NAME = "raid-logs";

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
        .setCustomId("start_survey")
        .setLabel("Start Survey")
        .setStyle(ButtonStyle.Primary)
    );

    return message.channel.send({
      content: "Click to start survey",
      components: [row]
    });
  }

  // ================= OWNER ONLY =================

  if (message.author.id !== OWNER_ID) return;

  // ================= !STARTRAID =================

  if (message.content === "!startraid") {

    if (message.channel.name !== ADMIN_CHANNEL_NAME) {
      return message.reply("Use admin-control channel.");
    }

    const raidChannel = await message.guild.channels.create({
      name: `raid-${Date.now()}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: message.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: OWNER_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageChannels
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

    await raidChannel.send("Raid started.");

    return message.reply(`Raid created: ${raidChannel}`);
  }

  // ================= !ENDRAIDS (FIXED + DEBUG) =================

  if (message.content === "!endraids") {

    console.log("🔥 ENDRAIDS TRIGGERED");

    if (!message.channel.name.startsWith("raid-")) {
      console.log("❌ Not raid channel");
      return message.reply("Use this inside a raid channel.");
    }

    const logChannel = message.guild.channels.cache.find(
      c => c.name === LOG_CHANNEL_NAME
    );

    console.log("📌 Log channel:", logChannel?.name);

    try {

      const fetched = await message.channel.messages.fetch({ limit: 100 });

      const mentions = fetched
        .map(m => m.mentions.users)
        .flatMap(u => [...u.values()])
        .filter(u => u.id !== OWNER_ID && !u.bot);

      const unique = [...new Map(
        mentions.map(u => [u.id, u])
      ).values()];

      let memberText = "No members";

      if (unique.length > 0) {
        memberText = unique.map(u => `<@${u.id}>`).join(" ");
      }

      if (logChannel) {
        await logChannel.send(
          `A Raid has been completed by ${memberText}`
        );
      } else {
        console.log("❌ raid-logs not found");
      }

      console.log("🧨 Deleting raid channel...");

      await message.channel.send("Ending raid...");

      setTimeout(async () => {
        try {
          await message.channel.delete();
          console.log("✅ Raid channel deleted");
        } catch (err) {
          console.log("❌ Delete failed:", err);
        }
      }, 3000);

    } catch (err) {
      console.log("💥 ENDRAIDS ERROR:", err);
    }

    return;
  }
});

// ================= BUTTONS =================

client.on(Events.InteractionCreate, async (interaction) => {

  if (!interaction.isButton()) return;

  const user = interaction.user;
  const guild = interaction.guild;

  if (interaction.customId === "start_survey") {

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("open_survey_channel")
        .setLabel("Open Survey Channel")
        .setStyle(ButtonStyle.Success)
    );

    return interaction.reply({
      content: "Here is your channel",
      components: [row],
      ephemeral: true
    });
  }

  if (interaction.customId === "open_survey_channel") {

    const surveyChannel = await guild.channels.create({
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
      content: `Your channel: ${surveyChannel}`,
      ephemeral: true
    });

    const ask = async (q) => {

      await surveyChannel.send(`<@${user.id}> ${q}`);

      const collected = await surveyChannel.awaitMessages({
        filter: m => m.author.id === user.id,
        max: 1,
        time: 180000
      });

      return collected.first()?.content || "Unknown";
    };

    const hostRaw = await ask("1. Host?");
    const packageRaw = await ask("2. Package?");
    const raidRaw = await ask("3. Raid?");
    const robloxRaw = await ask("4. Roblox username?");

    queue.push({
      userId: user.id,
      hostRaw,
      packageRaw,
      raidRaw,
      robloxRaw
    });

    updateStats(guild);

    await surveyChannel.send("Survey complete.");

    setTimeout(() => {
      surveyChannel.delete().catch(() => {});
    }, 5000);
  }
});

// ================= STATS =================

async function updateStats(guild) {

  const channel = guild.channels.cache.find(
    c => c.name === QUEUE_CHANNEL_NAME
  );

  if (!channel) return;

  let text = "QUEUE STATUS\n\n";

  if (queue.length === 0) {
    text += "No players";
  } else {
    for (const e of queue) {
      text += `<@${e.userId}>\n`;
      text += `Host: ${e.hostRaw}\n`;
      text += `Amount of Raoi: ${e.packageRaw}\n`;
      text += `Raid: ${e.raidRaw}\n`;
      text += `Roblox: ${e.robloxRaw}\n\n`;
    }
  }

  text += `Total: ${queue.length}`;

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
}

// ================= LOGIN =================

client.login(process.env.TOKEN);
