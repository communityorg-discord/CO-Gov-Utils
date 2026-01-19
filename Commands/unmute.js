/**
 * /unmute - Remove mute from a user
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { hasPermission, buildPermissionDeniedEmbed, canModerate } = require('../utils/advancedPermissions');
const { logAudit } = require('../utils/modLogger');
const { execute, query } = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove mute from a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to unmute')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for unmuting')),

  async execute(interaction) {
    const permCheck = hasPermission(interaction.member, 'unmute');
    if (!permCheck.allowed) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed('unmute', permCheck.requiredLevel || 'MODERATOR', permCheck.canRequest)],
        ephemeral: true
      });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
    
    if (!targetMember) {
      return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
    }

    if (!targetMember.isCommunicationDisabled()) {
      return interaction.reply({ content: '❌ This user is not muted.', ephemeral: true });
    }

    if (!targetMember.moderatable) {
      return interaction.reply({
        content: '❌ I cannot unmute this user (bot lacks permissions).',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      // Remove timeout
      await targetMember.timeout(null, `Unmuted by ${interaction.user.tag}: ${reason}`);

      // Remove from active mutes
      execute('DELETE FROM active_mutes WHERE guild_id = ? AND user_id = ?', [interaction.guild.id, target.id]);

      // DM user
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle('🔊 You Have Been Unmuted')
          .setColor(0x27AE60)
          .setDescription(`Your mute in **${interaction.guild.name}** has been lifted.`)
          .addFields({ name: 'Reason', value: reason, inline: false })
          .setTimestamp();
        
        await target.send({ embeds: [dmEmbed] });
      } catch (e) {}

      // Log
      logAudit(interaction.guild.id, 'UNMUTE', interaction.user.id, interaction.user.tag, target.id, target.tag, { reason });

      const embed = new EmbedBuilder()
        .setTitle('🔊 User Unmuted')
        .setColor(0x27AE60)
        .addFields(
          { name: 'User', value: `${target} (${target.tag})`, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setFooter({ text: `Unmuted by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[Unmute] Error:', error);
      return interaction.editReply({ content: '❌ Failed to unmute user.' });
    }
  }
};
