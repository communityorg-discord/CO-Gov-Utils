const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('recolour')
        .setDescription('Change the color of a role')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to recolour')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('New hex color (e.g., #FF0000 or FF0000)')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        const role = interaction.options.getRole('role');
        const colorInput = interaction.options.getString('color');

        // Check if bot can manage this role
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({
                content: '❌ I cannot modify this role - it\'s higher than or equal to my highest role.',
                ephemeral: true
            });
        }

        // Check if role is managed (e.g., bot roles, booster role)
        if (role.managed) {
            return interaction.reply({
                content: '❌ This role is managed by an integration and cannot be modified.',
                ephemeral: true
            });
        }

        // Parse color
        let color;
        try {
            const hex = colorInput.replace('#', '');
            if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
                throw new Error('Invalid hex');
            }
            color = parseInt(hex, 16);
        } catch {
            return interaction.reply({
                content: '❌ Invalid color format. Use hex format like `#FF0000` or `FF0000`.',
                ephemeral: true
            });
        }

        // Store old color for embed
        const oldColor = role.hexColor;

        try {
            await role.setColor(color);

            const embed = new EmbedBuilder()
                .setTitle('🎨 Role Recoloured')
                .setDescription(`Successfully changed the color of ${role}`)
                .addFields(
                    { name: 'Old Color', value: `\`${oldColor}\``, inline: true },
                    { name: 'New Color', value: `\`#${color.toString(16).toUpperCase().padStart(6, '0')}\``, inline: true }
                )
                .setColor(color)
                .setFooter({ text: `Changed by ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            await interaction.reply({
                content: `❌ Failed to change role color: ${error.message}`,
                ephemeral: true
            });
        }
    }
};
