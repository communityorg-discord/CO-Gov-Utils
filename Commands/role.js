/**
 * /role - Add or remove roles from users
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { hasPermission, buildPermissionDeniedEmbed } = require('../utils/advancedPermissions');
const { logAudit } = require('../utils/modLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Manage user roles')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a role to a user')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to add role to')
            .setRequired(true))
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to add')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for adding role')))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a role from a user')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to remove role from')
            .setRequired(true))
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to remove')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for removing role'))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    const permCheck = hasPermission(interaction.member, 'role', subcommand);
    if (!permCheck.allowed) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed(`role ${subcommand}`, permCheck.requiredLevel || 'MODERATOR', permCheck.canRequest)],
        ephemeral: true
      });
    }

    const target = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: '❌ User not found in server.', ephemeral: true });
    }

    // Check if role is manageable
    if (!role.editable) {
      return interaction.reply({ content: '❌ I cannot manage that role (higher than my role or managed by integration).', ephemeral: true });
    }

    // Check if executor's highest role is higher than target role
    if (role.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: '❌ You cannot manage a role equal to or higher than your highest role.', ephemeral: true });
    }

    await interaction.deferReply();

    try {
      if (subcommand === 'add') {
        if (targetMember.roles.cache.has(role.id)) {
          return interaction.editReply({ content: `❌ ${target.tag} already has the ${role.name} role.` });
        }

        await targetMember.roles.add(role, `${interaction.user.tag}: ${reason}`);

        logAudit(interaction.guild.id, 'ROLE_ADD', interaction.user.id, interaction.user.tag, target.id, target.tag, { role: role.name, roleId: role.id, reason });

        const embed = new EmbedBuilder()
          .setTitle('✅ Role Added')
          .setColor(0x27AE60)
          .addFields(
            { name: 'User', value: `${target} (${target.tag})`, inline: true },
            { name: 'Role', value: `${role}`, inline: true },
            { name: 'Reason', value: reason, inline: false }
          )
          .setFooter({ text: `Added by ${interaction.user.tag}` })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });

      } else {
        if (!targetMember.roles.cache.has(role.id)) {
          return interaction.editReply({ content: `❌ ${target.tag} doesn't have the ${role.name} role.` });
        }

        await targetMember.roles.remove(role, `${interaction.user.tag}: ${reason}`);

        logAudit(interaction.guild.id, 'ROLE_REMOVE', interaction.user.id, interaction.user.tag, target.id, target.tag, { role: role.name, roleId: role.id, reason });

        const embed = new EmbedBuilder()
          .setTitle('✅ Role Removed')
          .setColor(0xE74C3C)
          .addFields(
            { name: 'User', value: `${target} (${target.tag})`, inline: true },
            { name: 'Role', value: `${role}`, inline: true },
            { name: 'Reason', value: reason, inline: false }
          )
          .setFooter({ text: `Removed by ${interaction.user.tag}` })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

    } catch (error) {
      console.error('[Role] Error:', error);
      return interaction.editReply({ content: '❌ Failed to modify role.' });
    }
  }
};
