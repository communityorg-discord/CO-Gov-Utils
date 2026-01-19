/**
 * /office - Office Management Command
 * Minimal command - just triggers panel refresh or admin panel
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const officeManager = require('../utils/officeManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('office')
        .setDescription('Office management')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub => sub
            .setName('admin')
            .setDescription('Open office admin panel'))
        .addSubcommand(sub => sub
            .setName('refresh')
            .setDescription('Refresh the waiting room panel')),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'office');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'admin') {
            return officeManager.showAdminPanel(interaction);
        }

        if (sub === 'refresh') {
            await officeManager.updateWaitingPanel(interaction.client, interaction.guild.id);
            return interaction.reply({ content: '✅ Panel refreshed!', ephemeral: true });
        }
    }
};
