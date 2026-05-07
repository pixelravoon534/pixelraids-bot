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

// ================= !SURVEY COMMAND =================

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  if (message.content === "!survey") {

    const guild = message.guild;
    const user = message.author;

    // CREATE PRIVATE SURVEY CHANNEL
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

    channel.send(`Welcome ${user.username}, starting your survey...`);

    // ================= SURVEY =================

    const ask = async (text) => {
      await channel.send(text);

      const collected = await channel.awaitMessages({
        filter: m => m.author.id === user.id,
        max: 1,
        time: 180000
      });

      return collected.first()?.content;
    };

    const username = await ask("1. What is your roblox username?");
    const hostAns = await ask("2. Do you want to be the host? (yes/no)");
    const packageAns = await ask("3. Choose a Package 1 Raids (Free) 2 Raids (Free) 3 Raids (Costs any Fruit) Unlimited (Boost the server for Unlimited 6 Months)");
    const raid = await ask("4. Select a Raid type (Pixel wuz here)");

    const isHost = hostAns?.toLowerCase().includes("y");

    // ================= QUEUE ENTRY =================

    const entry = {
      userId: user.id,
      username,
      host: isHost,
      package: packageAns,
      raid
    };

    queue.push(entry);

    updateStats(guild);

    // ================= FINAL MESSAGE =================

    await channel.send("Survey complete. You have been added to the queue, This might take a while, but you will get a DM");

    // delete channel after short delay
    setTimeout(() => {
      channel.delete().catch(() => {});
    }, 5000);
  }
});

// ================= STATS =================

async function updateStats(guild) {

  const channel = guild.channels.cache.find(c => c.name === "queue-stats");
  if (!channel) return;

  let text = "QUEUE STATS\n\n";

  for (const entry of queue) {

    text += `<@${entry.userId}> has submitted the survey\n`;
    text += `Host: ${entry.host ? "Yes" : "No"}\n`;
    text += `Package: ${entry.package}\n`;
    text += `Raid: ${entry.raid}\n\n`;
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
    console.log("STATS ERROR:", err);
  }
}

// ================= LOGIN =================

client.login(process.env.TOKEN);
