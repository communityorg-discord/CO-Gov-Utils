const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const voiceRecorder = require('../utils/voiceRecorder');
const audioProcessor = require('../utils/audioProcessor');
const recordingServer = require('../utils/recordingServer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('record')
        .setDescription('Voice channel recording commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start recording the voice channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Voice channel to record (default: your current channel)')
                        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Stop recording and generate files'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check current recording status'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'start') {
            await this.handleStart(interaction);
        } else if (subcommand === 'stop') {
            await this.handleStop(interaction);
        } else if (subcommand === 'status') {
            await this.handleStatus(interaction);
        }
    },

    async handleStart(interaction) {
        await interaction.deferReply();

        // Get target voice channel
        let voiceChannel = interaction.options.getChannel('channel');

        if (!voiceChannel) {
            // Try to get user's current voice channel
            const member = interaction.member;
            if (!member.voice.channel) {
                return interaction.editReply({
                    content: '❌ You must specify a channel or be in a voice channel!',
                });
            }
            voiceChannel = member.voice.channel;
        }

        // Start recording
        const result = await voiceRecorder.startRecording(
            voiceChannel,
            interaction.channel,
            interaction.user
        );

        if (!result.success) {
            return interaction.editReply({
                content: `❌ Failed to start recording: ${result.error}`,
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🔴 Recording Started')
            .setDescription(`Now recording **${voiceChannel.name}**`)
            .addFields(
                { name: '📍 Channel', value: `<#${voiceChannel.id}>`, inline: true },
                { name: '⏱️ Max Duration', value: '6 hours', inline: true },
                { name: '👤 Started By', value: `${interaction.user}`, inline: true }
            )
            .setColor(0xFF0000)
            .setFooter({ text: `Session: ${result.sessionId}` })
            .setTimestamp();

        // Send indicator message
        const indicatorEmbed = new EmbedBuilder()
            .setTitle('🎙️ Voice Recording in Progress')
            .setDescription('This channel is being recorded. All audio will be saved.')
            .setColor(0xFF0000);

        try {
            await voiceChannel.send({ embeds: [indicatorEmbed] });
        } catch (e) {
            // Can't send to voice text channel
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleStop(interaction) {
        await interaction.deferReply();

        const guildId = interaction.guild.id;
        const result = await voiceRecorder.stopRecording(guildId);

        if (!result.success) {
            return interaction.editReply({
                content: `❌ ${result.error}`,
            });
        }

        // Get download URL - files will be processed on website
        const downloadUrl = recordingServer.getDownloadUrl(result.sessionId);

        const embed = new EmbedBuilder()
            .setTitle('✅ Recording Complete')
            .setDescription('Your recording is ready! Visit the link below to preview individual tracks or download a combined mix.')
            .addFields(
                { name: '⏱️ Duration', value: result.duration, inline: true },
                { name: '🎙️ Speakers', value: `${result.fileCount} tracks`, inline: true },
                { name: '📥 Download', value: `[Click here](${downloadUrl})`, inline: false }
            )
            .setColor(0x00FF00)
            .setFooter({ text: `Session: ${result.sessionId}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleStatus(interaction) {
        const guildId = interaction.guild.id;
        const status = voiceRecorder.getStatus(guildId);

        if (!status) {
            return interaction.reply({
                content: '📭 No active recording in this server.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🔴 Recording Status')
            .addFields(
                { name: '⏱️ Duration', value: status.duration, inline: true },
                { name: '⏳ Remaining', value: status.remaining, inline: true },
                { name: '👥 Users Recorded', value: `${status.usersRecorded}`, inline: true },
                { name: '📁 Files Created', value: `${status.filesCreated}`, inline: true }
            )
            .setColor(0xFF0000)
            .setFooter({ text: `Session: ${status.sessionId}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
