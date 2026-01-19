/**
 * /queue - Speaking Queue Command
 * Moderated speaking order for voice channel discussions
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const speakingQueue = require('../utils/speakingQueue');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Moderated speaking queue for voice channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
        .addSubcommand(sub => sub
            .setName('start')
            .setDescription('Start a speaking queue in your current VC'))
        .addSubcommand(sub => sub
            .setName('join')
            .setDescription('Join the speaking queue'))
        .addSubcommand(sub => sub
            .setName('leave')
            .setDescription('Leave the speaking queue'))
        .addSubcommand(sub => sub
            .setName('next')
            .setDescription('Move to the next speaker (moderator only)'))
        .addSubcommand(sub => sub
            .setName('skip')
            .setDescription('Skip current speaker to back of queue (moderator only)'))
        .addSubcommand(sub => sub
            .setName('end')
            .setDescription('End the speaking queue (moderator only)'))
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('View the current queue')),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'queue');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();
        const channel = interaction.member.voice?.channel;

        switch (sub) {
            case 'start': return handleStart(interaction, channel);
            case 'join': return handleJoin(interaction, channel);
            case 'leave': return handleLeave(interaction, channel);
            case 'next': return handleNext(interaction, channel);
            case 'skip': return handleSkip(interaction, channel);
            case 'end': return handleEnd(interaction, channel);
            case 'status': return handleStatus(interaction, channel);
        }
    },

    handleButton
};

async function handleStart(interaction, channel) {
    if (!channel) {
        return interaction.reply({ content: '❌ You must be in a voice channel to start a queue.', ephemeral: true });
    }

    const result = speakingQueue.startQueue(channel.id, interaction.user.id);
    if (!result.success) {
        return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
    }

    const embed = speakingQueue.buildQueueEmbed(channel.id, channel.name);
    const components = speakingQueue.buildQueueControls(channel.id, true);

    return interaction.reply({
        content: `🎤 **Speaking queue started in ${channel.name}!**\nUse the buttons below to manage the queue.`,
        embeds: [embed],
        components
    });
}

async function handleJoin(interaction, channel) {
    if (!channel) {
        return interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }

    if (!speakingQueue.hasQueue(channel.id)) {
        return interaction.reply({ content: '❌ No active queue in this channel.', ephemeral: true });
    }

    const displayName = interaction.member.displayName || interaction.user.username;
    const result = speakingQueue.joinQueue(channel.id, interaction.user.id, displayName);

    if (!result.success) {
        return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
    }

    return interaction.reply({ content: `✋ You joined the queue! Position: **#${result.position}**`, ephemeral: true });
}

async function handleLeave(interaction, channel) {
    if (!channel) {
        return interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }

    const result = speakingQueue.leaveQueue(channel.id, interaction.user.id);

    if (!result.success) {
        return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
    }

    return interaction.reply({ content: '🚪 You left the queue.', ephemeral: true });
}

async function handleNext(interaction, channel) {
    if (!channel) {
        return interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }

    if (!speakingQueue.isModerator(channel.id, interaction.user.id)) {
        return interaction.reply({ content: '❌ Only the queue moderator can do this.', ephemeral: true });
    }

    const result = speakingQueue.nextSpeaker(channel.id);

    if (!result.success) {
        return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
    }

    if (result.speaker) {
        const embed = speakingQueue.buildQueueEmbed(channel.id, channel.name);
        return interaction.reply({
            content: `🎙️ **Now speaking:** <@${result.speaker.userId}>\n*${result.remaining} remaining in queue*`,
            embeds: [embed]
        });
    }

    return interaction.reply({ content: '📭 Queue is empty! No more speakers.', ephemeral: true });
}

async function handleSkip(interaction, channel) {
    if (!channel) {
        return interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }

    if (!speakingQueue.isModerator(channel.id, interaction.user.id)) {
        return interaction.reply({ content: '❌ Only the queue moderator can do this.', ephemeral: true });
    }

    const result = speakingQueue.skipSpeaker(channel.id);

    if (!result.success) {
        return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
    }

    if (result.speaker) {
        return interaction.reply({ content: `⏩ Skipped! **Now speaking:** <@${result.speaker.userId}>`, ephemeral: false });
    }

    return interaction.reply({ content: '📭 Queue is empty!', ephemeral: true });
}

async function handleEnd(interaction, channel) {
    if (!channel) {
        return interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }

    if (!speakingQueue.isModerator(channel.id, interaction.user.id)) {
        return interaction.reply({ content: '❌ Only the queue moderator can do this.', ephemeral: true });
    }

    speakingQueue.endQueue(channel.id);

    return interaction.reply({ content: `🛑 Speaking queue ended for **${channel.name}**.` });
}

async function handleStatus(interaction, channel) {
    if (!channel) {
        return interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }

    if (!speakingQueue.hasQueue(channel.id)) {
        return interaction.reply({ content: '❌ No active queue in this channel.', ephemeral: true });
    }

    const isMod = speakingQueue.isModerator(channel.id, interaction.user.id);
    const embed = speakingQueue.buildQueueEmbed(channel.id, channel.name);
    const components = speakingQueue.buildQueueControls(channel.id, isMod);

    const position = speakingQueue.getPosition(channel.id, interaction.user.id);
    let posText = '';
    if (position === 0) posText = '\n🎙️ **You are the current speaker!**';
    else if (position > 0) posText = `\n📊 **Your position:** #${position}`;

    return interaction.reply({
        content: `📋 **Speaking Queue Status**${posText}`,
        embeds: [embed],
        components,
        ephemeral: true
    });
}

// Button handler
async function handleButton(interaction) {
    const [, action, channelId] = interaction.customId.split(':');
    const channel = interaction.member.voice?.channel;

    if (!channel || channel.id !== channelId) {
        return interaction.reply({ content: '❌ You must be in the same voice channel.', ephemeral: true });
    }

    try {
        switch (action) {
            case 'join': {
                const displayName = interaction.member.displayName || interaction.user.username;
                const result = speakingQueue.joinQueue(channelId, interaction.user.id, displayName);
                if (!result.success) {
                    return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
                }
                return interaction.reply({ content: `✋ Joined! Position: **#${result.position}**`, ephemeral: true });
            }

            case 'leave': {
                const result = speakingQueue.leaveQueue(channelId, interaction.user.id);
                if (!result.success) {
                    return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
                }
                return interaction.reply({ content: '🚪 Left queue.', ephemeral: true });
            }

            case 'status': {
                const isMod = speakingQueue.isModerator(channelId, interaction.user.id);
                const embed = speakingQueue.buildQueueEmbed(channelId, channel.name);
                const components = speakingQueue.buildQueueControls(channelId, isMod);
                return interaction.update({ embeds: [embed], components });
            }

            case 'next': {
                if (!speakingQueue.isModerator(channelId, interaction.user.id)) {
                    return interaction.reply({ content: '❌ Mod only.', ephemeral: true });
                }
                const result = speakingQueue.nextSpeaker(channelId);
                const embed = speakingQueue.buildQueueEmbed(channelId, channel.name);
                const components = speakingQueue.buildQueueControls(channelId, true);

                if (result.speaker) {
                    await interaction.reply({ content: `🎙️ **Now speaking:** <@${result.speaker.userId}>` });
                }
                return interaction.message.edit({ embeds: [embed], components });
            }

            case 'skip': {
                if (!speakingQueue.isModerator(channelId, interaction.user.id)) {
                    return interaction.reply({ content: '❌ Mod only.', ephemeral: true });
                }
                const result = speakingQueue.skipSpeaker(channelId);
                const embed = speakingQueue.buildQueueEmbed(channelId, channel.name);

                if (result.speaker) {
                    return interaction.reply({ content: `⏩ Skipped! **Now speaking:** <@${result.speaker.userId}>` });
                }
                return interaction.reply({ content: '📭 Queue empty.', ephemeral: true });
            }

            case 'end': {
                if (!speakingQueue.isModerator(channelId, interaction.user.id)) {
                    return interaction.reply({ content: '❌ Mod only.', ephemeral: true });
                }
                speakingQueue.endQueue(channelId);
                return interaction.update({ content: '🛑 Queue ended.', embeds: [], components: [] });
            }
        }
    } catch (e) {
        console.error('[Queue] Button error:', e.message);
    }
}
