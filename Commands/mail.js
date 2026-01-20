const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const nodemailer = require('nodemailer');
const { getStaffByDiscordId, updatePassword } = require('../utils/staffManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mail')
        .setDescription('Send emails from Discord')
        .addSubcommand(sub => sub
            .setName('send')
            .setDescription('Send an email')
            .addStringOption(opt => opt
                .setName('to')
                .setDescription('Recipient email address')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('subject')
                .setDescription('Email subject')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('message')
                .setDescription('Email body')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('test')
            .setDescription('Send a test email to yourself'))
        .addSubcommand(sub => sub
            .setName('setpassword')
            .setDescription('Set your email password for sending mail')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // Check if user has linked account
        const staff = getStaffByDiscordId(interaction.user.id);
        if (!staff) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xf44336)
                        .setTitle('❌ Not Linked')
                        .setDescription('You must have a linked staff account to send mail.\nUse `/staff link` to link your email.')
                ],
                ephemeral: true
            });
        }

        const senderEmail = staff.email;

        if (subcommand === 'setpassword') {
            // Show modal to set password
            const modal = new ModalBuilder()
                .setCustomId('mail_setpassword_modal')
                .setTitle('Set Email Password');

            const passwordInput = new TextInputBuilder()
                .setCustomId('mail_password')
                .setLabel('Your mail.usgrp.xyz password')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter your email password')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(passwordInput));
            return interaction.showModal(modal);
        }

        // Check if password is stored
        if (!staff.password) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff9800)
                        .setTitle('⚠️ Password Not Set')
                        .setDescription('Your email password is not saved.\nRun `/mail setpassword` first to save your mail.usgrp.xyz password.')
                ],
                ephemeral: true
            });
        }

        if (subcommand === 'send') {
            const to = interaction.options.getString('to');
            const subject = interaction.options.getString('subject');
            const message = interaction.options.getString('message');

            await interaction.deferReply({ ephemeral: true });

            try {
                const transporter = nodemailer.createTransport({
                    host: 'mail.usgrp.xyz',
                    port: 587,
                    secure: false,
                    auth: { user: senderEmail, pass: staff.password },
                    tls: { rejectUnauthorized: false },
                });

                await transporter.sendMail({
                    from: senderEmail,
                    to,
                    subject,
                    text: message,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background: #1a2332; padding: 20px; border-radius: 8px 8px 0 0;">
                                <h2 style="color: #2196f3; margin: 0;">USGRP</h2>
                            </div>
                            <div style="background: #0f1419; padding: 24px; border-radius: 0 0 8px 8px; color: #b0bec5;">
                                <p style="white-space: pre-wrap; margin: 0; line-height: 1.6;">${message.replace(/\n/g, '<br>')}</p>
                                <hr style="border: none; border-top: 1px solid #243044; margin: 24px 0;" />
                                <p style="font-size: 12px; color: #78909c; margin: 0;">
                                    Sent via Discord by ${interaction.user.username}
                                </p>
                            </div>
                        </div>
                    `,
                });

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x4caf50)
                            .setTitle('✅ Email Sent')
                            .setDescription(`Your email has been delivered.`)
                            .addFields(
                                { name: 'From', value: senderEmail, inline: true },
                                { name: 'To', value: to, inline: true },
                                { name: 'Subject', value: subject }
                            )
                            .setTimestamp()
                    ]
                });
            } catch (error) {
                console.error('Mail error:', error);
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xf44336)
                            .setTitle('❌ Failed to Send')
                            .setDescription(`Could not deliver email: ${error.message}\n\nIf your password changed, run \`/mail setpassword\` to update it.`)
                    ]
                });
            }
        }

        if (subcommand === 'test') {
            await interaction.deferReply({ ephemeral: true });

            try {
                const transporter = nodemailer.createTransport({
                    host: 'mail.usgrp.xyz',
                    port: 587,
                    secure: false,
                    auth: { user: senderEmail, pass: staff.password },
                    tls: { rejectUnauthorized: false },
                });

                await transporter.sendMail({
                    from: senderEmail,
                    to: senderEmail,
                    subject: 'Test Email from USGRP Discord',
                    text: `This is a test email sent from Discord by ${interaction.user.username}.`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background: #1a2332; padding: 20px; border-radius: 8px 8px 0 0;">
                                <h2 style="color: #2196f3; margin: 0;">USGRP Test Email</h2>
                            </div>
                            <div style="background: #0f1419; padding: 24px; border-radius: 0 0 8px 8px; color: #b0bec5;">
                                <p>This is a test email sent from Discord.</p>
                                <p>If you received this, your email is working correctly!</p>
                                <hr style="border: none; border-top: 1px solid #243044; margin: 24px 0;" />
                                <p style="font-size: 12px; color: #78909c; margin: 0;">
                                    Sent by ${interaction.user.username}
                                </p>
                            </div>
                        </div>
                    `,
                });

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x4caf50)
                            .setTitle('✅ Test Email Sent')
                            .setDescription(`A test email was sent to **${senderEmail}**.\nCheck your inbox!`)
                            .setTimestamp()
                    ]
                });
            } catch (error) {
                console.error('Mail test error:', error);
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xf44336)
                            .setTitle('❌ Test Failed')
                            .setDescription(`Could not send test email: ${error.message}\n\nIf your password changed, run \`/mail setpassword\` to update it.`)
                    ]
                });
            }
        }
    },

    // Handle modal submissions
    async handleModal(interaction) {
        if (interaction.customId === 'mail_setpassword_modal') {
            const password = interaction.fields.getTextInputValue('mail_password');
            const staff = getStaffByDiscordId(interaction.user.id);

            if (!staff) {
                return interaction.reply({
                    content: '❌ You are not linked to any staff account.',
                    ephemeral: true
                });
            }

            // Test the password first
            try {
                const transporter = nodemailer.createTransport({
                    host: 'mail.usgrp.xyz',
                    port: 587,
                    secure: false,
                    auth: { user: staff.email, pass: password },
                    tls: { rejectUnauthorized: false },
                });

                await transporter.verify();

                // Password works, save it
                updatePassword(interaction.user.id, password);

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x4caf50)
                            .setTitle('✅ Password Saved')
                            .setDescription(`Your email password has been saved.\nYou can now use \`/mail send\` and \`/mail test\`.`)
                    ],
                    ephemeral: true
                });
            } catch (error) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xf44336)
                            .setTitle('❌ Invalid Password')
                            .setDescription(`Could not authenticate with that password.\nPlease check your mail.usgrp.xyz password and try again.`)
                    ],
                    ephemeral: true
                });
            }
        }
    }
};
