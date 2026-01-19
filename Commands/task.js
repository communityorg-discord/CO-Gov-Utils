/**
 * /task - Advanced Staff Task Board
 * Full-featured task management with subtasks, comments, time tracking, labels
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const taskManager = require('../utils/taskManager');

const PRIORITY_COLORS = { urgent: 0xE74C3C, high: 0xF39C12, normal: 0x3498DB, low: 0x95A5A6 };
const CATEGORY_COLORS = { bug: 0xE74C3C, feature: 0x27AE60, docs: 0x3498DB, meeting: 0x9B59B6, general: 0x7F8C8D };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('task')
        .setDescription('📋 Advanced staff task board')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub => sub
            .setName('create')
            .setDescription('✨ Create a new task')
            .addStringOption(opt => opt.setName('title').setDescription('Task title').setRequired(true).setMaxLength(100))
            .addStringOption(opt => opt.setName('description').setDescription('Task description').setMaxLength(500))
            .addStringOption(opt => opt.setName('priority').setDescription('Priority level')
                .addChoices(
                    { name: '🔴 URGENT', value: 'urgent' },
                    { name: '🟠 HIGH', value: 'high' },
                    { name: '🔵 NORMAL', value: 'normal' },
                    { name: '⚪ LOW', value: 'low' }))
            .addStringOption(opt => opt.setName('category').setDescription('Category')
                .addChoices(
                    { name: '📋 General', value: 'general' },
                    { name: '🐛 Bug Fix', value: 'bug' },
                    { name: '✨ Feature', value: 'feature' },
                    { name: '📝 Documentation', value: 'docs' },
                    { name: '📅 Meeting', value: 'meeting' },
                    { name: '👀 Review', value: 'review' }))
            .addUserOption(opt => opt.setName('assign').setDescription('Assign to'))
            .addStringOption(opt => opt.setName('due').setDescription('Due date (YYYY-MM-DD)'))
            .addNumberOption(opt => opt.setName('estimate').setDescription('Estimated hours').setMinValue(0.5).setMaxValue(100)))
        .addSubcommand(sub => sub.setName('list').setDescription('📋 View tasks')
            .addStringOption(opt => opt.setName('filter').setDescription('Filter')
                .addChoices(
                    { name: '📋 All', value: 'all' },
                    { name: '👤 My Tasks', value: 'mine' },
                    { name: '📭 Open', value: 'open' },
                    { name: '🔨 In Progress', value: 'in_progress' },
                    { name: '✅ Done', value: 'done' },
                    { name: '🔴 Urgent', value: 'urgent' },
                    { name: '⚠️ Overdue', value: 'overdue' })))
        .addSubcommand(sub => sub.setName('view').setDescription('🔍 View task details')
            .addIntegerOption(opt => opt.setName('id').setDescription('Task ID').setRequired(true)))
        .addSubcommand(sub => sub.setName('complete').setDescription('✅ Complete a task')
            .addIntegerOption(opt => opt.setName('id').setDescription('Task ID').setRequired(true)))
        .addSubcommand(sub => sub.setName('board').setDescription('📊 Visual task board'))
        .addSubcommand(sub => sub.setName('comment').setDescription('💬 Add a comment')
            .addIntegerOption(opt => opt.setName('id').setDescription('Task ID').setRequired(true))
            .addStringOption(opt => opt.setName('text').setDescription('Comment text').setRequired(true)))
        .addSubcommand(sub => sub.setName('log').setDescription('⏱️ Log time worked')
            .addIntegerOption(opt => opt.setName('id').setDescription('Task ID').setRequired(true))
            .addNumberOption(opt => opt.setName('hours').setDescription('Hours worked').setRequired(true).setMinValue(0.25).setMaxValue(24))
            .addStringOption(opt => opt.setName('description').setDescription('What did you work on?')))
        .addSubcommand(sub => sub.setName('subtask').setDescription('📎 Add a subtask')
            .addIntegerOption(opt => opt.setName('id').setDescription('Parent task ID').setRequired(true))
            .addStringOption(opt => opt.setName('title').setDescription('Subtask title').setRequired(true)))
        .addSubcommand(sub => sub.setName('stats').setDescription('📈 Productivity stats'))
        .addSubcommand(sub => sub.setName('assign').setDescription('👤 Assign a task')
            .addIntegerOption(opt => opt.setName('id').setDescription('Task ID').setRequired(true))
            .addUserOption(opt => opt.setName('user').setDescription('User to assign').setRequired(true)))
        .addSubcommand(sub => sub.setName('delete').setDescription('🗑️ Delete a task')
            .addIntegerOption(opt => opt.setName('id').setDescription('Task ID').setRequired(true))),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'task');
        if (!perm.allowed) return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });

        const sub = interaction.options.getSubcommand();
        const handlers = {
            create: handleCreate, list: handleList, view: handleView, complete: handleComplete,
            board: handleBoard, comment: handleComment, log: handleLog, subtask: handleSubtask,
            stats: handleStats, assign: handleAssign, delete: handleDelete
        };

        return handlers[sub]?.(interaction) || interaction.reply({ content: '❌ Unknown command', ephemeral: true });
    },
    handleButton, handleSelectMenu
};

// ========== HANDLERS ==========

async function handleCreate(interaction) {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description') || '';
    const priority = interaction.options.getString('priority') || 'normal';
    const category = interaction.options.getString('category') || 'general';
    const assignTo = interaction.options.getUser('assign');
    const due = interaction.options.getString('due');
    const estimate = interaction.options.getNumber('estimate') || 0;

    const result = taskManager.createTask(interaction.guild.id, title, description, interaction.user.id, {
        priority, category, dueDate: due, estimatedHours: estimate, assignTo: assignTo?.id
    });

    if (!result.success) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });

    const embed = new EmbedBuilder()
        .setTitle('✨ Task Created')
        .setColor(PRIORITY_COLORS[priority])
        .setDescription(`**${title}**\n${description ? `\n${description}` : ''}`)
        .addFields(
            { name: '🆔', value: `\`#${result.taskId}\``, inline: true },
            { name: `${taskManager.getPriorityEmoji(priority)} Priority`, value: priority, inline: true },
            { name: `${taskManager.getCategoryEmoji(category)} Category`, value: category, inline: true }
        )
        .setFooter({ text: `Created by ${interaction.user.tag}` })
        .setTimestamp();

    if (assignTo) embed.addFields({ name: '👤 Assigned', value: `<@${assignTo.id}>`, inline: true });
    if (due) embed.addFields({ name: '📅 Due', value: due, inline: true });
    if (estimate) embed.addFields({ name: '⏱️ Estimate', value: `${estimate}h`, inline: true });

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleList(interaction) {
    const filter = interaction.options.getString('filter') || 'all';
    const tasks = taskManager.getTasks(interaction.guild.id, filter, interaction.user.id);

    if (tasks.length === 0) {
        return interaction.reply({
            embeds: [new EmbedBuilder().setTitle('📋 No Tasks').setColor(0x95A5A6).setDescription('No tasks found. Create one with `/task create`')],
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle(`📋 Tasks (${filter})`)
        .setColor(0x9B59B6)
        .setTimestamp();

    let desc = '';
    for (const task of tasks.slice(0, 15)) {
        const p = taskManager.getPriorityEmoji(task.priority);
        const s = taskManager.getStatusEmoji(task.status);
        const c = taskManager.getCategoryEmoji(task.category);
        const done = task.status === 'done' ? '~~' : '';
        const overdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done' ? ' ⚠️' : '';
        desc += `${s} \`#${task.id}\` ${p}${c} ${done}**${task.title.slice(0, 30)}**${done}${overdue}\n`;
    }

    embed.setDescription(desc);
    const counts = taskManager.getTaskCounts(interaction.guild.id);
    embed.setFooter({ text: `📭 ${counts.open} • 🔨 ${counts.in_progress} • ✅ ${counts.done}` });

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleView(interaction) {
    const taskId = interaction.options.getInteger('id');
    const task = taskManager.getTask(taskId);
    if (!task) return interaction.reply({ content: '❌ Task not found.', ephemeral: true });

    const embed = buildDetailedEmbed(task);
    const rows = buildDetailedButtons(task);

    return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
}

function buildDetailedEmbed(task) {
    const color = task.status === 'done' ? 0x27AE60 : PRIORITY_COLORS[task.priority];
    const progress = taskManager.getSubtaskProgress(task.id);

    const embed = new EmbedBuilder()
        .setTitle(`${taskManager.getStatusEmoji(task.status)} #${task.id}: ${task.title}`)
        .setColor(color)
        .setTimestamp();

    if (task.description) embed.setDescription(task.description);

    // Status row
    embed.addFields(
        { name: '📊 Status', value: task.status.replace('_', ' '), inline: true },
        { name: `${taskManager.getPriorityEmoji(task.priority)} Priority`, value: task.priority, inline: true },
        { name: `${taskManager.getCategoryEmoji(task.category)} Category`, value: task.category, inline: true }
    );

    // Assignment & dates
    embed.addFields(
        { name: '👤 Assigned', value: task.assigned_to ? `<@${task.assigned_to}>` : '*Unassigned*', inline: true },
        { name: '✍️ Created', value: `<t:${Math.floor(new Date(task.created_at).getTime() / 1000)}:R>`, inline: true }
    );

    if (task.due_date) {
        const overdue = new Date(task.due_date) < new Date() && task.status !== 'done';
        embed.addFields({ name: overdue ? '⚠️ OVERDUE' : '📅 Due', value: task.due_date, inline: true });
    }

    // Time tracking
    if (task.estimated_hours > 0 || task.logged_hours > 0) {
        const percent = task.estimated_hours > 0 ? Math.round((task.logged_hours / task.estimated_hours) * 100) : 0;
        embed.addFields({
            name: '⏱️ Time',
            value: `${task.logged_hours}h / ${task.estimated_hours}h (${percent}%)`,
            inline: true
        });
    }

    // Subtasks progress
    if (progress) {
        const bar = '█'.repeat(Math.floor(progress.percent / 10)) + '░'.repeat(10 - Math.floor(progress.percent / 10));
        embed.addFields({
            name: `📎 Subtasks (${progress.completed}/${progress.total})`,
            value: `\`${bar}\` ${progress.percent}%`,
            inline: false
        });
    }

    // Recent activity
    if (task.comments && task.comments.length > 0) {
        const recent = task.comments.slice(0, 3).map(c => {
            const time = `<t:${Math.floor(new Date(c.created_at).getTime() / 1000)}:R>`;
            const icon = c.type === 'system' ? '🔧' : c.type === 'time' ? '⏱️' : '💬';
            return `${icon} <@${c.user_id}>: ${c.content.slice(0, 50)} ${time}`;
        }).join('\n');
        embed.addFields({ name: '💬 Recent Activity', value: recent, inline: false });
    }

    // Labels
    if (task.labels && task.labels.length > 0) {
        embed.addFields({
            name: '🏷️ Labels',
            value: task.labels.map(l => `${l.emoji} ${l.name}`).join(' '),
            inline: false
        });
    }

    // Watchers
    if (task.watchers && task.watchers.length > 0) {
        embed.setFooter({ text: `👁️ ${task.watchers.length} watching` });
    }

    return embed;
}

function buildDetailedButtons(task) {
    const row1 = new ActionRowBuilder();

    if (task.status !== 'done') {
        row1.addComponents(
            new ButtonBuilder().setCustomId(`task:complete:${task.id}`).setLabel('Complete').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId(`task:claim:${task.id}`).setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('🙋')
        );
    } else {
        row1.addComponents(
            new ButtonBuilder().setCustomId(`task:reopen:${task.id}`).setLabel('Reopen').setStyle(ButtonStyle.Primary).setEmoji('🔄')
        );
    }

    row1.addComponents(
        new ButtonBuilder().setCustomId(`task:comment:${task.id}`).setLabel('Comment').setStyle(ButtonStyle.Secondary).setEmoji('💬'),
        new ButtonBuilder().setCustomId(`task:log:${task.id}`).setLabel('Log Time').setStyle(ButtonStyle.Secondary).setEmoji('⏱️'),
        new ButtonBuilder().setCustomId(`task:delete:${task.id}`).setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );

    return [row1];
}

async function handleComplete(interaction) {
    const taskId = interaction.options.getInteger('id');
    taskManager.completeTask(taskId, interaction.user.id);
    return interaction.reply({ content: `✅ Task #${taskId} completed! 🎉`, ephemeral: true });
}

async function handleComment(interaction) {
    const taskId = interaction.options.getInteger('id');
    const text = interaction.options.getString('text');
    taskManager.addComment(taskId, interaction.user.id, text);
    return interaction.reply({ content: `💬 Comment added to task #${taskId}`, ephemeral: true });
}

async function handleLog(interaction) {
    const taskId = interaction.options.getInteger('id');
    const hours = interaction.options.getNumber('hours');
    const desc = interaction.options.getString('description') || '';

    taskManager.logTime(taskId, interaction.user.id, hours, desc);

    const weeklyTotal = taskManager.getUserTimeThisWeek(interaction.guild.id, interaction.user.id);

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle('⏱️ Time Logged')
            .setColor(0x27AE60)
            .setDescription(`Logged **${hours}h** on task #${taskId}${desc ? `\n*${desc}*` : ''}`)
            .addFields({ name: '📊 Your Week', value: `${weeklyTotal.toFixed(1)}h total`, inline: true })
            .setTimestamp()],
        ephemeral: true
    });
}

async function handleSubtask(interaction) {
    const parentId = interaction.options.getInteger('id');
    const title = interaction.options.getString('title');

    const result = taskManager.createSubtask(parentId, title, interaction.user.id);
    if (!result.success) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });

    return interaction.reply({ content: `📎 Subtask #${result.taskId} added to task #${parentId}`, ephemeral: true });
}

async function handleStats(interaction) {
    const stats = taskManager.getProductivityStats(interaction.guild.id, 7);
    const contributors = taskManager.getTopContributors(interaction.guild.id, 7);
    const counts = taskManager.getTaskCounts(interaction.guild.id);
    const total = counts.open + counts.in_progress + counts.done;
    const completionRate = total > 0 ? Math.round((counts.done / total) * 100) : 0;

    const embed = new EmbedBuilder()
        .setTitle('📈 Productivity Dashboard')
        .setColor(0x9B59B6)
        .addFields(
            { name: '✅ Completed (7d)', value: String(stats.tasksCompleted), inline: true },
            { name: '📋 Created (7d)', value: String(stats.tasksCreated), inline: true },
            { name: '⏱️ Avg Days to Complete', value: String(stats.avgDaysToComplete), inline: true },
            { name: '📊 Completion Rate', value: `${completionRate}%`, inline: true },
            { name: '📭 Open', value: String(counts.open), inline: true },
            { name: '🔨 In Progress', value: String(counts.in_progress), inline: true }
        )
        .setTimestamp();

    if (contributors.length > 0) {
        let leaderboard = '';
        for (let i = 0; i < contributors.length; i++) {
            const medal = ['🥇', '🥈', '🥉'][i] || '•';
            leaderboard += `${medal} <@${contributors[i].user_id}> - **${contributors[i].count}** tasks\n`;
        }
        embed.addFields({ name: '🏆 Top Contributors (7d)', value: leaderboard, inline: false });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleAssign(interaction) {
    const taskId = interaction.options.getInteger('id');
    const user = interaction.options.getUser('user');
    taskManager.assignTask(taskId, user.id, interaction.user.id);
    return interaction.reply({ content: `👤 Task #${taskId} assigned to <@${user.id}>`, ephemeral: true });
}

async function handleDelete(interaction) {
    const taskId = interaction.options.getInteger('id');
    taskManager.deleteTask(taskId);
    return interaction.reply({ content: `🗑️ Task #${taskId} deleted.`, ephemeral: true });
}

async function handleBoard(interaction) {
    const counts = taskManager.getTaskCounts(interaction.guild.id);
    const open = taskManager.getTasks(interaction.guild.id, 'open');
    const inProgress = taskManager.getTasks(interaction.guild.id, 'in_progress');
    const done = taskManager.getTasks(interaction.guild.id, 'done');
    const overdue = taskManager.getOverdueTasks(interaction.guild.id);
    const stats = taskManager.getProductivityStats(interaction.guild.id, 7);

    const total = counts.open + counts.in_progress + counts.done;
    const rate = total > 0 ? Math.round((counts.done / total) * 100) : 0;

    const embed = new EmbedBuilder()
        .setTitle('📊 Staff Task Board')
        .setColor(0x9B59B6)
        .setDescription(`**${total}** total • **${rate}%** complete • **${stats.tasksCompleted}** done this week${overdue.length > 0 ? `\n⚠️ **${overdue.length} overdue!**` : ''}`)
        .setTimestamp();

    const fmt = (tasks, max = 5) => {
        if (!tasks.length) return '*Empty*';
        return tasks.slice(0, max).map(t =>
            `${taskManager.getPriorityEmoji(t.priority)} \`#${t.id}\` ${t.title.slice(0, 20)}`
        ).join('\n') + (tasks.length > max ? `\n*+${tasks.length - max} more*` : '');
    };

    embed.addFields(
        { name: `📭 Open (${counts.open})`, value: fmt(open), inline: true },
        { name: `🔨 In Progress (${counts.in_progress})`, value: fmt(inProgress), inline: true },
        { name: `✅ Done (${counts.done})`, value: fmt(done), inline: true }
    );

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('task:new').setLabel('New').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('task:refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
        new ButtonBuilder().setCustomId('task:my').setLabel('My Tasks').setStyle(ButtonStyle.Primary).setEmoji('👤'),
        new ButtonBuilder().setCustomId('task:stats').setLabel('Stats').setStyle(ButtonStyle.Primary).setEmoji('📈')
    );

    return interaction.reply({ embeds: [embed], components: [row1], ephemeral: true });
}

// ========== BUTTON HANDLER ==========

async function handleButton(interaction) {
    const [, action, taskId] = interaction.customId.split(':');

    try {
        switch (action) {
            case 'complete':
                taskManager.completeTask(parseInt(taskId), interaction.user.id);
                return interaction.reply({ content: `✅ Task #${taskId} completed!`, ephemeral: true });
            case 'reopen':
                taskManager.reopenTask(parseInt(taskId), interaction.user.id);
                return interaction.reply({ content: `🔄 Task #${taskId} reopened.`, ephemeral: true });
            case 'delete':
                taskManager.deleteTask(parseInt(taskId));
                return interaction.reply({ content: `🗑️ Task #${taskId} deleted.`, ephemeral: true });
            case 'claim':
                taskManager.assignTask(parseInt(taskId), interaction.user.id, interaction.user.id);
                return interaction.reply({ content: `🙋 You claimed task #${taskId}!`, ephemeral: true });
            case 'comment':
                return showCommentModal(interaction, taskId);
            case 'log':
                return showLogModal(interaction, taskId);
            case 'new':
                return showCreateModal(interaction);
            case 'refresh':
            case 'board':
                return handleBoard(interaction);
            case 'my':
                const myTasks = taskManager.getTasks(interaction.guild.id, 'mine', interaction.user.id);
                if (!myTasks.length) return interaction.reply({ content: '📋 No assigned tasks.', ephemeral: true });
                const desc = myTasks.slice(0, 10).map(t =>
                    `${taskManager.getStatusEmoji(t.status)} \`#${t.id}\` ${t.title}`
                ).join('\n');
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('👤 My Tasks').setColor(0x3498DB).setDescription(desc)], ephemeral: true });
            case 'stats':
                return handleStats(interaction);
        }
    } catch (e) {
        console.error('[Task] Button error:', e);
        return interaction.reply({ content: '❌ Error', ephemeral: true }).catch(() => { });
    }
}

async function showCreateModal(interaction) {
    const modal = new ModalBuilder().setCustomId('task:modal_create').setTitle('✨ New Task');
    modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false))
    );
    return interaction.showModal(modal);
}

async function showCommentModal(interaction, taskId) {
    const modal = new ModalBuilder().setCustomId(`task:modal_comment:${taskId}`).setTitle('💬 Add Comment');
    modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('comment').setLabel('Comment').setStyle(TextInputStyle.Paragraph).setRequired(true))
    );
    return interaction.showModal(modal);
}

async function showLogModal(interaction, taskId) {
    const modal = new ModalBuilder().setCustomId(`task:modal_log:${taskId}`).setTitle('⏱️ Log Time');
    modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hours').setLabel('Hours (e.g. 1.5)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('What did you work on?').setStyle(TextInputStyle.Short).setRequired(false))
    );
    return interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
    const [, type, taskId] = interaction.customId.split(':');

    if (type === 'modal_create') {
        const title = interaction.fields.getTextInputValue('title');
        const desc = interaction.fields.getTextInputValue('description') || '';
        const result = taskManager.createTask(interaction.guild.id, title, desc, interaction.user.id, {});
        if (result.success) return interaction.reply({ content: `✨ Task #${result.taskId} created!`, ephemeral: true });
        return interaction.reply({ content: '❌ Failed', ephemeral: true });
    }

    if (type === 'modal_comment') {
        const text = interaction.fields.getTextInputValue('comment');
        taskManager.addComment(parseInt(taskId), interaction.user.id, text);
        return interaction.reply({ content: `💬 Comment added!`, ephemeral: true });
    }

    if (type === 'modal_log') {
        const hours = parseFloat(interaction.fields.getTextInputValue('hours')) || 0;
        const desc = interaction.fields.getTextInputValue('description') || '';
        if (hours <= 0) return interaction.reply({ content: '❌ Invalid hours', ephemeral: true });
        taskManager.logTime(parseInt(taskId), interaction.user.id, hours, desc);
        return interaction.reply({ content: `⏱️ Logged ${hours}h!`, ephemeral: true });
    }
}

function handleSelectMenu(interaction) { }

module.exports.handleModalSubmit = handleModalSubmit;
