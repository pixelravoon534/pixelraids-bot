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

// ================= SMART PARSER =================

function parseHost(input) {
  if (!input) return "Unknown";
  const c = input.toLowerCase();

  if (c.includes("y")) return "Yes"; // y, yes, yass, yesss
  if (c.includes("n")) return "No";  // n, no, nope

  return input; // raw fallback
}

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
      content: "Click to start your raid survey",
      components: [row]
    });
  }
});

// ================= SURVEY FLOW =================

client.on(Events.InteractionCreate, async (interaction) => {

  if (!interaction.isButton()) return;

  const user = interaction.user;
  const channel = interaction.channel;

  // ================= START =================

  if (interaction.customId === "start_survey") {

    await interaction.reply({
      content: "Survey started!",
      ephemeral: true
    });

    // ================= HOST =================

    const hostRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("host_yes").setLabel("Yes").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("host_no").setLabel("No").setStyle(ButtonStyle.Secondary)
    );

    const hostMsg = await channel.send({
      content: `1. Do you want to be the Host? <@${user.id}>`,
      components: [hostRow]
    });

    const hostInteraction = await hostMsg.awaitMessageComponent({
      filter: i => i.user.id === user.id,
      time: 60000
    }).catch(() => null);

    if (!hostInteraction) return channel.send("Host question timed out.");

    const hostRaw = hostInteraction.customId === "host_yes" ? "Yes" : "No";
    const hostFinal = parseHost(hostRaw);

    await hostInteraction.update({
      content: `Host: ${hostRaw}`,
      components: []
    });

    // ================= PACKAGE =================

    const pkgRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("pkg_1").setLabel("1").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("pkg_2").setLabel("2").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("pkg_3").setLabel("3").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("pkg_u").setLabel("Unlimited").setStyle(ButtonStyle.Danger)
    );

    const pkgMsg = await channel.send({
      content: `2. Select your package <@${user.id}> (check #important-info)`,
      components: [pkgRow]
    });

    const pkgInteraction = await pkgMsg.awaitMessageComponent({
      filter: i => i.user.id === user.id,
      time: 60000
    }).catch(() => null);

    if (!pkgInteraction) return channel.send("Package timed out.");

    let packageRaw = "1";

    if (pkgInteraction.customId === "pkg_2") packageRaw = "2";
    if (pkgInteraction.customId === "pkg_3") packageRaw = "3";
    if (pkgInteraction.customId === "pkg_u") packageRaw = "Unlimited";

    await pkgInteraction.update({
      content: `Package: ${packageRaw}`,
      components: []
    });

    // ================= RAID TYPE =================

    await channel.send(`3. Select a raid <@${user.id}>`);

    const raidCollected = await channel.awaitMessages({
      filter: m => m.author.id === user.id,
      max: 1,
      time: 180000
    });

    const raidRaw = raidCollected.first()?.content || "Unknown";

    // ================= ROBLOX USERNAME =================

    await channel.send(`4. What is your Roblox Username? <@${user.id}>`);

    const robloxCollected = await channel.awaitMessages({
      filter: m => m.author.id === user.id,
      max: 1,
      time: 180000
    });

    const robloxRaw = robloxCollected.first()?.content || "Unknown";

    // ================= QUEUE =================

    queue.push({
      userId: user.id,

      hostRaw,
      host: hostFinal,

      packageRaw,
      raidRaw,
      robloxRaw
    });

    updateStats(interaction.guild);

    channel.send(`<@${user.id}> has been added to the queue.`);
  }
});

// ================= STATS =================

async function updateStats(guild) {

  const channel = guild.channels.cache.find(c => c.name === "queue-stats");
  if (!channel) return;

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
