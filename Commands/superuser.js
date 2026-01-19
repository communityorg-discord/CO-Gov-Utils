/**
 * /superuser - Manage superusers (add/remove)
 * Only superusers can use this command
 * Hardcoded superusers cannot be removed
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { 
  isSuperuser,
  isHardcodedSuperuser,
  addSuperuser,
  removeSuperuser,
  getAllSuperusers,
  buildPermissionDeniedEmbed,
  logCommand,
  dmSuperusers
} = require('../utils/advancedPermissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('superuser')
    .setDescription('Manage superusers')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a new superuser')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to add as superuser')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for adding')))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a superuser')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to remove from superusers')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for removal')))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all superusers')),

  async execute(interaction) {
    // Only superusers can manage superusers
    if (!isSuperuser(interaction.user.id)) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed('superuser', 'SUPERUSER', false)],
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'add':
        return handleAdd(interaction);
      case 'remove':
        return handleRemove(interaction);
      case 'list':
        return handleList(interaction);
    }
  }
};

async function handleAdd(interaction) {
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  // Check if already a superuser
  if (isHardcodedSuperuser(target.id)) {
    return interaction.reply({
      content: '❌ This user is already a hardcoded superuser.',
      ephemeral: true
    });
  }

  const result = addSuperuser(target.id, target.tag, interaction.user.id, interaction.user.tag);

  if (!result.success) {
    return interaction.reply({
      content: `❌ ${result.error}`,
      ephemeral: true
    });
  }

  // Log the action
  logCommand(
    interaction.guild?.id || 'DM',
    interaction.user.id,
    interaction.user.tag,
    'superuser',
    'add',
    target.id,
    target.tag,
    { reason },
    'success'
  );

  const embed = new EmbedBuilder()
    .setTitle('⭐ Superuser Added')
    .setColor(0x2ECC71)
    .addFields(
      { name: 'User', value: `${target} (${target.tag})`, inline: true },
      { name: 'Added By', value: `${interaction.user.tag}`, inline: true },
      { name: 'Reason', value: reason, inline: false }
    )
    .setTimestamp();

  // DM the new superuser
  try {
    const dmEmbed = new EmbedBuilder()
      .setTitle('⭐ You Are Now a Superuser')
      .setColor(0x2ECC71)
      .setDescription('You have been granted superuser permissions for CO | Government Utilities.')
      .addFields(
        { name: 'Granted By', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason, inline: false }
      )
      .setTimestamp();
    
    await target.send({ embeds: [dmEmbed] });
  } catch (e) {}

  // Notify other superusers
  const logEmbed = new EmbedBuilder()
    .setTitle('📋 Superuser Log')
    .setColor(0x3498DB)
    .setDescription(`**${interaction.user.tag}** added **${target.tag}** as a superuser`)
    .addFields({ name: 'Reason', value: reason })
    .setTimestamp();

  await dmSuperusers(interaction.client, logEmbed);

  return interaction.reply({ embeds: [embed] });
}

async function handleRemove(interaction) {
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  // Check if hardcoded
  if (isHardcodedSuperuser(target.id)) {
    return interaction.reply({
      content: '❌ Cannot remove hardcoded superusers. They are protected.',
      ephemeral: true
    });
  }

  const result = removeSuperuser(target.id, interaction.user.id);

  if (!result.success) {
    return interaction.reply({
      content: `❌ ${result.error}`,
      ephemeral: true
    });
  }

  // Log the action
  logCommand(
    interaction.guild?.id || 'DM',
    interaction.user.id,
    interaction.user.tag,
    'superuser',
    'remove',
    target.id,
    target.tag,
    { reason },
    'success'
  );

  const embed = new EmbedBuilder()
    .setTitle('⭐ Superuser Removed')
    .setColor(0xE74C3C)
    .addFields(
      { name: 'User', value: `${target} (${target.tag})`, inline: true },
      { name: 'Removed By', value: `${interaction.user.tag}`, inline: true },
      { name: 'Reason', value: reason, inline: false }
    )
    .setTimestamp();

  // DM the removed superuser
  try {
    const dmEmbed = new EmbedBuilder()
      .setTitle('⭐ Superuser Status Revoked')
      .setColor(0xE74C3C)
      .setDescription('Your superuser permissions for CO | Government Utilities have been revoked.')
      .addFields(
        { name: 'Revoked By', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason, inline: false }
      )
      .setTimestamp();
    
    await target.send({ embeds: [dmEmbed] });
  } catch (e) {}

  // Notify other superusers
  const logEmbed = new EmbedBuilder()
    .setTitle('📋 Superuser Log')
    .setColor(0xE74C3C)
    .setDescription(`**${interaction.user.tag}** removed **${target.tag}** from superusers`)
    .addFields({ name: 'Reason', value: reason })
    .setTimestamp();

  await dmSuperusers(interaction.client, logEmbed);

  return interaction.reply({ embeds: [embed] });
}

async function handleList(interaction) {
  await interaction.deferReply();

  const superusers = getAllSuperusers();
  const client = interaction.client;

  const fields = [];

  // Hardcoded superusers
  const hardcodedList = [];
  for (const userId of superusers.hardcoded) {
    try {
      const user = await client.users.fetch(userId);
      hardcodedList.push(`${user.tag} (\`${userId}\`)`);
    } catch (e) {
      hardcodedList.push(`<@${userId}> (\`${userId}\`)`);
    }
  }

  fields.push({
    name: '🔒 Hardcoded Superusers',
    value: hardcodedList.join('\n') || 'None',
    inline: false
  });

  // Dynamic superusers
  const dynamicList = [];
  for (const userId of superusers.dynamic) {
    try {
      const user = await client.users.fetch(userId);
      dynamicList.push(`${user.tag} (\`${userId}\`)`);
    } catch (e) {
      dynamicList.push(`<@${userId}> (\`${userId}\`)`);
    }
  }

  fields.push({
    name: '⭐ Dynamic Superusers',
    value: dynamicList.length > 0 ? dynamicList.join('\n') : 'None added',
    inline: false
  });

  const embed = new EmbedBuilder()
    .setTitle('⭐ Superuser List')
    .setColor(0x3498DB)
    .addFields(fields)
    .setFooter({ text: `Total: ${superusers.all.length} superusers` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}
