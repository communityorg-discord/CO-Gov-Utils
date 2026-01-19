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
                return res.status(404).send('<h1>Recording not found</h1>');
            }

            const files = fs.readdirSync(sessionPath)
                .filter(f => f.endsWith('.mp3'))
                .map(f => ({
                    filename: f,
                    url: `${this.baseUrl}/recordings/${sessionId}/${f}`,
                    size: fs.statSync(path.join(sessionPath, f)).size
                }));

            // Render HTML page
            let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Recording - ${sessionId}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; background: #1a1a2e; color: #fff; }
                    h1 { color: #00d9ff; }
                    .file { background: #16213e; padding: 15px; margin: 10px 0; border-radius: 8px; }
                    .file a { color: #00d9ff; text-decoration: none; font-size: 18px; }
                    .file a:hover { text-decoration: underline; }
                    .size { color: #888; font-size: 14px; margin-top: 5px; }
                    audio { width: 100%; margin-top: 10px; }
                </style>
            </head>
            <body>
                <h1>🎙️ Recording Files</h1>
                <p>Session: ${sessionId}</p>
            `;

            if (files.length === 0) {
                html += '<p>No audio files found yet. Recording may still be processing.</p>';
            } else {
                for (const file of files) {
                    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
                    html += `
                    <div class="file">
                        <a href="${file.url}" download>📥 ${file.filename}</a>
                        <div class="size">${sizeMB} MB</div>
                        <audio controls src="${file.url}"></audio>
                    </div>
                    `;
                }
            }

            html += '</body></html>';
            res.send(html);
        });

        // Download specific file
        this.app.get('/recordings/:sessionId/:filename', (req, res) => {
            const { sessionId, filename } = req.params;
            const filepath = path.join(this.recordingsPath, sessionId, filename);

            if (!fs.existsSync(filepath)) {
                return res.status(404).json({ error: 'File not found' });
            }

            res.download(filepath);
        });

        // Download all files as zip (simplified - sends first file for now)
        this.app.get('/recordings/:sessionId/download', (req, res) => {
            const sessionId = req.params.sessionId;
            const sessionPath = path.join(this.recordingsPath, sessionId);

            if (!fs.existsSync(sessionPath)) {
                return res.status(404).json({ error: 'Recording not found' });
            }

            const files = fs.readdirSync(sessionPath).filter(f => f.endsWith('.mp3'));
            if (files.length === 0) {
                return res.status(404).json({ error: 'No audio files found' });
            }

            // For now, redirect to files list
            // Full zip would require 'archiver' package
            res.json({
                message: 'Download individual files from the list',
                files: files.map(f => `${this.baseUrl}/recordings/${sessionId}/${f}`)
            });
        });

        // Simple landing page
        this.app.get('/', (req, res) => {
            res.send(`
                <html>
                    <head><title>CO Gov-Utils Recording Server</title></head>
                    <body style="font-family: Arial, sans-serif; padding: 20px;">
                        <h1>🎙️ Recording Server</h1>
                        <p>Use <code>/recordings/{sessionId}</code> to access recordings.</p>
                        <p><a href="/health">Health Check</a></p>
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
