const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-bot')
        .setDescription('Bot administration commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('restart')
                .setDescription('Restart the bot (requires superuser)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('shutdown')
                .setDescription('Shutdown the bot completely (requires superuser)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Superuser check - add your user IDs here
        const SUPERUSER_IDS = process.env.SUPERUSER_IDS?.split(',') || [];

        if (!SUPERUSER_IDS.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ This command is restricted to bot superusers only.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'restart') {
            await interaction.reply({
                content: '🔄 Restarting bot... The bot will be back online shortly.',
                ephemeral: false
            });

            // Log the restart
            console.log(`[Admin] Bot restart initiated by ${interaction.user.tag} (${interaction.user.id})`);

            // Give time for the reply to send, then exit
            // PM2 will automatically restart the process
            setTimeout(() => {
                process.exit(0);
            }, 2000);

        } else if (subcommand === 'shutdown') {
            await interaction.reply({
                content: '⛔ Shutting down bot... Manual restart will be required.',
                ephemeral: false
            });

            // Log the shutdown
            console.log(`[Admin] Bot SHUTDOWN initiated by ${interaction.user.tag} (${interaction.user.id})`);

            // Give time for the reply to send, then exit with code 1
            // PM2 won't restart if we use specific exit handling
            setTimeout(() => {
                // To prevent PM2 from restarting, we need to stop via PM2
                // For now, we'll use exit code that signals intentional stop
                console.log('[Admin] Executing shutdown - use "pm2 start gov-utils" to restart');
                process.exit(1);
            }, 2000);
        }
    }
};
