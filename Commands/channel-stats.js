/**
 * /channel-stats - Channel Statistics Command
 * View activity and stats for a channel
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('channel-stats')
        .setDescription('View channel statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(opt => opt
            .setName('channel')
            .setDescription('Channel to analyze (defaults to current)')),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'channel-stats');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel') || interaction.channel;

        if (![ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildForum].includes(channel.type)) {
            return interaction.reply({ content: '❌ Please select a text, voice, or forum channel.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle(`📊 Channel Stats: #${channel.name}`)
            .setColor(0x3498DB)
            .setTimestamp();

        // Basic info
        const channelTypes = {
            [ChannelType.GuildText]: 'Text Channel',
            [ChannelType.GuildVoice]: 'Voice Channel',
            [ChannelType.GuildForum]: 'Forum Channel',
            [ChannelType.GuildAnnouncement]: 'Announcement Channel',
            [ChannelType.GuildStageVoice]: 'Stage Channel'
        };

        embed.addFields(
            { name: '📁 Type', value: channelTypes[channel.type] || 'Unknown', inline: true },
            { name: '📅 Created', value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:R>`, inline: true }
        );

        if (channel.topic) {
            embed.addFields({ name: '📝 Topic', value: channel.topic.substring(0, 200), inline: false });
        }

        if (channel.parent) {
            embed.addFields({ name: '📂 Category', value: channel.parent.name, inline: true });
        }

        // Text channel specific
        if (channel.type === ChannelType.GuildText) {
            embed.addFields(
                { name: '🔞 NSFW', value: channel.nsfw ? 'Yes' : 'No', inline: true },
                { name: '⏱️ Slowmode', value: channel.rateLimitPerUser ? `${channel.rateLimitPerUser}s` : 'Off', inline: true }
            );

            // Try to get recent messages
            try {
                const messages = await channel.messages.fetch({ limit: 100 });
                const now = Date.now();
                const day = 24 * 60 * 60 * 1000;

                const todayMessages = messages.filter(m => now - m.createdTimestamp < day).size;
                const weekMessages = messages.filter(m => now - m.createdTimestamp < 7 * day).size;

                // Unique authors
                const uniqueAuthors = new Set(messages.map(m => m.author.id)).size;

                // Last message
                const lastMessage = messages.first();

                embed.addFields(
                    { name: '💬 Recent Activity (100 msgs)', value: `Today: ${todayMessages}\nThis Week: ${weekMessages}\nUnique Authors: ${uniqueAuthors}`, inline: true }
                );

                if (lastMessage) {
                    embed.addFields({
                        name: '🕐 Last Message',
                        value: `<t:${Math.floor(lastMessage.createdTimestamp / 1000)}:R>\nby ${lastMessage.author.tag}`,
                        inline: true
                    });
                }
            } catch (e) {
                embed.addFields({ name: '💬 Messages', value: 'Unable to fetch', inline: true });
            }

            // Thread count
            try {
                const threads = await channel.threads.fetchActive();
                const archivedThreads = await channel.threads.fetchArchived({ limit: 10 });
                embed.addFields({
                    name: '🧵 Threads',
                    value: `Active: ${threads.threads.size}\nArchived: ${archivedThreads.threads.size}+`,
                    inline: true
                });
            } catch (e) { }

            // Pins
            try {
                const pins = await channel.messages.fetchPinned();
                embed.addFields({ name: '📌 Pins', value: `${pins.size}/50`, inline: true });
            } catch (e) { }
        }

        // Voice channel specific
        if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
            const membersInVoice = channel.members.size;
            embed.addFields(
                { name: '🎙️ Bitrate', value: `${channel.bitrate / 1000}kbps`, inline: true },
                { name: '👥 User Limit', value: channel.userLimit ? String(channel.userLimit) : 'Unlimited', inline: true },
                { name: '👥 Currently In', value: String(membersInVoice), inline: true }
            );
        }

        // Permission overwrites
        const overwrites = channel.permissionOverwrites.cache.size;
        embed.addFields({ name: '🔐 Permission Overwrites', value: String(overwrites), inline: true });

        embed.setFooter({ text: `Channel ID: ${channel.id}` });

        return interaction.editReply({ embeds: [embed] });
    }
};
