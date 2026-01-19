/**
 * Voice Recorder Manager
 * Handles multi-track voice recording with per-user audio streams
 */

const {
    joinVoiceChannel,
    VoiceConnectionStatus,
    entersState,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    EndBehaviorType
} = require('@discordjs/voice');
const { createWriteStream, mkdirSync, existsSync } = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const prism = require('prism-media');

class VoiceRecorder {
    constructor() {
        this.activeRecordings = new Map(); // channelId -> recording session (supports multi-VC)
        this.recordingsPath = path.join(__dirname, '..', 'data', 'recordings');

        // Ensure recordings directory exists
        if (!existsSync(this.recordingsPath)) {
            mkdirSync(this.recordingsPath, { recursive: true });
        }
    }

    /**
     * Start recording a voice channel
     */
    async startRecording(voiceChannel, textChannel, startedBy) {
        const guildId = voiceChannel.guild.id;
        const channelId = voiceChannel.id;

        if (this.activeRecordings.has(channelId)) {
            return { success: false, error: 'Already recording this channel' };
        }

        // Create session directory
        const sessionId = `${guildId}-${Date.now()}`;
        const sessionPath = path.join(this.recordingsPath, sessionId);
        mkdirSync(sessionPath, { recursive: true });

        // Join the voice channel
        console.log(`[VoiceRecorder] Attempting to join ${voiceChannel.name} (${voiceChannel.id})`);

        let connection;
        try {
            connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: false, // Need to hear audio
                selfMute: true
            });
        } catch (joinError) {
            console.error('[VoiceRecorder] Failed to create connection:', joinError);
            return { success: false, error: `Connection create failed: ${joinError.message}` };
        }

        // Add connection event listeners for debugging
        connection.on('stateChange', (oldState, newState) => {
            console.log(`[VoiceRecorder] Connection state: ${oldState.status} -> ${newState.status}`);
        });

        connection.on('error', (error) => {
            console.error('[VoiceRecorder] Connection error:', error);
        });

        try {
            // Wait for connection to be ready
            console.log('[VoiceRecorder] Waiting for Ready state...');
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
            console.log('[VoiceRecorder] Connection is Ready!');
        } catch (error) {
            console.error('[VoiceRecorder] Failed to reach Ready state:', error);
            connection.destroy();
            return { success: false, error: `Failed to join voice channel: ${error.message}` };
        }

        // Create recording session
        const session = {
            id: sessionId,
            guildId,
            channelId: voiceChannel.id,
            textChannelId: textChannel.id,
            startedBy: startedBy.id,
            startedAt: Date.now(),
            connection,
            receiver: connection.receiver,
            userStreams: new Map(), // userId -> write stream
            userFiles: [], // list of recorded files
            sessionPath,
            maxDuration: 6 * 60 * 60 * 1000, // 6 hours
            autoStopTimer: null,
            guild: voiceChannel.guild, // Store guild for nickname restore
            originalNickname: null
        };

        // Set up auto-stop timer (6 hours)
        session.autoStopTimer = setTimeout(() => {
            this.stopRecording(channelId, 'Auto-stopped after 6 hours');
        }, session.maxDuration);

        // Listen for users speaking
        session.receiver.speaking.on('start', (userId) => {
            this._handleUserSpeaking(session, userId);
        });

        this.activeRecordings.set(channelId, session);

        // Change bot nickname
        try {
            const botMember = voiceChannel.guild.members.me;
            if (botMember && botMember.manageable) {
                session.originalNickname = botMember.nickname;
                await botMember.setNickname('🔴 Recording');
            }
        } catch (e) {
            console.log('[VoiceRecorder] Could not change nickname:', e.message);
        }

        // Store voice channel for join/leave announcements
        session.voiceChannel = voiceChannel;

        // Count current members (excluding bots)
        const memberCount = voiceChannel.members.filter(m => !m.user.bot).size;

        // Play TTS announcement with people count
        await this._playTTSAnnouncement(connection, `The recording has now started with ${memberCount} people in the voice channel`);

        console.log(`[VoiceRecorder] Started recording in ${voiceChannel.name} (${sessionId}) with ${memberCount} people`);

        return {
            success: true,
            sessionId,
            channelName: voiceChannel.name
        };
    }

    /**
     * Handle a user starting to speak
     */
    _handleUserSpeaking(session, userId) {
        if (session.userStreams.has(userId)) {
            return; // Already recording this user
        }

        // Calculate offset from recording start (for proper mixing later)
        const offsetMs = Date.now() - session.startedAt;

        const audioStream = session.receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.Manual // Keep recording until we manually stop
            }
        });

        // One file per user (no timestamp - just userId)
        const filename = `${userId}.pcm`;
        const filepath = path.join(session.sessionPath, filename);
        const writeStream = createWriteStream(filepath);

        // Pipe the opus audio through decoder to PCM
        const opusDecoder = new prism.opus.Decoder({
            frameSize: 960,
            channels: 2,
            rate: 48000
        });

        pipeline(audioStream, opusDecoder, writeStream, (err) => {
            if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
                console.log(`[VoiceRecorder] Stream error for ${userId}:`, err.message);
            }
        });

        session.userStreams.set(userId, { writeStream, audioStream, opusDecoder });
        session.userFiles.push({ userId, filename, filepath, offsetMs });

        console.log(`[VoiceRecorder] Recording user ${userId} (offset: ${offsetMs}ms)`);
    }

    /**
     * Stop recording
     */
    async stopRecording(channelId, reason = 'Stopped by user') {
        const session = this.activeRecordings.get(channelId);
        if (!session) {
            return { success: false, error: 'No active recording in this channel' };
        }

        // Clear auto-stop timer
        if (session.autoStopTimer) {
            clearTimeout(session.autoStopTimer);
        }

        // Stop all user streams
        for (const [userId, streams] of session.userStreams) {
            try {
                if (streams.audioStream) streams.audioStream.destroy();
                if (streams.writeStream) streams.writeStream.end();
            } catch (e) {
                console.log(`[VoiceRecorder] Error closing stream for ${userId}:`, e.message);
            }
        }

        // Play TTS announcement
        await this._playTTSAnnouncement(session.connection, 'Recording stopped');

        // Wait a moment for TTS to play
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Reset nickname before disconnecting
        try {
            if (session.guild && session.originalNickname !== undefined) {
                const botMember = session.guild.members.me;
                if (botMember && botMember.manageable) {
                    await botMember.setNickname(session.originalNickname);
                    console.log(`[VoiceRecorder] Nickname restored to: ${session.originalNickname || '(none)'}`);
                }
            }
        } catch (e) {
            console.log('[VoiceRecorder] Could not restore nickname:', e.message);
        }

        // Disconnect
        session.connection.destroy();

        // Calculate duration
        const duration = Date.now() - session.startedAt;
        const durationStr = this._formatDuration(duration);

        // Save metadata for mixing (offset info)
        const metadata = {
            sessionId: session.id,
            duration: duration,
            durationStr: durationStr,
            startedAt: session.startedAt,
            tracks: session.userFiles.map(f => ({
                userId: f.userId,
                filename: f.filename,
                offsetMs: f.offsetMs
            }))
        };

        const fs = require('fs');
        fs.writeFileSync(
            path.join(session.sessionPath, 'metadata.json'),
            JSON.stringify(metadata, null, 2)
        );

        this.activeRecordings.delete(channelId);

        console.log(`[VoiceRecorder] Stopped recording ${session.id} (${reason})`);

        return {
            success: true,
            sessionId: session.id,
            sessionPath: session.sessionPath,
            duration: durationStr,
            fileCount: session.userFiles.length,
            userFiles: session.userFiles,
            reason
        };
    }

    /**
     * Get recording status
     */
    getStatus(channelId) {
        const session = this.activeRecordings.get(channelId);
        if (!session) {
            return null;
        }

        const duration = Date.now() - session.startedAt;
        const remaining = session.maxDuration - duration;

        return {
            sessionId: session.id,
            duration: this._formatDuration(duration),
            remaining: this._formatDuration(remaining),
            usersRecorded: session.userStreams.size,
            filesCreated: session.userFiles.length,
            startedAt: new Date(session.startedAt).toISOString()
        };
    }

    /**
     * Play TTS announcement using Google TTS API
     */
    async _playTTSAnnouncement(connection, text) {
        try {
            const https = require('https');
            const fs = require('fs');
            const os = require('os');

            // Use Google Translate TTS (free)
            // Voice: en-GB (British English - closest to Welsh accent available)
            const encodedText = encodeURIComponent(text);
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=${encodedText}`;

            // Download TTS audio to temp file
            const tempFile = path.join(os.tmpdir(), `tts-${Date.now()}.mp3`);

            await new Promise((resolve, reject) => {
                const file = fs.createWriteStream(tempFile);
                https.get(ttsUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                }, (response) => {
                    if (response.statusCode === 302 || response.statusCode === 301) {
                        // Follow redirect
                        https.get(response.headers.location, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                            }
                        }, (res) => {
                            res.pipe(file);
                            file.on('finish', () => {
                                file.close();
                                resolve();
                            });
                        }).on('error', reject);
                    } else {
                        response.pipe(file);
                        file.on('finish', () => {
                            file.close();
                            resolve();
                        });
                    }
                }).on('error', reject);
            });

            // Check if file was created and has content
            if (!fs.existsSync(tempFile) || fs.statSync(tempFile).size < 100) {
                console.log('[VoiceRecorder] TTS file not created or too small, skipping audio');
                return;
            }

            // Create audio player and play the TTS
            const player = createAudioPlayer();
            const resource = createAudioResource(tempFile);

            connection.subscribe(player);
            player.play(resource);

            // Wait for audio to finish
            await new Promise((resolve) => {
                player.on(AudioPlayerStatus.Idle, () => {
                    // Cleanup temp file
                    try { fs.unlinkSync(tempFile); } catch (e) { }
                    resolve();
                });
                player.on('error', (error) => {
                    console.error('[VoiceRecorder] TTS playback error:', error);
                    try { fs.unlinkSync(tempFile); } catch (e) { }
                    resolve();
                });
                // Timeout after 10 seconds
                setTimeout(() => {
                    try { fs.unlinkSync(tempFile); } catch (e) { }
                    resolve();
                }, 10000);
            });

            console.log(`[VoiceRecorder] TTS played: "${text}"`);
        } catch (error) {
            console.error('[VoiceRecorder] TTS error:', error.message);
        }
    }

    /**
     * Format duration in human-readable format
     */
    _formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    }

    /**
     * Handle voice state changes for join/leave announcements
     * Call this from your voiceStateUpdate event handler
     */
    async handleVoiceStateChange(oldState, newState) {
        // Check if there's an active recording in this guild
        const guildId = newState.guild?.id || oldState.guild?.id;
        if (!guildId) return;

        const session = this.activeRecordings.get(guildId);
        if (!session) return;

        // Ignore bots
        if (newState.member?.user?.bot || oldState.member?.user?.bot) return;

        const channelId = session.voiceChannel?.id;
        if (!channelId) return;

        // Get display name
        const displayName = newState.member?.displayName || oldState.member?.displayName || 'Someone';

        // User joined the recording channel
        if (newState.channelId === channelId && oldState.channelId !== channelId) {
            console.log(`[VoiceRecorder] ${displayName} joined recording channel`);
            await this._playTTSAnnouncement(session.connection, `${displayName} has joined the voice channel`);
        }

        // User left the recording channel
        else if (oldState.channelId === channelId && newState.channelId !== channelId) {
            console.log(`[VoiceRecorder] ${displayName} left recording channel`);
            await this._playTTSAnnouncement(session.connection, `${displayName} has left the voice channel`);
        }
    }
}

module.exports = new VoiceRecorder();
