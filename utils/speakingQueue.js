/**
 * Speaking Queue Manager
 * Moderated speaking order for formal voice channel discussions
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// In-memory queues (per channel)
const activeQueues = new Map(); // channelId -> { moderator, speakers: [], currentSpeaker, startedAt, muteNonSpeakers }

/**
 * Start a new speaking queue in a voice channel
 */
function startQueue(channelId, moderatorId, options = {}) {
    if (activeQueues.has(channelId)) {
        return { success: false, error: 'Queue already active in this channel' };
    }

    activeQueues.set(channelId, {
        moderator: moderatorId,
        speakers: [],
        currentSpeaker: null,
        currentSpeakerIndex: -1,
        startedAt: Date.now(),
        muteNonSpeakers: options.muteNonSpeakers || false
    });

    return { success: true };
}

/**
 * End a speaking queue
 */
function endQueue(channelId) {
    if (!activeQueues.has(channelId)) {
        return { success: false, error: 'No active queue in this channel' };
    }

    activeQueues.delete(channelId);
    return { success: true };
}

/**
 * Join the speaking queue
 */
function joinQueue(channelId, userId, displayName) {
    const queue = activeQueues.get(channelId);
    if (!queue) {
        return { success: false, error: 'No active queue' };
    }

    // Check if already in queue
    if (queue.speakers.some(s => s.userId === userId)) {
        return { success: false, error: 'Already in queue' };
    }

    const position = queue.speakers.length + 1;
    queue.speakers.push({ userId, displayName, joinedAt: Date.now() });

    return { success: true, position };
}

/**
 * Leave the speaking queue
 */
function leaveQueue(channelId, userId) {
    const queue = activeQueues.get(channelId);
    if (!queue) {
        return { success: false, error: 'No active queue' };
    }

    const index = queue.speakers.findIndex(s => s.userId === userId);
    if (index === -1) {
        return { success: false, error: 'Not in queue' };
    }

    queue.speakers.splice(index, 1);
    return { success: true };
}

/**
 * Move to next speaker
 */
function nextSpeaker(channelId) {
    const queue = activeQueues.get(channelId);
    if (!queue) {
        return { success: false, error: 'No active queue' };
    }

    if (queue.speakers.length === 0) {
        queue.currentSpeaker = null;
        return { success: true, speaker: null, remaining: 0 };
    }

    // Move to next speaker
    const speaker = queue.speakers.shift();
    queue.currentSpeaker = speaker;

    return {
        success: true,
        speaker,
        remaining: queue.speakers.length
    };
}

/**
 * Skip current speaker (move to back of queue)
 */
function skipSpeaker(channelId) {
    const queue = activeQueues.get(channelId);
    if (!queue) {
        return { success: false, error: 'No active queue' };
    }

    if (queue.currentSpeaker) {
        queue.speakers.push(queue.currentSpeaker);
    }

    return nextSpeaker(channelId);
}

/**
 * Get queue status
 */
function getQueueStatus(channelId) {
    const queue = activeQueues.get(channelId);
    if (!queue) {
        return null;
    }

    return {
        moderator: queue.moderator,
        currentSpeaker: queue.currentSpeaker,
        speakers: queue.speakers,
        totalInQueue: queue.speakers.length,
        startedAt: queue.startedAt,
        muteNonSpeakers: queue.muteNonSpeakers
    };
}

/**
 * Check if user is moderator
 */
function isModerator(channelId, userId) {
    const queue = activeQueues.get(channelId);
    return queue && queue.moderator === userId;
}

/**
 * Check if queue exists
 */
function hasQueue(channelId) {
    return activeQueues.has(channelId);
}

/**
 * Get position in queue
 */
function getPosition(channelId, userId) {
    const queue = activeQueues.get(channelId);
    if (!queue) return -1;

    if (queue.currentSpeaker?.userId === userId) return 0;

    const index = queue.speakers.findIndex(s => s.userId === userId);
    return index === -1 ? -1 : index + 1;
}

/**
 * Build queue embed
 */
function buildQueueEmbed(channelId, channelName) {
    const status = getQueueStatus(channelId);

    const embed = new EmbedBuilder()
        .setTitle(`🎤 Speaking Queue: ${channelName}`)
        .setColor(status?.currentSpeaker ? 0x27AE60 : 0x3498DB)
        .setTimestamp();

    if (!status) {
        embed.setDescription('*No active queue*');
        return embed;
    }

    let desc = '';

    if (status.currentSpeaker) {
        desc += `🎙️ **Now Speaking:** <@${status.currentSpeaker.userId}>\n\n`;
    } else {
        desc += '🎙️ **Now Speaking:** *No one*\n\n';
    }

    if (status.speakers.length > 0) {
        desc += '**Up Next:**\n';
        status.speakers.slice(0, 10).forEach((speaker, i) => {
            desc += `${i + 1}. <@${speaker.userId}>\n`;
        });
        if (status.speakers.length > 10) {
            desc += `*...and ${status.speakers.length - 10} more*\n`;
        }
    } else {
        desc += '*Queue is empty*';
    }

    embed.setDescription(desc);
    embed.addFields(
        { name: '👤 Moderator', value: `<@${status.moderator}>`, inline: true },
        { name: '📊 In Queue', value: `${status.totalInQueue}`, inline: true }
    );

    return embed;
}

/**
 * Build queue control buttons
 */
function buildQueueControls(channelId, isMod = false) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`queue:join:${channelId}`)
            .setLabel('✋ Join Queue')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`queue:leave:${channelId}`)
            .setLabel('🚪 Leave Queue')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`queue:status:${channelId}`)
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Primary)
    );

    if (isMod) {
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`queue:next:${channelId}`)
                .setLabel('⏭️ Next Speaker')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`queue:skip:${channelId}`)
                .setLabel('⏩ Skip')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`queue:end:${channelId}`)
                .setLabel('🛑 End Queue')
                .setStyle(ButtonStyle.Danger)
        );
        return [row1, row2];
    }

    return [row1];
}

module.exports = {
    startQueue,
    endQueue,
    joinQueue,
    leaveQueue,
    nextSpeaker,
    skipSpeaker,
    getQueueStatus,
    isModerator,
    hasQueue,
    getPosition,
    buildQueueEmbed,
    buildQueueControls
};
