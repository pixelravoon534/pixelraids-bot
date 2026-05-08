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

// ================= READY =================

client.once("clientReady", () => {
  console.log(`ONLINE: ${client.user.tag}`);
});

// ================= MESSAGE COMMANDS =================

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  // =================================================
  // !SURVEY
  // =================================================

  if (message.content === "!survey") {

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("start_survey")
        .setLabel("Start Survey")
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({
      content: "Click below to start your survey",
      components: [row]
    });

    return;
  }

  // =================================================
  // OWNER ONLY
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
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageChannels
          ]
        }
      ]
    });

    await raidChannel.send("Raid channel created.");

    await message.reply(`Raid created: ${raidChannel}`);

    return;
  }

  // =================================================
  // !ENDRAID
  // =================================================

  if (message.content === "!endraid") {

    if (message.channel.name !== ADMIN_CHANNEL_NAME) {
      return message.reply("Use this in admin-control.");
    }

    const raidChannels = message.guild.channels.cache.filter(
      c =>
        c.name.startsWith("raid-") &&
        c.name !== LOG_CHANNEL_NAME &&
        c.type === ChannelType.GuildText
    );

    const logChannel = message.guild.channels.cache.find(
      c => c.name === LOG_CHANNEL_NAME
    );

    for (const [, raidChannel] of raidChannels) {

      try {

        const fetched = await raidChannel.messages.fetch({
          limit: 100
        });

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

        // SEND LOG

        if (logChannel) {

          await logChannel.send(
            `A Raid has been completed by ${memberText}`
          ).catch(() => {});
        }

        // DELETE RAID CHANNEL

        await raidChannel.delete().catch(() => {});

      } catch (err) {

        console.log(err);
      }
    }

    await message.channel.send("All raid channels deleted.");

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

    const existing = guild.channels.cache.find(
      c => c.name === `survey-${user.username}`
    );

    if (existing) {

      return interaction.reply({
        content: `Here is your survey channel: ${existing}`,
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
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]
    });

    // SEND CHANNEL LINK

    await interaction.reply({
      content: `Here is your survey channel: ${surveyChannel}`,
      ephemeral: true
    });

    // =================================================
    // QUESTIONS
    // =================================================

    const ask = async (question) => {

      await surveyChannel.send(
        `<@${user.id}> ${question}`
      );

      const collected = await surveyChannel.awaitMessages({
        filter: m => m.author.id === user.id,
        max: 1,
        time: 180000
      });

      return collected.first()?.content || "Unknown";
    };

    const hostRaw =
      await ask("1. Do you want to be the Host?");

    const packageRaw =
      await ask("2. How many Raids? (Max 3 per survey)");

    const raidRaw =
      await ask("3. Which type of raid do you need?");

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

    await updateStats(guild);

    await surveyChannel.send(
      "Survey done. Wait to be pinged. Wrong info may remove your queue, but you can resubmit."
    );

    setTimeout(() => {
      surveyChannel.delete().catch(() => {});
    }, 5000);

    return;
  }

});

// ================= UPDATE STATS =================

async function updateStats(guild) {

  const channel = guild.channels.cache.find(
    c => c.name === QUEUE_CHANNEL_NAME
  );

  if (!channel) return;

  try {

    const oldMessages = await channel.messages.fetch({
      limit: 100
    });

    await channel.bulkDelete(oldMessages, true).catch(() => {});

    for (const entry of queue) {

      await channel.send(
`<@${entry.userId}> has submitted the survey

Host: ${entry.hostRaw}
Amount of Raids: ${entry.packageRaw}
Fruit Raid Type: ${entry.raidRaw}
Roblox Username: ${entry.robloxRaw}`
      );
    }

  } catch (err) {

    console.log("STATS ERROR:", err);
  }
}

// ================= LOGIN =================

client.login(process.env.TOKEN);
