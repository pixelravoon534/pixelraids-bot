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

// ================= MESSAGE COMMANDS =================

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  // =================================================
  // !SURVEY (ANYONE CAN USE)
  // =================================================

  if (message.content.trim() === "!survey") {

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("start_survey")
        .setLabel("Start Survey")
        .setStyle(ButtonStyle.Primary)
    );

    return message.channel.send({
      content: "Click below to start your survey",
      components: [row]
    });
  }

  // =================================================
  // ONLY YOU CAN USE BELOW COMMANDS
  // =================================================

  if (message.author.id !== OWNER_ID) return;

  // =================================================
  // !STARTRAID
  // =================================================

  if (message.content === "!startraid") {

    if (message.channel.name !== ADMIN_CHANNEL_NAME) {
      return message.reply("Use this in admin-control.");
    }

    const raidChannel = await message.guild.channels.create({
      name: `raid-${Date.now()}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: message.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },

        // YOU
        {
          id: OWNER_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },

        // BOT
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

    await raidChannel.send("Raid channel created.");

    return message.reply(`Raid created: ${raidChannel}`);
  }

  // =================================================
  // !ENDRAIDS
  // =================================================

  if (message.content === "!endraids") {

    if (!message.channel.name.startsWith("raid-")) {
      return;
    }

    const logChannel = message.guild.channels.cache.find(
      c => c.name === LOG_CHANNEL_NAME
    );

    if (logChannel) {

      const fetched = await message.channel.messages.fetch({ limit: 100 });

      const mentions = fetched
        .map(m => m.mentions.users)
        .flatMap(u => [...u.values()])
        .filter(u =>
          u.id !== OWNER_ID &&
          !u.bot
        );

      const unique = [...new Map(
        mentions.map(u => [u.id, u])
      ).values()];

      let memberText = "No members";

      if (unique.length > 0) {
        memberText = unique
          .map(u => `<@${u.id}>`)
          .join(" ");
      }

      await logChannel.send(
        `A Raid has been completed by ${memberText}`
      );
    }

    await message.channel.send("Ending raids...");

    setTimeout(() => {
      message.channel.delete().catch(() => {});
    }, 3000);

    return;
  }
});

// ================= BUTTONS =================

client.on(Events.InteractionCreate, async (interaction) => {

  if (!interaction.isButton()) return;

  const user = interaction.user;
  const guild = interaction.guild;

  // =================================================
  // START SURVEY BUTTON
  // =================================================

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

  // =================================================
  // CREATE PRIVATE SURVEY CHANNEL
  // =================================================

  if (interaction.customId === "open_survey_channel") {

    const existing = guild.channels.cache.find(
      c => c.name === `survey-${user.username}`
    );

    if (existing) {
      return interaction.reply({
        content: `You already have a survey channel: ${existing}`,
        ephemeral: true
      });
    }

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
      content: `Your survey channel: ${surveyChannel}`,
      ephemeral: true
    });

    // =================================================
    // QUESTIONS
    // =================================================

    const ask = async (text) => {

      await surveyChannel.send(
        `<@${user.id}> ${text}`
      );

      const collected =
        await surveyChannel.awaitMessages({
          filter: m => m.author.id === user.id,
          max: 1,
          time: 180000
        });

      return collected.first()?.content || "Unknown";
    };

    const hostRaw =
      await ask("1. Do you want to be the Host?");

    const packageRaw =
      await ask("2. Select your package (check important-info)");

    const raidRaw =
      await ask("3. Select a raid");

    const robloxRaw =
      await ask("4. What is your Roblox Username?");

    // =================================================
    // ADD TO QUEUE
    // =================================================

    queue.push({
      userId: user.id,
      hostRaw,
      packageRaw,
      raidRaw,
      robloxRaw
    });

    console.log("NEW QUEUE ENTRY:", queue[queue.length - 1]);

    updateStats(guild);

    await surveyChannel.send(
      "Survey completed. You are now in queue."
    );

    setTimeout(() => {
      surveyChannel.delete().catch(() => {});
    }, 5000);
  }
});

// ================= UPDATE STATS =================

async function updateStats(guild) {

  console.log("updateStats CALLED");

  const channel = guild.channels.cache.find(
    c => c.name === QUEUE_CHANNEL_NAME
  );

  console.log("queue channel:", channel?.name);

  if (!channel) {
    console.log("QUEUE CHANNEL NOT FOUND");
    return;
  }

  let text = "QUEUE STATUS\n\n";

  if (queue.length === 0) {

    text += "No players in queue";

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

      console.log("STATS MESSAGE CREATED");

    } else {

      const msg =
        await channel.messages
          .fetch(statsMessageId)
          .catch(() => null);

      if (!msg) {

        const newMsg =
          await channel.send(text);

        statsMessageId = newMsg.id;

      } else {

        await msg.edit(text);
      }
    }

  } catch (err) {

    console.log("STATS ERROR:", err);
  }
}

// ================= LOGIN =================

client.login(process.env.TOKEN);  // START SURVEY BUTTON
  // =================================================

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

  // =================================================
  // CREATE PRIVATE SURVEY CHANNEL
  // =================================================

  if (interaction.customId === "open_survey_channel") {

    const existing = guild.channels.cache.find(
      c => c.name === `survey-${user.username}`
    );

    if (existing) {
      return interaction.reply({
        content: `You already have a survey channel: ${existing}`,
        ephemeral: true
      });
    }

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
      content: `Your survey channel: ${surveyChannel}`,
      ephemeral: true
    });

    // =================================================
    // QUESTIONS
    // =================================================

    const ask = async (text) => {

      await surveyChannel.send(
        `<@${user.id}> ${text}`
      );

      const collected =
        await surveyChannel.awaitMessages({
          filter: m => m.author.id === user.id,
          max: 1,
          time: 180000
        });

      return collected.first()?.content || "Unknown";
    };

    const hostRaw =
      await ask("1. Will you Host the Raid?");

    const packageRaw =
      await ask("2. How many Raids? 1 / 2 / 3");

    const raidRaw =
      await ask("3. What raid do you need");

    const robloxRaw =
      await ask("4. What is your Roblox Username?");

    // =================================================
    // ADD TO QUEUE
    // =================================================

    queue.push({
      userId: user.id,
      hostRaw,
      packageRaw,
      raidRaw,
      robloxRaw
    });

    console.log("NEW QUEUE ENTRY:", queue[queue.length - 1]);

    updateStats(guild);

    await surveyChannel.send(
      "Survey completed. You are now in queue."
    );

    setTimeout(() => {
      surveyChannel.delete().catch(() => {});
    }, 5000);
  }
});

// ================= UPDATE STATS =================

async function updateStats(guild) {

  console.log("updateStats CALLED");

  const channel = guild.channels.cache.find(
    c => c.name === QUEUE_CHANNEL_NAME
  );

  console.log("queue channel:", channel?.name);

  if (!channel) {
    console.log("QUEUE CHANNEL NOT FOUND");
    return;
  }

  let text = "QUEUE STATUS\n\n";

  if (queue.length === 0) {

    text += "No players in queue";

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

      console.log("STATS MESSAGE CREATED");

    } else {

      const msg =
        await channel.messages
          .fetch(statsMessageId)
          .catch(() => null);

      if (!msg) {

        const newMsg =
          await channel.send(text);

        statsMessageId = newMsg.id;

      } else {

        await msg.edit(text);
      }
    }

  } catch (err) {

    console.log("STATS ERROR:", err);
  }
}

// ================= REFRESH STATS =================

function continueQueueStats(guild) {
  updateStats(guild);
}

// ================= LOGIN =================

client.login(process.env.TOKEN);
