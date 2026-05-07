const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let queue = [];
let activeGroup = null;
let raidCount = 1;

// =====================
// SETUP SERVER
// =====================
client.on("messageCreate", async (message) => {
  if (message.content !== "!setup") return;

  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.reply("❌ Admin only.");
  }

  const guild = message.guild;

  const surveyCat = await guild.channels.create({ name: "SURVEYS", type: 4 });
  const raidCat = await guild.channels.create({ name: "RAID SYSTEM", type: 4 });
  const adminCat = await guild.channels.create({ name: "ADMIN", type: 4 });

  await guild.channels.create({
    name: "raid-survey",
    type: 0,
    parent: surveyCat.id
  });

  await guild.channels.create({
    name: "queue-status",
    type: 0,
    parent: raidCat.id
  });

  await guild.channels.create({
    name: "raid-logs",
    type: 0,
    parent: raidCat.id
  });

  await guild.channels.create({
    name: "admin-control",
    type: 0,
    parent: adminCat.id
  });

  message.channel.send("✅ Setup complete!");
});

// =====================
// PANEL BUTTON
// =====================
client.on("messageCreate", async (message) => {
  if (message.content !== "!panel") return;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("start_survey")
      .setLabel("🎮 Start Raid Application")
      .setStyle(ButtonStyle.Primary)
  );

  message.channel.send({
    content: "Click to apply for a raid 👇",
    components: [row]
  });
});

// =====================
// BUTTON CLICK
// =====================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "start_survey") {

    const channel = await interaction.guild.channels.create({
      name: `survey-${interaction.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        },
        {
          id: interaction.client.user.id,
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

    runSurvey(channel, interaction.user);
  }
});

// =====================
// SURVEY SYSTEM
// =====================
async function runSurvey(channel, user) {

  const data = {};

  await channel.send("1️⃣ Roblox username?");
  data.username = (await channel.awaitMessages({
    filter: m => m.author.id === user.id,
    max: 1,
    time: 120000
  })).first().content;

  await channel.send("2️⃣ Are you hosting? (yes/no)");
  data.isHost = (await channel.awaitMessages({
    filter: m => m.author.id === user.id,
    max: 1,
    time: 120000
  })).first().content.toLowerCase() === "yes";

  await channel.send(
`3️⃣ Raid type:
Flame, Ice, Sand, Dark, Light, Magma, Quake, Buddha, String, Rumble, Paw, Dough, Phoenix`
  );

  data.raid = (await channel.awaitMessages({
    filter: m => m.author.id === user.id,
    max: 1,
    time: 120000
  })).first().content;

  await channel.send(
`4️⃣ Package:
1 = Free slow
2 = Faster
3 = Fruit fast
unlimited = Boost`
  );

  data.packageType = (await channel.awaitMessages({
    filter: m => m.author.id === user.id,
    max: 1,
    time: 120000
  })).first().content;

  queue.push({
    id: user.id,
    ...data
  });

  await channel.send("✅ Added to queue!");

  setTimeout(() => channel.delete().catch(() => {}), 3000);
}

// =====================
// BEGIN RAIDS
// =====================
client.on("messageCreate", async (message) => {
  if (message.content !== "!beginraids") return;

  if (activeGroup) return message.reply("Raid already active.");

  let hostIndex = queue.findIndex(p => p.isHost);
  if (hostIndex === -1) return message.reply("No host found.");

  let host = queue.splice(hostIndex, 1)[0];

  let group = [host];

  for (let i = 0; i < queue.length; i++) {
    let p = queue[i];

    if (host.packageType === "1" && p.raid !== host.raid) continue;

    group.push(p);
    queue.splice(i, 1);
    i--;

    if (group.length >= 3 && host.packageType !== "unlimited") break;
  }

  activeGroup = group;

  const channel = await message.guild.channels.create({
    name: `raid-${raidCount++}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: message.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      ...group.map(p => ({
        id: p.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages
        ]
      }))
    ]
  });

  channel.send(
`🔥 RAID STARTED 🔥

🎮 HOST:
<@${host.id}>
👤 ${host.username}

👥 MEMBERS:

${group.map(p =>
`• <@${p.id}>
  👤 ${p.username}
  🎯 ${p.raid}
  📦 ${p.packageType}`
).join("\n")}
`
  );
});

// =====================
// FINISH RAID
// =====================
client.on("messageCreate", async (message) => {
  if (message.content !== "!raidfinish") return;

  activeGroup = null;

  message.reply("Raid finished. Deleting channel...");

  setTimeout(() => {
    message.channel.delete().catch(() => {});
  }, 3000);
});

// =====================
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
