/**
 * /dm and /massdm - Direct Message Commands
 * Send DMs to individual users or multiple users
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Send direct messages to users')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub
      .setName('send')
      .setDescription('Send a DM to a specific user')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('User to DM')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('message')
        .setDescription('Message to send')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('title')
        .setDescription('Embed title (optional)')
        .setRequired(false))
      .addBooleanOption(opt => opt
        .setName('anonymous')
        .setDescription('Hide sender info')
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('mass')
      .setDescription('Send a DM to multiple users')
      .addStringOption(opt => opt
        .setName('message')
        .setDescription('Message to send')
        .setRequired(true))
      .addRoleOption(opt => opt
        .setName('role')
        .setDescription('Send to users with this role')
        .setRequired(false))
      .addStringOption(opt => opt
        .setName('title')
        .setDescription('Embed title (optional)')
        .setRequired(false))
      .addBooleanOption(opt => opt
        .setName('exclude_bots')
        .setDescription('Exclude bots (default: true)')
        .setRequired(false))
      .addBooleanOption(opt => opt
        .setName('confirm')
        .setDescription('Skip confirmation (dangerous)')
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('preview')
      .setDescription('Preview a DM before sending')
      .addStringOption(opt => opt
        .setName('message')
        .setDescription('Message to preview')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('title')
        .setDescription('Embed title (optional)')
        .setRequired(false))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    
    switch (sub) {
      case 'send': return handleSend(interaction);
      case 'mass': return handleMass(interaction);
      case 'preview': return handlePreview(interaction);
    }
  },

  handleButton
};

async function handleSend(interaction) {
  const user = interaction.options.getUser('user');
  const message = interaction.options.getString('message');
  const title = interaction.options.getString('title');
  const anonymous = interaction.options.getBoolean('anonymous') || false;
  
  if (user.bot) {
    return interaction.reply({
      content: '❌ Cannot send DMs to bots.',
      ephemeral: true
    });
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const embed = new EmbedBuilder()
      .setColor(0x002868)
      .setDescription(message)
      .setTimestamp();
    
    if (title) embed.setTitle(title);
    
    if (!anonymous) {
      embed.setFooter({ 
        text: `Sent by ${interaction.user.tag} from ${interaction.guild.name}`,
        iconURL: interaction.guild.iconURL()
      });
    } else {
      embed.setFooter({ 
        text: `Message from ${interaction.guild.name}`,
        iconURL: interaction.guild.iconURL()
      });
    }
    
    await user.send({ embeds: [embed] });
    
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ DM Sent Successfully')
      .setColor(0x00FF00)
      .addFields(
        { name: '👤 Recipient', value: `${user.tag} (${user.id})`, inline: true },
        { name: '📝 Message', value: message.substring(0, 100) + (message.length > 100 ? '...' : ''), inline: false }
      )
      .setTimestamp();
    
    return interaction.editReply({ embeds: [successEmbed] });
    
  } catch (error) {
    return interaction.editReply({
      content: `❌ Failed to send DM to ${user.tag}. They may have DMs disabled.\n\`${error.message}\``
    });
  }
}

async function handleMass(interaction) {
  const message = interaction.options.getString('message');
  const role = interaction.options.getRole('role');
  const title = interaction.options.getString('title');
  const excludeBots = interaction.options.getBoolean('exclude_bots') ?? true;
  const skipConfirm = interaction.options.getBoolean('confirm') || false;
  
  await interaction.deferReply({ ephemeral: true });
  
  // Get target members
  await interaction.guild.members.fetch();
  
  let targetMembers;
  if (role) {
    targetMembers = interaction.guild.members.cache.filter(m => 
      m.roles.cache.has(role.id) && (!excludeBots || !m.user.bot)
    );
  } else {
    targetMembers = interaction.guild.members.cache.filter(m => 
      !excludeBots || !m.user.bot
    );
  }
  
  const count = targetMembers.size;
  
  if (count === 0) {
    return interaction.editReply({ content: '❌ No members found matching criteria.' });
  }
  
  if (count > 100 && !skipConfirm) {
    const confirmEmbed = new EmbedBuilder()
      .setTitle('⚠️ Mass DM Confirmation Required')
      .setColor(0xFFA500)
      .setDescription(`You are about to send a DM to **${count}** members.\n\nThis action will take approximately **${Math.ceil(count / 30)}** minutes due to rate limits.`)
      .addFields(
        { name: '📝 Message Preview', value: message.substring(0, 500), inline: false },
        { name: '🎯 Target', value: role ? `Members with ${role.name}` : 'All members', inline: true }
      );
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`dm:confirm_mass:${role?.id || 'all'}`)
        .setLabel(`Send to ${count} Members`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji('📧'),
      new ButtonBuilder()
        .setCustomId('dm:cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );
    
    // Store message data temporarily
    if (!interaction.client.massDmQueue) interaction.client.massDmQueue = new Map();
    interaction.client.massDmQueue.set(interaction.user.id, { message, title, role, excludeBots });
    
    return interaction.editReply({ embeds: [confirmEmbed], components: [row] });
  }
  
  // Execute mass DM
  return executeMassDM(interaction, targetMembers, message, title);
}

async function executeMassDM(interaction, targetMembers, message, title) {
  const results = { sent: 0, failed: 0, errors: [] };
  
  const progressEmbed = new EmbedBuilder()
    .setTitle('📧 Sending Mass DM...')
    .setColor(0xFFD700)
    .setDescription(`Sending to ${targetMembers.size} members. Please wait...`)
    .addFields({ name: 'Progress', value: '0%', inline: true });
  
  await interaction.editReply({ embeds: [progressEmbed], components: [] });
  
  const embed = new EmbedBuilder()
    .setColor(0x002868)
    .setDescription(message)
    .setFooter({ 
      text: `Message from ${interaction.guild.name}`,
      iconURL: interaction.guild.iconURL()
    })
    .setTimestamp();
  
  if (title) embed.setTitle(title);
  
  let processed = 0;
  const total = targetMembers.size;
  
  for (const [, member] of targetMembers) {
    try {
      await member.send({ embeds: [embed] });
      results.sent++;
    } catch (error) {
      results.failed++;
      if (results.errors.length < 10) {
        results.errors.push(`${member.user.tag}: ${error.message}`);
      }
    }
    
    processed++;
    
    // Update progress every 10 members
    if (processed % 10 === 0 || processed === total) {
      const percent = Math.round((processed / total) * 100);
      progressEmbed.spliceFields(0, 1, { 
        name: 'Progress', 
        value: `${percent}% (${processed}/${total})`, 
        inline: true 
      });
      await interaction.editReply({ embeds: [progressEmbed] }).catch(() => {});
    }
    
    // Rate limit: 1 DM per second
    await new Promise(r => setTimeout(r, 1000));
  }
  
  const completeEmbed = new EmbedBuilder()
    .setTitle('✅ Mass DM Complete')
    .setColor(results.failed > 0 ? 0xFFA500 : 0x00FF00)
    .addFields(
      { name: '✅ Sent', value: results.sent.toString(), inline: true },
      { name: '❌ Failed', value: results.failed.toString(), inline: true },
      { name: '📊 Total', value: total.toString(), inline: true }
    )
    .setTimestamp();
  
  if (results.errors.length > 0) {
    completeEmbed.addFields({
      name: '⚠️ Errors',
      value: results.errors.slice(0, 5).join('\n'),
      inline: false
    });
  }
  
  return interaction.editReply({ embeds: [completeEmbed], components: [] });
}

async function handlePreview(interaction) {
  const message = interaction.options.getString('message');
  const title = interaction.options.getString('title');
  
  const embed = new EmbedBuilder()
    .setColor(0x002868)
    .setDescription(message)
    .setFooter({ 
      text: `Message from ${interaction.guild.name}`,
      iconURL: interaction.guild.iconURL()
    })
    .setTimestamp();
  
  if (title) embed.setTitle(title);
  
  const previewEmbed = new EmbedBuilder()
    .setTitle('👁️ DM Preview')
    .setColor(0x3498DB)
    .setDescription('This is how the DM will appear to recipients:');
  
  return interaction.reply({ 
    embeds: [previewEmbed, embed], 
    ephemeral: true 
  });
}

async function handleButton(interaction) {
  const [, action, param] = interaction.customId.split(':');
  
  if (action === 'cancel') {
    return interaction.update({
      content: '❌ Mass DM cancelled.',
      embeds: [],
      components: []
    });
  }
  
  if (action === 'confirm_mass') {
    const data = interaction.client.massDmQueue?.get(interaction.user.id);
    if (!data) {
      return interaction.reply({
        content: '❌ Session expired. Please run the command again.',
        ephemeral: true
      });
    }
    
    await interaction.deferUpdate();
    
    // Get target members
    await interaction.guild.members.fetch();
    
    let targetMembers;
    if (data.role) {
      const role = interaction.guild.roles.cache.get(data.role.id || param);
      targetMembers = interaction.guild.members.cache.filter(m => 
        m.roles.cache.has(role?.id || param) && (!data.excludeBots || !m.user.bot)
      );
    } else {
      targetMembers = interaction.guild.members.cache.filter(m => 
        !data.excludeBots || !m.user.bot
      );
    }
    
    interaction.client.massDmQueue.delete(interaction.user.id);
    
    return executeMassDM(interaction, targetMembers, data.message, data.title);
  }
}
