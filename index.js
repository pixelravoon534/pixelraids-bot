async function updateStats(guild) {

  console.log("[STATS] update triggered");

  const channel = guild.channels.cache.find(c => c.name === "queue-stats");

  if (!channel) {
    console.log("[STATS ERROR] queue-stats channel not found");
    return;
  }

  // Safety check: permissions
  const botMember = guild.members.me;

  if (!channel.permissionsFor(botMember).has([
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
      console.log("[STATS] created message");
    } else {
      const msg = await channel.messages.fetch(statsMessageId).catch(() => null);

      if (!msg) {
        console.log("[STATS] message missing, recreating...");
        const newMsg = await channel.send(text);
        statsMessageId = newMsg.id;
      } else {
        await msg.edit(text);
        console.log("[STATS] updated message");
      }
    }

  } catch (err) {
    console.log("[STATS ERROR]", err);
  }
}
