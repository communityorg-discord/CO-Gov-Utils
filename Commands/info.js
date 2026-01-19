/**
 * /info - Display bot information, developer, and superusers
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { 
  BOT_DEVELOPER_ID, 
  getAllSuperusers, 
  getAccessibleCommands,
  COMMAND_CATEGORIES,
  PERMISSION_LEVELS,
  getUserPermissionLevel
} = require('../utils/advancedPermissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Display bot information and permissions'),

  async execute(interaction) {
    await interaction.deferReply();

    const client = interaction.client;
    const superusers = getAllSuperusers();
    const userLevel = getUserPermissionLevel(interaction.member);
    const levelName = Object.keys(PERMISSION_LEVELS).find(k => PERMISSION_LEVELS[k] === userLevel);

    // Fetch developer user
    let developerTag = 'Unknown';
    try {
      const dev = await client.users.fetch(BOT_DEVELOPER_ID);
      developerTag = dev.tag;
    } catch (e) {}

    // Fetch superuser tags
    const superuserTags = [];
    for (const userId of superusers.all) {
      try {
        const user = await client.users.fetch(userId);
        const isHardcoded = superusers.hardcoded.includes(userId);
        superuserTags.push(`${user.tag}${isHardcoded ? ' 🔒' : ''}`);
      } catch (e) {
        superuserTags.push(`<@${userId}>${superusers.hardcoded.includes(userId) ? ' 🔒' : ''}`);
      }
    }

    // Get accessible commands count
    const accessibleCommands = getAccessibleCommands(interaction.member);

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle('🤖 CO | Government Utilities')
      .setColor(0x3498DB)
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { 
          name: '📊 Bot Statistics', 
          value: [
            `**Servers:** ${client.guilds.cache.size}`,
            `**Commands:** ${client.commands.size}`,
            `**Uptime:** ${formatUptime(client.uptime)}`
          ].join('\n'),
          inline: true 
        },
        {
          name: '🔧 Technical',
          value: [
            `**Version:** ${process.env.BOT_VERSION || '1.0.0'}`,
            `**Node.js:** ${process.version}`,
            `**Discord.js:** v14`
          ].join('\n'),
          inline: true
        },
        {
          name: '👨‍💻 Bot Developer',
          value: `${developerTag}\n\`${BOT_DEVELOPER_ID}\``,
          inline: false
        },
        {
          name: `⭐ Superusers (${superuserTags.length})`,
          value: superuserTags.length > 0 ? superuserTags.join('\n') : 'None',
          inline: false
        },
        {
          name: '🔐 Your Permission Level',
          value: `**${levelName}** (Level ${userLevel})`,
          inline: true
        },
        {
          name: '📋 Accessible Commands',
          value: `${accessibleCommands.length} commands`,
          inline: true
        }
      )
      .setFooter({ text: '🔒 = Hardcoded (cannot be removed)' })
      .setTimestamp();

    // Add command categories breakdown for superusers
    if (userLevel >= PERMISSION_LEVELS.SUPERUSER) {
      const categoryBreakdown = Object.entries(COMMAND_CATEGORIES)
        .map(([cat, cmds]) => `**${cat}:** ${cmds.join(', ')}`)
        .join('\n');
      
      embed.addFields({
        name: '📁 Command Categories',
        value: categoryBreakdown.substring(0, 1024)
      });
    }

    return interaction.editReply({ embeds: [embed] });
  }
};

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
