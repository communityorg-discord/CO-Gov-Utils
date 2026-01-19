/**
 * /mass-role - Add or remove roles from multiple users
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { hasPermission, buildPermissionDeniedEmbed } = require('../utils/advancedPermissions');
const { logAudit } = require('../utils/modLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mass-role')
    .setDescription('Mass role management')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a role to multiple users')
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to add')
            .setRequired(true))
        .addRoleOption(opt =>
          opt.setName('filter-role')
            .setDescription('Only add to users with this role (optional)'))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for mass role add')))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a role from multiple users')
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to remove')
            .setRequired(true))
        .addRoleOption(opt =>
          opt.setName('filter-role')
            .setDescription('Only remove from users with this role (optional)'))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for mass role remove')))
    .addSubcommand(sub =>
      sub.setName('add-to-all')
        .setDescription('Add a role to ALL members')
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to add to everyone')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason')))
    .addSubcommand(sub =>
      sub.setName('remove-from-all')
        .setDescription('Remove a role from ALL members')
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to remove from everyone')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason'))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    const permCheck = hasPermission(interaction.member, 'mass-role', subcommand);
    if (!permCheck.allowed) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed(`mass-role ${subcommand}`, permCheck.requiredLevel || 'SENIOR_MOD', permCheck.canRequest)],
        ephemeral: true
      });
    }

    const role = interaction.options.getRole('role');
    const filterRole = interaction.options.getRole('filter-role');
    const reason = interaction.options.getString('reason') || 'Mass role operation';

    if (!role.editable) {
      return interaction.reply({ content: '❌ I cannot manage that role.', ephemeral: true });
    }

    if (role.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: '❌ You cannot manage a role equal to or higher than your highest role.', ephemeral: true });
    }

    await interaction.deferReply();

    try {
      // Fetch all members
      await interaction.guild.members.fetch();
      
      let targetMembers;
      const isAdd = subcommand === 'add' || subcommand === 'add-to-all';
      
      if (subcommand === 'add-to-all' || subcommand === 'remove-from-all') {
        targetMembers = interaction.guild.members.cache.filter(m => !m.user.bot);
      } else if (filterRole) {
        targetMembers = interaction.guild.members.cache.filter(m => 
          !m.user.bot && m.roles.cache.has(filterRole.id)
        );
      } else {
        return interaction.editReply({ content: '❌ Please specify a filter-role or use add-to-all/remove-from-all.', ephemeral: true });
      }

      // Filter based on current role state
      if (isAdd) {
        targetMembers = targetMembers.filter(m => !m.roles.cache.has(role.id));
      } else {
        targetMembers = targetMembers.filter(m => m.roles.cache.has(role.id));
      }

      const totalMembers = targetMembers.size;

      if (totalMembers === 0) {
        return interaction.editReply({ content: `❌ No members found to ${isAdd ? 'add role to' : 'remove role from'}.` });
      }

      // Progress embed
      const progressEmbed = new EmbedBuilder()
        .setTitle(`⏳ Mass Role ${isAdd ? 'Add' : 'Remove'} in Progress`)
        .setColor(0xF39C12)
        .setDescription(`Processing ${totalMembers} members...`)
        .addFields({ name: 'Progress', value: '0%', inline: true });

      await interaction.editReply({ embeds: [progressEmbed] });

      let success = 0;
      let failed = 0;
      let processed = 0;

      for (const member of targetMembers.values()) {
        try {
          if (isAdd) {
            await member.roles.add(role, `Mass role: ${reason}`);
          } else {
            await member.roles.remove(role, `Mass role: ${reason}`);
          }
          success++;
        } catch (e) {
          failed++;
        }

        processed++;

        // Update progress every 10 members
        if (processed % 10 === 0 || processed === totalMembers) {
          const percent = Math.round((processed / totalMembers) * 100);
          progressEmbed.spliceFields(0, 1, { name: 'Progress', value: `${percent}% (${processed}/${totalMembers})`, inline: true });
          await interaction.editReply({ embeds: [progressEmbed] }).catch(() => {});
        }

        // Rate limiting protection
        if (processed % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      logAudit(interaction.guild.id, isAdd ? 'MASS_ROLE_ADD' : 'MASS_ROLE_REMOVE', interaction.user.id, interaction.user.tag, null, null, {
        role: role.name,
        roleId: role.id,
        filterRole: filterRole?.name || 'all',
        success,
        failed,
        reason
      });

      const resultEmbed = new EmbedBuilder()
        .setTitle(`✅ Mass Role ${isAdd ? 'Add' : 'Remove'} Complete`)
        .setColor(0x27AE60)
        .addFields(
          { name: 'Role', value: `${role}`, inline: true },
          { name: 'Filter', value: filterRole ? `${filterRole}` : 'All members', inline: true },
          { name: 'Success', value: `${success}`, inline: true },
          { name: 'Failed', value: `${failed}`, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setFooter({ text: `Executed by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [resultEmbed] });

    } catch (error) {
      console.error('[Mass-Role] Error:', error);
      return interaction.editReply({ content: '❌ Mass role operation failed.' });
    }
  }
};
