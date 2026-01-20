const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const nodemailer = require('nodemailer');
const { getStaffByDiscordId } = require('../utils/staffManager');

// SMTP Configuration from environment
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

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
            .setDescription('Send a test email to yourself')),

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

        if (subcommand === 'send') {
            const to = interaction.options.getString('to');
            const subject = interaction.options.getString('subject');
            const message = interaction.options.getString('message');

            await interaction.deferReply({ ephemeral: true });

            try {
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
                                    Sent via Discord by ${interaction.user.username}<br />
                                    From: ${senderEmail}
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
                                { name: 'To', value: to, inline: true },
                                { name: 'Subject', value: subject, inline: true }
                            )
                            .setFooter({ text: `Sent from ${senderEmail}` })
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
                            .setDescription(`Could not deliver email: ${error.message}`)
                    ]
                });
            }
        }

        if (subcommand === 'test') {
            await interaction.deferReply({ ephemeral: true });

            try {
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
                                <p>If you received this, your email configuration is working correctly!</p>
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
                            .setDescription(`Could not send test email: ${error.message}`)
                    ]
                });
            }
        }
    }
};
