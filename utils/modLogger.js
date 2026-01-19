/**
 * Moderation Logger - Comprehensive Event Logging
 * Logs all server events to designated log channel
 */

const { EmbedBuilder, AuditLogEvent } = require('discord.js');

// Default log channel - all logs go here
const DEFAULT_LOG_CHANNEL = '1462299339173920828';

const ACTION_COLORS = {
  // Mod actions
  warn: 0xF39C12,
  mute: 0xE67E22,
  unmute: 0x27AE60,
  kick: 0xE74C3C,
  ban: 0xC0392B,
  unban: 0x2ECC71,
  timeout: 0xE67E22,
  investigation: 0x9B59B6,
  fire: 0x7F8C8D,
  assign: 0x3498DB,
  // Message events
  messageDelete: 0xE74C3C,
  messageBulkDelete: 0xC0392B,
  messageEdit: 0xF39C12,
  // Member events
  memberJoin: 0x27AE60,
  memberLeave: 0xE74C3C,
  memberUpdate: 0x3498DB,
  // Voice events
  voiceJoin: 0x27AE60,
  voiceLeave: 0xE74C3C,
  voiceMove: 0x3498DB,
  // Role events
  roleCreate: 0x27AE60,
  roleDelete: 0xE74C3C,
  roleUpdate: 0xF39C12,
  roleGiven: 0x27AE60,
  roleRemoved: 0xE74C3C,
  // Channel events
  channelCreate: 0x27AE60,
  channelDelete: 0xE74C3C,
  channelUpdate: 0xF39C12,
  // Thread events
  threadCreate: 0x27AE60,
  threadDelete: 0xE74C3C,
  // Server events
  serverUpdate: 0x3498DB,
  boost: 0xF47FFF,
  unboost: 0x7F8C8D,
  // Invite events
  inviteCreate: 0x27AE60,
  inviteDelete: 0xE74C3C
};

const ACTION_EMOJIS = {
  warn: '⚠️', mute: '🔇', unmute: '🔊', kick: '👢', ban: '🔨', unban: '✅',
  timeout: '⏰', investigation: '🔍', fire: '🔥', assign: '📋',
  messageDelete: '🗑️', messageBulkDelete: '🗑️', messageEdit: '✏️',
  memberJoin: '📥', memberLeave: '📤', memberUpdate: '👤',
  voiceJoin: '🔊', voiceLeave: '🔇', voiceMove: '🔀',
  roleCreate: '🏷️', roleDelete: '🏷️', roleUpdate: '🏷️', roleGiven: '➕', roleRemoved: '➖',
  channelCreate: '📁', channelDelete: '📁', channelUpdate: '📁',
  threadCreate: '🧵', threadDelete: '🧵',
  serverUpdate: '⚙️', boost: '💎', unboost: '💔',
  inviteCreate: '🔗', inviteDelete: '🔗'
};

/**
 * Send log to the designated channel
 */
async function sendLog(client, embed) {
  try {
    const channel = await client.channels.fetch(DEFAULT_LOG_CHANNEL);
    if (channel) await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('[ModLogger] Send log error:', e.message);
  }
}

// ============================================================
// MESSAGE EVENTS
// ============================================================

async function logMessageDelete(client, message) {
  if (!message.guild || message.author?.bot) return;

  const content = message.content || '*No text content*';
  const embed = new EmbedBuilder()
    .setTitle('🗑️ Message Deleted')
    .setColor(ACTION_COLORS.messageDelete)
    .setDescription(content.length > 1000 ? content.substring(0, 1000) + '...' : content)
    .addFields(
      { name: '👤 Author', value: message.author ? `<@${message.author.id}>\n${message.author.tag}` : 'Unknown', inline: true },
      { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: '🆔 Message ID', value: message.id, inline: true }
    )
    .setTimestamp();

  if (message.attachments.size > 0) {
    embed.addFields({ name: '📎 Attachments', value: message.attachments.map(a => a.name).join(', '), inline: false });
  }

  await sendLog(client, embed);
}

