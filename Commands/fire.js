/**
 * /fire - Remove all roles from a user except Member role
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { hasPermission, buildPermissionDeniedEmbed } = require('../utils/advancedPermissions');
const { logAudit } = require('../utils/modLogger');
const { execute } = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fire')
    .setDescription('Remove all government/staff roles from a user')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User to fire')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for termination')
        .setRequired(true)),

  async execute(interaction) {
    const permCheck = hasPermission(interaction.member, 'fire');
    if (!permCheck.allowed) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed('fire', permCheck.requiredLevel || 'HR', permCheck.canRequest)],
        ephemeral: true
      });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: '❌ User not found in server.', ephemeral: true });
    }

    // Confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setTitle('⚠️ Confirm Termination')
      .setColor(0xE74C3C)
      .setDescription(`Are you sure you want to fire **${target.tag}**?\n\nThis will remove **all roles** except the Member role.`)
      .addFields(
        { name: 'Target', value: `${target} (${target.tag})`, inline: true },
        { name: 'Reason', value: reason, inline: false }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`fire:confirm:${target.id}:${interaction.user.id}`)
        .setLabel('Confirm Fire')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔥'),
      new ButtonBuilder()
        .setCustomId(`fire:cancel:${interaction.user.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    const response = await interaction.reply({ embeds: [confirmEmbed], components: [row], fetchReply: true });

    // Store reason for button handler
    response.fireReason = reason;
  },

  async handleButton(interaction) {
    const [, action, targetId, executorId] = interaction.customId.split(':');

    if (interaction.user.id !== executorId) {
      return interaction.reply({ content: '❌ Only the command executor can use these buttons.', ephemeral: true });
    }

    if (action === 'cancel') {
      return interaction.update({
        embeds: [new EmbedBuilder().setTitle('❌ Cancelled').setColor(0x7F8C8D).setDescription('Termination cancelled.')],
        components: []
      });
    }

    if (action === 'confirm') {
      await interaction.deferUpdate();

      try {
        const target = await interaction.client.users.fetch(targetId);
        const targetMember = await interaction.guild.members.fetch(targetId);
        
        // Get roles to remove (all except @everyone and Member role)
        const memberRoleId = process.env.MEMBER_ROLE_ID;
        const rolesToRemove = targetMember.roles.cache.filter(role => 
          role.id !== interaction.guild.id && // Not @everyone
          role.id !== memberRoleId &&
          role.editable // Bot can remove it
        );

        const removedRoleNames = rolesToRemove.map(r => r.name);

        // Remove roles
        for (const role of rolesToRemove.values()) {
          await targetMember.roles.remove(role, `Fired by ${interaction.user.tag}: ${interaction.message.fireReason || 'No reason'}`);
        }

        // Ensure they have Member role
        if (memberRoleId) {
          const memberRole = interaction.guild.roles.cache.get(memberRoleId);
          if (memberRole && !targetMember.roles.cache.has(memberRoleId)) {
            await targetMember.roles.add(memberRole, 'Fired - keeping Member role');
          }
        }

        // Update database
        execute(`
          UPDATE staff_assignments 
          SET status = 'fired', removed_at = CURRENT_TIMESTAMP, removed_by = ?, removal_reason = ?
          WHERE guild_id = ? AND user_id = ? AND status = 'active'
        `, [interaction.user.id, interaction.message.fireReason || 'Fired', interaction.guild.id, targetId]);

        logAudit(interaction.guild.id, 'FIRE', interaction.user.id, interaction.user.tag, targetId, target.tag, { 
          reason: interaction.message.fireReason,
          rolesRemoved: removedRoleNames 
        });

        // DM the user
        try {
          const dmEmbed = new EmbedBuilder()
            .setTitle('🔥 You Have Been Terminated')
            .setColor(0xE74C3C)
            .setDescription(`Your position in **${interaction.guild.name}** has been terminated.`)
            .addFields({ name: 'Reason', value: interaction.message.fireReason || 'No reason provided', inline: false })
            .setTimestamp();
          
          await target.send({ embeds: [dmEmbed] });
        } catch (e) {}

        const embed = new EmbedBuilder()
          .setTitle('🔥 User Terminated')
          .setColor(0xE74C3C)
          .setDescription(`**${target.tag}** has been fired.`)
          .addFields(
            { name: 'Roles Removed', value: removedRoleNames.length > 0 ? removedRoleNames.join(', ') : 'None', inline: false },
            { name: 'Reason', value: interaction.message.fireReason || 'No reason provided', inline: false }
          )
          .setFooter({ text: `Fired by ${interaction.user.tag}` })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed], components: [] });

      } catch (error) {
        console.error('[Fire] Error:', error);
        return interaction.editReply({ 
          embeds: [new EmbedBuilder().setTitle('❌ Error').setColor(0xE74C3C).setDescription('Failed to fire user.')],
          components: [] 
        });
      }
    }
  }
};
