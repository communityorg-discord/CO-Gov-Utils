const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Create a custom embed message')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('The embed title')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('The embed description')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Hex color (e.g., #FF0000)')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send the embed to (default: current)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const colorInput = interaction.options.getString('color') || '#0099FF';
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        // Parse color
        let color;
        try {
            color = colorInput.startsWith('#') ? parseInt(colorInput.slice(1), 16) : parseInt(colorInput, 16);
        } catch {
            color = 0x0099FF;
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setFooter({ text: `Created by ${interaction.user.tag}` })
            .setTimestamp();

        try {
            await channel.send({ embeds: [embed] });
            await interaction.reply({
                content: `✅ Embed sent to ${channel}!`,
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({
                content: `❌ Failed to send embed: ${error.message}`,
                ephemeral: true
            });
        }
    }
};