async function logMessageBulkDelete(client, messages, channel) {
  const embed = new EmbedBuilder()
    .setTitle('🗑️ Bulk Message Delete')
    .setColor(ACTION_COLORS.messageBulkDelete)
    .setDescription(`**${messages.size}** messages were deleted`)
    .addFields(
      { name: '📍 Channel', value: `<#${channel.id}>`, inline: true },
      { name: '📊 Count', value: String(messages.size), inline: true }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

async function logMessageEdit(client, oldMessage, newMessage) {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  const embed = new EmbedBuilder()
    .setTitle('✏️ Message Edited')
    .setColor(ACTION_COLORS.messageEdit)
    .addFields(
      { name: '👤 Author', value: `<@${newMessage.author.id}>`, inline: true },
      { name: '📍 Channel', value: `<#${newMessage.channel.id}>`, inline: true },
      { name: '🔗 Jump', value: `[Click](${newMessage.url})`, inline: true },
      { name: '📝 Before', value: (oldMessage.content || '*Empty*').substring(0, 500), inline: false },
      { name: '📝 After', value: (newMessage.content || '*Empty*').substring(0, 500), inline: false }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

// ============================================================
// MEMBER EVENTS
// ============================================================

async function logMemberJoin(client, member) {
  const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
  const isNew = accountAge < 7;

  const embed = new EmbedBuilder()
    .setTitle('📥 Member Joined')
    .setColor(ACTION_COLORS.memberJoin)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '👤 User', value: `<@${member.id}>\n${member.user.tag}`, inline: true },
      { name: '🆔 ID', value: member.id, inline: true },
      { name: '📅 Account Age', value: `${accountAge}d${isNew ? ' ⚠️' : ''}`, inline: true },
      { name: '👥 Members', value: String(member.guild.memberCount), inline: true }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

async function logMemberLeave(client, member) {
  const roles = member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.name).slice(0, 10).join(', ') || 'None';

  const embed = new EmbedBuilder()
    .setTitle('📤 Member Left')
    .setColor(ACTION_COLORS.memberLeave)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '👤 User', value: `<@${member.id}>\n${member.user.tag}`, inline: true },
      { name: '🆔 ID', value: member.id, inline: true },
      { name: '📅 Joined', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
      { name: '🎭 Roles', value: roles.substring(0, 200), inline: false }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

async function logMemberUpdate(client, oldMember, newMember) {
  // Nickname change
  if (oldMember.nickname !== newMember.nickname) {
    const embed = new EmbedBuilder()
      .setTitle('👤 Nickname Changed')
      .setColor(ACTION_COLORS.memberUpdate)
      .addFields(
        { name: '👤 User', value: `<@${newMember.id}>`, inline: true },
        { name: '📝 Before', value: oldMember.nickname || '*None*', inline: true },
        { name: '📝 After', value: newMember.nickname || '*None*', inline: true }
      )
      .setTimestamp();
    await sendLog(client, embed);
  }

  // Role changes
  const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

  if (addedRoles.size > 0) {
    const embed = new EmbedBuilder()
      .setTitle('➕ Role Added')
      .setColor(ACTION_COLORS.roleGiven)
      .addFields(
        { name: '👤 User', value: `<@${newMember.id}>`, inline: true },
        { name: '🏷️ Role(s)', value: addedRoles.map(r => r.name).join(', '), inline: true }
      )
      .setTimestamp();
    await sendLog(client, embed);
  }

  if (removedRoles.size > 0) {
    const embed = new EmbedBuilder()
      .setTitle('➖ Role Removed')
      .setColor(ACTION_COLORS.roleRemoved)
      .addFields(
        { name: '👤 User', value: `<@${newMember.id}>`, inline: true },
        { name: '🏷️ Role(s)', value: removedRoles.map(r => r.name).join(', '), inline: true }
      )
      .setTimestamp();
    await sendLog(client, embed);
  }

  // Timeout (communication disabled)
  if (!oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil) {
    const embed = new EmbedBuilder()
      .setTitle('⏰ Member Timed Out')
      .setColor(ACTION_COLORS.timeout)
      .addFields(
        { name: '👤 User', value: `<@${newMember.id}>`, inline: true },
        { name: '⏱️ Until', value: `<t:${Math.floor(newMember.communicationDisabledUntil.getTime() / 1000)}:F>`, inline: true }
      )
      .setTimestamp();
    await sendLog(client, embed);
  } else if (oldMember.communicationDisabledUntil && !newMember.communicationDisabledUntil) {
    const embed = new EmbedBuilder()
      .setTitle('✅ Timeout Removed')
      .setColor(ACTION_COLORS.unmute)
      .addFields(
        { name: '👤 User', value: `<@${newMember.id}>`, inline: true }
      )
      .setTimestamp();
    await sendLog(client, embed);
  }

  // Boost status change
  if (!oldMember.premiumSince && newMember.premiumSince) {
    const embed = new EmbedBuilder()
      .setTitle('💎 Server Boost!')
      .setColor(ACTION_COLORS.boost)
      .setDescription(`<@${newMember.id}> just boosted the server!`)
      .addFields({ name: '🚀 Boost Level', value: String(newMember.guild.premiumTier), inline: true })
      .setTimestamp();
    await sendLog(client, embed);
  } else if (oldMember.premiumSince && !newMember.premiumSince) {
    const embed = new EmbedBuilder()
      .setTitle('💔 Boost Removed')
      .setColor(ACTION_COLORS.unboost)
      .setDescription(`<@${newMember.id}> removed their boost`)
      .setTimestamp();
    await sendLog(client, embed);
  }
}

// ============================================================
// VOICE EVENTS
// ============================================================

async function logVoiceStateUpdate(client, oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member) return;

  // Joined voice
  if (!oldState.channel && newState.channel) {
    const embed = new EmbedBuilder()
      .setTitle('🔊 Joined Voice')
      .setColor(ACTION_COLORS.voiceJoin)
      .addFields(
        { name: '👤 User', value: `<@${member.id}>`, inline: true },
        { name: '🔊 Channel', value: `<#${newState.channel.id}>`, inline: true }
      )
      .setTimestamp();
    await sendLog(client, embed);
  }
  // Left voice
  else if (oldState.channel && !newState.channel) {
    const embed = new EmbedBuilder()
      .setTitle('🔇 Left Voice')
      .setColor(ACTION_COLORS.voiceLeave)
      .addFields(
        { name: '👤 User', value: `<@${member.id}>`, inline: true },
        { name: '🔊 Channel', value: `<#${oldState.channel.id}>`, inline: true }
      )
      .setTimestamp();
    await sendLog(client, embed);
  }
  // Moved channels
  else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
    const embed = new EmbedBuilder()
      .setTitle('🔀 Moved Voice Channel')
      .setColor(ACTION_COLORS.voiceMove)
      .addFields(
        { name: '👤 User', value: `<@${member.id}>`, inline: true },
        { name: '📤 From', value: `<#${oldState.channel.id}>`, inline: true },
        { name: '📥 To', value: `<#${newState.channel.id}>`, inline: true }
      )
      .setTimestamp();
    await sendLog(client, embed);
  }
}

// ============================================================
// CHANNEL EVENTS
// ============================================================

async function logChannelCreate(client, channel) {
  if (!channel.guild) return;

  const embed = new EmbedBuilder()
    .setTitle('📁 Channel Created')
    .setColor(ACTION_COLORS.channelCreate)
    .addFields(
      { name: '📍 Channel', value: `<#${channel.id}>`, inline: true },
      { name: '📋 Name', value: channel.name, inline: true },
      { name: '📂 Type', value: String(channel.type), inline: true }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

async function logChannelDelete(client, channel) {
  if (!channel.guild) return;

  const embed = new EmbedBuilder()
    .setTitle('📁 Channel Deleted')
    .setColor(ACTION_COLORS.channelDelete)
    .addFields(
      { name: '📋 Name', value: channel.name, inline: true },
      { name: '📂 Type', value: String(channel.type), inline: true }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

async function logChannelUpdate(client, oldChannel, newChannel) {
  if (!newChannel.guild) return;

  const changes = [];
  if (oldChannel.name !== newChannel.name) changes.push(`Name: ${oldChannel.name} → ${newChannel.name}`);
  if (oldChannel.topic !== newChannel.topic) changes.push(`Topic changed`);
  if (oldChannel.nsfw !== newChannel.nsfw) changes.push(`NSFW: ${newChannel.nsfw}`);

  if (changes.length === 0) return;

  const embed = new EmbedBuilder()
    .setTitle('📁 Channel Updated')
    .setColor(ACTION_COLORS.channelUpdate)
    .addFields(
      { name: '📍 Channel', value: `<#${newChannel.id}>`, inline: true },
      { name: '📝 Changes', value: changes.join('\n'), inline: false }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

// ============================================================
// ROLE EVENTS
// ============================================================

async function logRoleCreate(client, role) {
  const embed = new EmbedBuilder()
    .setTitle('🏷️ Role Created')
    .setColor(role.color || ACTION_COLORS.roleCreate)
    .addFields(
      { name: '🏷️ Role', value: role.name, inline: true },
      { name: '🆔 ID', value: role.id, inline: true }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

async function logRoleDelete(client, role) {
  const embed = new EmbedBuilder()
    .setTitle('🏷️ Role Deleted')
    .setColor(ACTION_COLORS.roleDelete)
    .addFields(
      { name: '🏷️ Role', value: role.name, inline: true },
      { name: '🆔 ID', value: role.id, inline: true }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

async function logRoleUpdate(client, oldRole, newRole) {
  const changes = [];
  if (oldRole.name !== newRole.name) changes.push(`Name: ${oldRole.name} → ${newRole.name}`);
  if (oldRole.color !== newRole.color) changes.push(`Color changed`);
  if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push(`Permissions changed`);

  if (changes.length === 0) return;

  const embed = new EmbedBuilder()
    .setTitle('🏷️ Role Updated')
    .setColor(newRole.color || ACTION_COLORS.roleUpdate)
    .addFields(
      { name: '🏷️ Role', value: newRole.name, inline: true },
      { name: '📝 Changes', value: changes.join('\n'), inline: false }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

// ============================================================
// THREAD EVENTS
// ============================================================

async function logThreadCreate(client, thread) {
  const embed = new EmbedBuilder()
    .setTitle('🧵 Thread Created')
    .setColor(ACTION_COLORS.threadCreate)
    .addFields(
      { name: '🧵 Thread', value: `<#${thread.id}>`, inline: true },
      { name: '📋 Name', value: thread.name, inline: true },
      { name: '📍 Parent', value: thread.parent ? `<#${thread.parent.id}>` : 'Unknown', inline: true }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

async function logThreadDelete(client, thread) {
  const embed = new EmbedBuilder()
    .setTitle('🧵 Thread Deleted')
    .setColor(ACTION_COLORS.threadDelete)
    .addFields(
      { name: '📋 Name', value: thread.name, inline: true }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

// ============================================================
// INVITE EVENTS
// ============================================================

async function logInviteCreate(client, invite) {
  const embed = new EmbedBuilder()
    .setTitle('🔗 Invite Created')
    .setColor(ACTION_COLORS.inviteCreate)
    .addFields(
      { name: '🔗 Code', value: invite.code, inline: true },
      { name: '👤 Creator', value: invite.inviter ? `<@${invite.inviter.id}>` : 'Unknown', inline: true },
      { name: '📍 Channel', value: invite.channel ? `<#${invite.channel.id}>` : 'Unknown', inline: true },
      { name: '⏱️ Expires', value: invite.expiresAt ? `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:R>` : 'Never', inline: true }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

async function logInviteDelete(client, invite) {
  const embed = new EmbedBuilder()
    .setTitle('🔗 Invite Deleted')
    .setColor(ACTION_COLORS.inviteDelete)
    .addFields(
      { name: '🔗 Code', value: invite.code, inline: true },
      { name: '📍 Channel', value: invite.channel ? `<#${invite.channel.id}>` : 'Unknown', inline: true }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

// ============================================================
// BAN EVENTS
// ============================================================

async function logGuildBanAdd(client, ban) {
  const embed = new EmbedBuilder()
    .setTitle('🔨 Member Banned')
    .setColor(ACTION_COLORS.ban)
    .addFields(
      { name: '👤 User', value: `<@${ban.user.id}>\n${ban.user.tag}`, inline: true },
      { name: '📝 Reason', value: ban.reason || 'No reason provided', inline: false }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

async function logGuildBanRemove(client, ban) {
  const embed = new EmbedBuilder()
    .setTitle('✅ Member Unbanned')
    .setColor(ACTION_COLORS.unban)
    .addFields(
      { name: '👤 User', value: `<@${ban.user.id}>\n${ban.user.tag}`, inline: true }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

// ============================================================
// SERVER EVENTS
// ============================================================

async function logGuildUpdate(client, oldGuild, newGuild) {
  const changes = [];
  if (oldGuild.name !== newGuild.name) changes.push(`Name: ${oldGuild.name} → ${newGuild.name}`);
  if (oldGuild.icon !== newGuild.icon) changes.push('Icon changed');
  if (oldGuild.banner !== newGuild.banner) changes.push('Banner changed');
  if (oldGuild.verificationLevel !== newGuild.verificationLevel) changes.push('Verification level changed');

  if (changes.length === 0) return;

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Server Updated')
    .setColor(ACTION_COLORS.serverUpdate)
    .addFields(
      { name: '📝 Changes', value: changes.join('\n'), inline: false }
    )
    .setTimestamp();

  await sendLog(client, embed);
}

// ============================================================
// MOD ACTION LOGGING (for cases)
// ============================================================

async function logModAction(client, guildId, caseData, action = null) {
  const actionType = action || caseData.action_type;
  const emoji = ACTION_EMOJIS[actionType] || '📋';

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} Case ${caseData.case_id}`)
    .setColor(ACTION_COLORS[actionType] || 0x95A5A6)
    .addFields(
      { name: 'Action', value: actionType.toUpperCase(), inline: true },
      { name: 'User', value: `<@${caseData.user_id}>`, inline: true },
      { name: 'Moderator', value: `<@${caseData.moderator_id}>`, inline: true }
    )
    .setTimestamp();

  if (caseData.reason) embed.addFields({ name: 'Reason', value: caseData.reason, inline: false });
  if (caseData.duration) embed.addFields({ name: 'Duration', value: formatDuration(caseData.duration), inline: true });

  await sendLog(client, embed);
}

function formatDuration(minutes) {
  if (!minutes) return 'Permanent';
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || 'Permanent';
}

module.exports = {
  // Message events
  logMessageDelete,
  logMessageBulkDelete,
  logMessageEdit,
  // Member events
  logMemberJoin,
  logMemberLeave,
  logMemberUpdate,
  // Voice events
  logVoiceStateUpdate,
  // Channel events
  logChannelCreate,
  logChannelDelete,
  logChannelUpdate,
  // Role events
  logRoleCreate,
  logRoleDelete,
  logRoleUpdate,
  // Thread events
  logThreadCreate,
  logThreadDelete,
  // Invite events
  logInviteCreate,
  logInviteDelete,
  // Ban events
  logGuildBanAdd,
  logGuildBanRemove,
  // Server events
  logGuildUpdate,
  // Mod actions
  logModAction,
  formatDuration,
  ACTION_COLORS,
  ACTION_EMOJIS,
  DEFAULT_LOG_CHANNEL
};
