/**
 * Recording Download Server
 * Simple Express server to serve recording downloads
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

class RecordingServer {
    constructor() {
        this.app = express();
        this.port = process.env.RECORDING_SERVER_PORT || 3000;
        this.recordingsPath = path.join(__dirname, '..', 'data', 'recordings');
        this.baseUrl = process.env.RECORDING_BASE_URL || `http://localhost:${this.port}`;
        this.server = null;

        this._setupRoutes();
    }

    _setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        // List recordings for a session
        this.app.get('/recordings/:sessionId', (req, res) => {
            const sessionId = req.params.sessionId;
            const sessionPath = path.join(this.recordingsPath, sessionId);

            if (!fs.existsSync(sessionPath)) {
                return res.status(404).send('<h1 style="color:#fff;font-family:sans-serif;text-align:center;margin-top:100px;">Recording not found</h1>');
            }

            const files = fs.readdirSync(sessionPath)
                .filter(f => f.endsWith('.mp3'))
                .map(f => {
                    const stats = fs.statSync(path.join(sessionPath, f));
                    // Extract username from filename (userId-timestamp.mp3 -> userId)
                    const userId = f.split('-')[0];
                    return {
                        filename: f,
                        userId,
                        url: `${this.baseUrl}/recordings/${sessionId}/${f}`,
                        size: stats.size,
                        created: stats.mtime
                    };
                });

            // Premium HTML page
            let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎙️ Voice Recording</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            min-height: 100vh;
            background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%);
            color: #fff;
            padding: 40px 20px;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            margin-bottom: 40px;
        }

        .header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            background: linear-gradient(135deg, #00d9ff 0%, #9b59b6 50%, #ff6b6b 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 10px;
        }

        .header .subtitle {
            color: #888;
            font-size: 0.9rem;
        }

        .stats {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-bottom: 40px;
        }

        .stat {
            background: rgba(255,255,255,0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 20px 30px;
            text-align: center;
        }

        .stat-value {
            font-size: 2rem;
            font-weight: 700;
            color: #00d9ff;
        }

        .stat-label {
            font-size: 0.85rem;
            color: #888;
            margin-top: 5px;
        }

        .files-grid {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .file-card {
            background: rgba(255,255,255,0.03);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 20px;
            padding: 24px;
            transition: all 0.3s ease;
        }

        .file-card:hover {
            background: rgba(255,255,255,0.06);
            border-color: rgba(0, 217, 255, 0.3);
            transform: translateY(-2px);
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }

        .file-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .file-info h3 {
            font-size: 1.1rem;
            font-weight: 600;
            color: #fff;
            margin-bottom: 4px;
        }

        .file-meta {
            font-size: 0.8rem;
            color: #666;
        }

        .download-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: linear-gradient(135deg, #00d9ff, #0099ff);
            color: #fff;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.3s ease;
        }

        .download-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 10px 30px rgba(0, 217, 255, 0.4);
        }

        .mix-btn {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            background: linear-gradient(135deg, #9b59b6, #e74c3c);
            color: #fff;
            text-decoration: none;
            padding: 18px 40px;
            border-radius: 16px;
            font-weight: 700;
            font-size: 1.1rem;
            transition: all 0.3s ease;
            box-shadow: 0 10px 40px rgba(155, 89, 182, 0.3);
        }

        .mix-btn:hover {
            transform: scale(1.05) translateY(-2px);
            box-shadow: 0 20px 50px rgba(155, 89, 182, 0.5);
        }

        audio {
            width: 100%;
            height: 50px;
            border-radius: 12px;
            outline: none;
        }

        audio::-webkit-media-controls-panel {
            background: rgba(255,255,255,0.1);
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #666;
        }

        .empty-state .icon {
            font-size: 4rem;
            margin-bottom: 20px;
            opacity: 0.5;
        }

        .footer {
            text-align: center;
            margin-top: 60px;
            color: #444;
            font-size: 0.8rem;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .recording-indicator {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(255, 107, 107, 0.2);
            border: 1px solid rgba(255, 107, 107, 0.3);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.85rem;
            color: #ff6b6b;
        }

        .recording-indicator .dot {
            width: 8px;
            height: 8px;
            background: #ff6b6b;
            border-radius: 50%;
            animation: pulse 1.5s infinite;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎙️ Voice Recording</h1>
            <p class="subtitle">Session ID: ${sessionId}</p>
        </div>

        <div class="stats">
            <div class="stat">
                <div class="stat-value">${files.length}</div>
                <div class="stat-label">Audio Tracks</div>
            </div>
            <div class="stat">
                <div class="stat-value">${(files.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(1)} MB</div>
                <div class="stat-label">Total Size</div>
            </div>
        </div>

        ${files.length > 0 ? `
        <div style="text-align: center; margin-bottom: 40px;">
            <a href="${this.baseUrl}/recordings/${sessionId}/mix" class="mix-btn">
                🎚️ Mix & Download Combined
            </a>
            <p style="color: #666; font-size: 0.85rem; margin-top: 12px;">
                Combines all tracks into one conversation recording
            </p>
        </div>
        ` : ''}

        <div class="files-grid">
`;

            if (files.length === 0) {
                html += `
            <div class="empty-state">
                <div class="icon">🎧</div>
                <p>No audio files found yet.</p>
                <p style="margin-top:10px;font-size:0.9rem;">Recording may still be processing...</p>
            </div>
`;
            } else {
                for (const file of files) {
                    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
                    html += `
            <div class="file-card">
                <div class="file-header">
                    <div class="file-info">
                        <h3>🎤 Speaker ${file.userId.slice(-4)}</h3>
                        <span class="file-meta">${sizeMB} MB • ${file.filename}</span>
                    </div>
                    <a href="${file.url}" download class="download-btn">
                        <span>⬇️</span> Download
                    </a>
                </div>
                <audio controls src="${file.url}" preload="metadata"></audio>
            </div>
`;
                }
            }

            html += `
        </div>

        <div class="footer">
            <p>USGRP Voice Recording System • Powered by CO Gov-Utils</p>
        </div>
    </div>
</body>
</html>
`;
            res.send(html);
        });

        // Download specific file
        this.app.get('/recordings/:sessionId/:filename', (req, res) => {
            const { sessionId, filename } = req.params;

            // Skip "mix" - that's handled by the mix endpoint
            if (filename === 'mix') {
                return this._handleMix(req, res);
            }

            const filepath = path.join(this.recordingsPath, sessionId, filename);

            if (!fs.existsSync(filepath)) {
                return res.status(404).json({ error: 'File not found' });
            }

            res.download(filepath);
        });

        // Mix and download combined audio
        this.app.get('/recordings/:sessionId/mix', async (req, res) => {
            await this._handleMix(req, res);
        });

        // Landing page
        this._setupLandingPage();
    }

    async _handleMix(req, res) {
        const sessionId = req.params.sessionId;
        const sessionPath = path.join(this.recordingsPath, sessionId);

        if (!fs.existsSync(sessionPath)) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        // Check if already mixed
        const combinedPath = path.join(sessionPath, 'combined.mp3');
        if (fs.existsSync(combinedPath)) {
            return res.download(combinedPath, 'recording-mixed.mp3');
        }

        // Check if there are PCM files to mix
        const pcmFiles = fs.readdirSync(sessionPath).filter(f => f.endsWith('.pcm'));
        if (pcmFiles.length === 0) {
            return res.status(400).json({ error: 'No audio tracks to mix. Already processed or no audio recorded.' });
        }

        try {
            const audioProcessor = require('./audioProcessor');
            const mixedFile = await audioProcessor.mergeToSingleTrack(sessionPath, 'combined.mp3');

            if (mixedFile) {
                res.download(mixedFile, 'recording-mixed.mp3');
            } else {
                res.status(500).json({ error: 'Failed to create mixed audio' });
            }
        } catch (error) {
            console.error('[RecordingServer] Mix error:', error);
            res.status(500).json({ error: `Mix failed: ${error.message}` });
        }
    }

    _setupLandingPage() {
        // Simple landing page
        this.app.get('/', (req, res) => {
            res.send(`
                <html>
                    <head><title>CO Gov-Utils Recording Server</title></head>
                    <body style="font-family: Arial, sans-serif; padding: 20px; background: #0f0f23; color: #fff;">
                        <h1>🎙️ Recording Server</h1>
                        <p>Use <code>/recordings/{sessionId}</code> to access recordings.</p>
                        <p><a href="/health" style="color: #00d9ff;">Health Check</a></p>
                    </body>
                </html>
            `);
        });
    }

    /**
     * Start the recording server
     */
    start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    console.log(`[RecordingServer] Started on port ${this.port}`);
                    console.log(`[RecordingServer] Base URL: ${this.baseUrl}`);
                    resolve();
                });
            } catch (error) {
                console.error('[RecordingServer] Failed to start:', error);
                reject(error);
            }
        });
    }

    /**
     * Stop the server
     */
    stop() {
        if (this.server) {
            this.server.close();
            console.log('[RecordingServer] Stopped');
        }
    }

    /**
     * Get download URL for a session
     */
    getDownloadUrl(sessionId) {
        return `${this.baseUrl}/recordings/${sessionId}`;
    }
}

module.exports = new RecordingServer();
