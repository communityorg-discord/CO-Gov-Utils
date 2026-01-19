/**
 * Purge Command
 * Bulk delete messages from a channel (supports up to 1000 in batches of 100)
 * Creates HTML transcript before deletion
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  AttachmentBuilder
} = require('discord.js');
const transcriptGenerator = require('../utils/transcriptGenerator');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages from a channel (up to 1000)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('Number of messages to delete (1-1000)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000))
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Only delete messages from this user')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('contains')
        .setDescription('Only delete messages containing this text')
        .setRequired(false))
    .addBooleanOption(opt =>
      opt.setName('bots')
        .setDescription('Only delete messages from bots')
        .setRequired(false))
    .addBooleanOption(opt =>
      opt.setName('attachments')
        .setDescription('Only delete messages with attachments')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for the purge (logged)')
        .setRequired(false)),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const amount = interaction.options.getInteger('amount');
      const targetUser = interaction.options.getUser('user');
      const containsText = interaction.options.getString('contains');
      const botsOnly = interaction.options.getBoolean('bots');
      const attachmentsOnly = interaction.options.getBoolean('attachments');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      const channel = interaction.channel;
      const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);

      // Filter function for messages
      const shouldDelete = (msg) => {
        // Messages older than 14 days cannot be bulk deleted
        if (msg.createdTimestamp < twoWeeksAgo) return false;
        // Filter by user
        if (targetUser && msg.author.id !== targetUser.id) return false;
        // Filter by text content
        if (containsText && !msg.content.toLowerCase().includes(containsText.toLowerCase())) return false;
        // Filter by bots only
        if (botsOnly && !msg.author.bot) return false;
        // Filter by attachments
        if (attachmentsOnly && msg.attachments.size === 0) return false;
        return true;
      };

      // Progress update
      await interaction.editReply({
        content: `🔄 Collecting messages to purge (up to ${amount})...`
      });

      // PHASE 1: COLLECT ALL MESSAGES FIRST
      const messagesToDelete = [];
      let remaining = amount;
      let batchCount = 0;
      const maxBatches = Math.ceil(amount / 100) + 5;
      let lastMessageId = null;

      while (remaining > 0 && batchCount < maxBatches) {
        batchCount++;

        const fetchOptions = { limit: 100 };
        if (lastMessageId) fetchOptions.before = lastMessageId;

        let messages;
        try {
          messages = await channel.messages.fetch(fetchOptions);
        } catch (e) {
          console.error('[Purge] Fetch error:', e.message);
          break;
        }

        if (messages.size === 0) break;

        lastMessageId = messages.last()?.id;

        // Filter and collect messages
        const filtered = messages.filter(msg => shouldDelete(msg));
        for (const msg of filtered.values()) {
          if (messagesToDelete.length >= amount) break;
          messagesToDelete.push(msg);
        }

        // Check if all fetched messages are too old
        const allTooOld = messages.every(msg => msg.createdTimestamp < twoWeeksAgo);
        if (allTooOld) break;

        if (messagesToDelete.length >= amount) break;
      }

      if (messagesToDelete.length === 0) {
        return interaction.editReply({
          content: '❌ No messages found matching your criteria (messages must be less than 14 days old).'
        });
      }

      // PHASE 2: GENERATE TRANSCRIPT BEFORE DELETION
      await interaction.editReply({
        content: `📝 Generating transcript of ${messagesToDelete.length} messages...`
      });

      const transcriptHtml = transcriptGenerator.generateTranscript(messagesToDelete, {
        guildName: interaction.guild.name,
        channelName: channel.name,
        moderator: interaction.user.tag,
        reason: reason
      });

      const timestamp = Date.now();
      const transcriptFilename = `purge_${channel.id}_${timestamp}.html`;
      const transcriptPath = transcriptGenerator.saveTranscript(transcriptHtml, transcriptFilename);

      // PHASE 3: DELETE MESSAGES
      await interaction.editReply({
        content: `🗑️ Deleting ${messagesToDelete.length} messages...`
      });

      let totalDeleted = 0;
      const batches = [];

      // Split into batches of 100
      for (let i = 0; i < messagesToDelete.length; i += 100) {
        batches.push(messagesToDelete.slice(i, i + 100));
      }

      for (let i = 0; i < batches.length; i++) {
        try {
          const deleted = await channel.bulkDelete(batches[i], true);
          totalDeleted += deleted.size;

          if (i % 2 === 0 && i < batches.length - 1) {
            await interaction.editReply({
              content: `🗑️ Deleting... ${totalDeleted}/${messagesToDelete.length}`
            }).catch(() => { });
          }

          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          console.error('[Purge] Bulk delete error:', e.message);
        }
      }

      // Build summary
      const filterDetails = [];
      if (targetUser) filterDetails.push(`From: <@${targetUser.id}>`);
      if (containsText) filterDetails.push(`Contains: "${containsText}"`);
      if (botsOnly) filterDetails.push('Bots only');
      if (attachmentsOnly) filterDetails.push('With attachments');

      const embed = new EmbedBuilder()
        .setTitle('🗑️ Messages Purged')
        .setColor(0xE74C3C)
        .setDescription(`Successfully deleted **${totalDeleted}** message(s).\nTranscript has been saved.`)
        .addFields(
          { name: '📍 Channel', value: `<#${channel.id}>`, inline: true },
          { name: '👤 Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📝 Reason', value: reason, inline: false }
        )
        .setTimestamp();

      if (filterDetails.length > 0) {
        embed.addFields({ name: '🔍 Filters', value: filterDetails.join('\n'), inline: false });
      }

      await interaction.editReply({ embeds: [embed] });

      // PHASE 4: LOG TO AUDIT CHANNEL WITH TRANSCRIPT
      try {
        const { getAuditChannelId } = require('../utils/auditLogger');
        const { DEFAULT_LOG_CHANNEL } = require('../utils/modLogger');

        // Try audit channel first, fallback to default log channel
        let auditChannelId = getAuditChannelId(interaction.guildId);
        if (!auditChannelId) {
          auditChannelId = DEFAULT_LOG_CHANNEL;
        }

        if (auditChannelId) {
          const auditChannel = await interaction.client.channels.fetch(auditChannelId).catch(() => null);
          if (auditChannel) {
            const logEmbed = new EmbedBuilder()
              .setTitle('🗑️ Mass Purge Executed')
              .setColor(0xE74C3C)
              .setDescription(`**${totalDeleted}** messages were purged. Transcript attached.`)
              .addFields(
                { name: '📍 Channel', value: `<#${channel.id}>`, inline: true },
                { name: '👤 Moderator', value: `${interaction.user.tag}\n\`${interaction.user.id}\``, inline: true },
                { name: '🎯 Requested', value: `${amount} messages`, inline: true },
                { name: '📝 Reason', value: reason, inline: false }
              )
              .setTimestamp();

            if (filterDetails.length > 0) {
              logEmbed.addFields({ name: '🔍 Filters', value: filterDetails.join('\n'), inline: false });
            }

            // Create attachment from transcript
            const attachment = new AttachmentBuilder(transcriptPath, { name: transcriptFilename });

            await auditChannel.send({
              embeds: [logEmbed],
              files: [attachment]
            });

            console.log(`[Purge] Transcript sent to ${auditChannelId}`);
          }
        }
      } catch (e) {
        console.error('[Purge] Audit log failed:', e.message);
      }

    } catch (error) {
      console.error('[Purge] Error:', error);
      const reply = interaction.deferred || interaction.replied ? interaction.editReply : interaction.reply;
      return reply.call(interaction, {
        content: `❌ An error occurred: ${error.message}`,
        ephemeral: true
      });
    }
  }
};
