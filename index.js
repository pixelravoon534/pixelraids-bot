const {
  Client,
  GatewayIntentBits,
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
        .setCustomId("start_survey")
        .setLabel("Start Survey")
        .setStyle(ButtonStyle.Primary)
    );

    message.channel.send({
      content: "Click to start your raid survey",
      components: [row]
    });
  }
});

// ================= SURVEY FLOW =================

client.on(Events.InteractionCreate, async (interaction) => {

  if (!interaction.isButton()) return;

  if (interaction.customId === "start_survey") {

    const user = interaction.user;
    const channel = interaction.channel;

    // ================= HOST =================

    const hostRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("host_yes")
        .setLabel("Host")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("host_no")
        .setLabel("Member")
        .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({
      content: `1. Are you the host? <@${user.id}>`,
      components: [hostRow]
    });

    const host = await new Promise(resolve => {
      client.once("interactionCreate", i => {
        if (i.user.id === user.id) {
          if (i.customId === "host_yes") resolve(true);
          if (i.customId === "host_no") resolve(false);
        }
      });
    });

    // ================= PACKAGE =================

    const pkgRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("pkg_1").setLabel("1").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("pkg_2").setLabel("2").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("pkg_3").setLabel("3").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("pkg_u").setLabel("Unlimited").setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      content: `2. Select package <@${user.id}>`,
      components: [pkgRow]
    });

    const packageChoice = await new Promise(resolve => {
      client.once("interactionCreate", i => {
        if (i.user.id === user.id) {
          if (i.customId === "pkg_1") resolve("1");
          if (i.customId === "pkg_2") resolve("2");
          if (i.customId === "pkg_3") resolve("3");
          if (i.customId === "pkg_u") resolve("Unlimited");
        }
      });
    });

    // ================= RAID TYPE =================

    await channel.send(`3. Type your raid (example: Ice, Fire) <@${user.id}>`);

    const collected = await channel.awaitMessages({
      filter: m => m.author.id === user.id,
      max: 1,
      time: 180000
    });

    const raid = collected.first()?.content || "Unknown";

    // ================= ADD TO QUEUE =================

    queue.push({
      userId: user.id,
      username: user.username,
      host,
      package: packageChoice,
      raid
    });

    updateStats(interaction.guild);

    channel.send(`<@${user.id}> added to queue.`);
  }
});

// ================= STATS SYSTEM =================

async function updateStats(guild) {

  const channel = guild.channels.cache.find(c => c.name === "queue-stats");
  if (!channel) return;

  let text = "QUEUE STATS\n\n";

  if (queue.length === 0) {
    text += "No players in queue\n";
  } else {

    for (const entry of queue) {

      text += `<@${entry.userId}> has submitted the survey\n`;
      text += `Host: ${entry.host ? "Yes" : "No"}\n`;
      text += `Package: ${entry.package}\n`;
      text += `Raid: ${entry.raid}\n\n`;
    }
  }

  text += `Total in queue: ${queue.length}`;

  try {

    if (!statsMessageId) {
      const msg = await channel.send(text);
      statsMessageId = msg.id;
    } else {
      const msg = await channel.messages.fetch(statsMessageId);
      await msg.edit(text);
    }

  } catch (err) {
    console.log("[STATS ERROR]", err);
  }
}

// ================= LOGIN =================

client.login(process.env.TOKEN);
