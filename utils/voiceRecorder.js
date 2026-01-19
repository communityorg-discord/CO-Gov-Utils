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
        this.activeRecordings = new Map(); // guildId -> recording session
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

        if (this.activeRecordings.has(guildId)) {
            return { success: false, error: 'Already recording in this server' };
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
            autoStopTimer: null
        };

        // Set up auto-stop timer (6 hours)
        session.autoStopTimer = setTimeout(() => {
            this.stopRecording(guildId, 'Auto-stopped after 6 hours');
        }, session.maxDuration);

        // Listen for users speaking
        session.receiver.speaking.on('start', (userId) => {
            this._handleUserSpeaking(session, userId);
        });

        this.activeRecordings.set(guildId, session);

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

        // Play TTS announcement
        await this._playTTSAnnouncement(connection, 'Recording has started');

        console.log(`[VoiceRecorder] Started recording in ${voiceChannel.name} (${sessionId})`);

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

        const audioStream = session.receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 1000 // End stream after 1 second of silence
            }
        });

        const filename = `${userId}-${Date.now()}.pcm`;
        const filepath = path.join(session.sessionPath, filename);
        const writeStream = createWriteStream(filepath);

        // Pipe the opus audio through decoder to PCM
        const opusDecoder = new prism.opus.Decoder({
            frameSize: 960,
            channels: 2,
            rate: 48000
        });

        pipeline(audioStream, opusDecoder, writeStream, (err) => {
            if (err) {
                console.log(`[VoiceRecorder] Stream error for ${userId}:`, err.message);
            }
        });

        session.userStreams.set(userId, writeStream);
        session.userFiles.push({ userId, filename, filepath });

        console.log(`[VoiceRecorder] Recording user ${userId}`);
    }

    /**
     * Stop recording
     */
    async stopRecording(guildId, reason = 'Stopped by user') {
        const session = this.activeRecordings.get(guildId);
        if (!session) {
            return { success: false, error: 'No active recording in this server' };
        }

        // Clear auto-stop timer
        if (session.autoStopTimer) {
            clearTimeout(session.autoStopTimer);
        }

        // Stop all user streams
        for (const [userId, stream] of session.userStreams) {
            stream.end();
        }

        // Play TTS announcement
        await this._playTTSAnnouncement(session.connection, 'Recording stopped');

        // Wait a moment for TTS to play
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Reset nickname
        try {
            const guild = session.connection.joinConfig.guildId;
            const botMember = session.connection.joinConfig.guild?.members?.me;
            // Nickname reset happens after disconnect
        } catch (e) {
            // Ignore
        }

        // Disconnect
        session.connection.destroy();

        // Calculate duration
        const duration = Date.now() - session.startedAt;
        const durationStr = this._formatDuration(duration);

        this.activeRecordings.delete(guildId);

        console.log(`[VoiceRecorder] Stopped recording ${session.id} (${reason})`);

        return {
            success: true,
            sessionId: session.id,
            sessionPath: session.sessionPath,
            duration: durationStr,
            fileCount: session.userFiles.length,
            reason
        };
    }

    /**
     * Get recording status
     */
    getStatus(guildId) {
        const session = this.activeRecordings.get(guildId);
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
     * Play TTS announcement
     */
    async _playTTSAnnouncement(connection, text) {
        // Note: Full TTS requires Google TTS API or similar
        // For now, we'll skip the actual audio and just log
        console.log(`[VoiceRecorder] TTS: "${text}"`);
        // Future: Implement with @google-cloud/text-to-speech or similar
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
}

module.exports = new VoiceRecorder();
