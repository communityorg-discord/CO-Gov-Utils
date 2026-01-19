/**
 * /server-stats - Server Statistics Command
 * Comprehensive server analytics
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('server-stats')
        .setDescription('View comprehensive server statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'server-stats');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;

        // Fetch all members
        await guild.members.fetch();

        // Member stats
        const members = guild.members.cache;
        const totalMembers = members.size;
        const humans = members.filter(m => !m.user.bot).size;
        const bots = members.filter(m => m.user.bot).size;
        const online = members.filter(m => m.presence?.status !== 'offline').size;

        // Channel stats
        const channels = guild.channels.cache;
        const textChannels = channels.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = channels.filter(c => c.type === ChannelType.GuildVoice).size;
        const categories = channels.filter(c => c.type === ChannelType.GuildCategory).size;
        const threads = channels.filter(c => c.type === ChannelType.PublicThread || c.type === ChannelType.PrivateThread).size;
        const forums = channels.filter(c => c.type === ChannelType.GuildForum).size;

        // Role stats
        const roles = guild.roles.cache.size - 1; // Exclude @everyone
        const boostRole = guild.roles.cache.filter(r => r.managed && r.name.includes('Boost')).size;

        // Boost stats
        const boostLevel = guild.premiumTier;
        const boosters = guild.premiumSubscriptionCount || 0;

        // Emoji stats
        const emojis = guild.emojis.cache.size;
        const animatedEmojis = guild.emojis.cache.filter(e => e.animated).size;
        const staticEmojis = emojis - animatedEmojis;

        // Sticker stats
        const stickers = guild.stickers.cache.size;

        // Member join dates analysis
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;
        const joinsToday = members.filter(m => now - m.joinedTimestamp < day).size;
        const joinsWeek = members.filter(m => now - m.joinedTimestamp < 7 * day).size;
        const joinsMonth = members.filter(m => now - m.joinedTimestamp < 30 * day).size;

        // Voice stats
        const inVoice = members.filter(m => m.voice.channel).size;

        const embed = new EmbedBuilder()
            .setTitle(`📊 Server Statistics: ${guild.name}`)
            .setColor(0x3498DB)
            .setThumbnail(guild.iconURL({ size: 256 }))
            .addFields(
                { name: '👥 Members', value: `Total: **${totalMembers}**\nHumans: ${humans}\nBots: ${bots}\nOnline: ${online}`, inline: true },
                { name: '📊 Growth', value: `Today: +${joinsToday}\nThis Week: +${joinsWeek}\nThis Month: +${joinsMonth}`, inline: true },
                { name: '🎙️ Activity', value: `In Voice: ${inVoice}`, inline: true },
                { name: '📁 Channels', value: `Text: ${textChannels}\nVoice: ${voiceChannels}\nCategories: ${categories}\nThreads: ${threads}\nForums: ${forums}`, inline: true },
                { name: '🎭 Roles', value: `Total: ${roles}`, inline: true },
                { name: '💎 Boost', value: `Level: ${boostLevel}\nBoosters: ${boosters}`, inline: true },
                { name: '😀 Emojis', value: `Static: ${staticEmojis}\nAnimated: ${animatedEmojis}\nTotal: ${emojis}`, inline: true },
                { name: '🏷️ Stickers', value: String(stickers), inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true }
            )
            .setFooter({ text: `Server ID: ${guild.id}` })
            .setTimestamp();

        // Add verification level
        const verificationLevels = ['None', 'Low', 'Medium', 'High', 'Very High'];
        embed.addFields({ name: '🔒 Verification', value: verificationLevels[guild.verificationLevel] || 'Unknown', inline: true });

        return interaction.editReply({ embeds: [embed] });
    }
};
