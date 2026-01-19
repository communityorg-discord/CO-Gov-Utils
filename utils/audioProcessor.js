/**
 * Audio Processor
 * Converts raw PCM audio files to MP3 format
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class AudioProcessor {
    /**
     * Convert PCM file to MP3
     */
    async convertToMp3(pcmPath, outputPath) {
        return new Promise((resolve, reject) => {
            // Use ffmpeg to convert PCM to MP3
            const ffmpeg = spawn('ffmpeg', [
                '-y', // Overwrite output
                '-f', 's16le', // Input format: signed 16-bit little-endian
                '-ar', '48000', // Sample rate
                '-ac', '2', // Stereo
                '-i', pcmPath, // Input file
                '-b:a', '128k', // Bitrate
                outputPath // Output file
            ]);

            let stderr = '';
            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve(outputPath);
                } else {
                    reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
                }
            });

            ffmpeg.on('error', (err) => {
                reject(new Error(`Failed to start ffmpeg: ${err.message}`));
            });
        });
    }

    /**
     * Process all PCM files in a recording session
     */
    async processSession(sessionPath, userMap = {}) {
        const files = fs.readdirSync(sessionPath).filter(f => f.endsWith('.pcm'));
        const results = [];

        for (const file of files) {
            const pcmPath = path.join(sessionPath, file);
            const mp3Filename = file.replace('.pcm', '.mp3');
            const mp3Path = path.join(sessionPath, mp3Filename);

            try {
                await this.convertToMp3(pcmPath, mp3Path);

                // Delete the PCM file to save space
                fs.unlinkSync(pcmPath);

                // Extract user ID from filename
                const userId = file.split('-')[0];
                const username = userMap[userId] || `User-${userId}`;

                results.push({
                    userId,
                    username,
                    filename: mp3Filename,
                    filepath: mp3Path,
                    size: fs.statSync(mp3Path).size
                });
            } catch (error) {
                console.error(`[AudioProcessor] Failed to convert ${file}:`, error.message);
            }
        }

        return results;
    }

    /**
     * Merge all PCM files into a single combined MP3 with proper timing
     */
    async mergeToSingleTrack(sessionPath, outputFilename = 'combined.mp3') {
        // Read metadata for offset info
        let metadata = null;
        const metadataPath = path.join(sessionPath, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        }

        const pcmFiles = fs.readdirSync(sessionPath).filter(f => f.endsWith('.pcm'));

        if (pcmFiles.length === 0) {
            console.log('[AudioProcessor] No PCM files to merge');
            return null;
        }

        const outputPath = path.join(sessionPath, outputFilename);

        // If only one file, just convert it
        if (pcmFiles.length === 1) {
            await this.convertToMp3(path.join(sessionPath, pcmFiles[0]), outputPath);
            fs.unlinkSync(path.join(sessionPath, pcmFiles[0]));
            return outputPath;
        }

        // Build ffmpeg command with proper delay offsets for each track
        const inputs = [];
        const delays = [];

        for (let i = 0; i < pcmFiles.length; i++) {
            const file = pcmFiles[i];
            inputs.push('-f', 's16le', '-ar', '48000', '-ac', '2', '-i', path.join(sessionPath, file));

            // Get offset from metadata
            let offsetMs = 0;
            if (metadata) {
                const track = metadata.tracks.find(t => t.filename === file);
                if (track) offsetMs = track.offsetMs;
            }
            delays.push(`[${i}]adelay=${offsetMs}|${offsetMs}[a${i}]`);
        }

        // Build filter: delay each track then mix
        const mixInputs = pcmFiles.map((_, i) => `[a${i}]`).join('');
        const filterComplex = `${delays.join(';')};${mixInputs}amix=inputs=${pcmFiles.length}:duration=longest:normalize=0`;

        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-y',
                ...inputs,
                '-filter_complex', filterComplex,
                '-b:a', '192k',
                outputPath
            ]);

            let stderr = '';
            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    // Delete PCM files
                    for (const file of pcmFiles) {
                        try {
                            fs.unlinkSync(path.join(sessionPath, file));
                        } catch (e) { /* ignore */ }
                    }
                    console.log(`[AudioProcessor] Merged ${pcmFiles.length} tracks to ${outputFilename}`);
                    resolve(outputPath);
                } else {
                    console.error('[AudioProcessor] Merge failed:', stderr.slice(-500));
                    reject(new Error(`ffmpeg merge failed with code ${code}`));
                }
            });

            ffmpeg.on('error', (err) => {
                reject(new Error(`Failed to start ffmpeg for merge: ${err.message}`));
            });
        });
    }

    /**
     * Create a zip archive of all MP3 files (requires archiver package)
     */
    async createArchive(sessionPath, outputName) {
        // For simplicity, we'll just return the individual files
        // Full zip implementation would require 'archiver' package
        const mp3Files = fs.readdirSync(sessionPath).filter(f => f.endsWith('.mp3'));
        return mp3Files.map(f => path.join(sessionPath, f));
    }

    /**
     * Calculate total size of recording files
     */
    getTotalSize(sessionPath) {
        const files = fs.readdirSync(sessionPath);
        let totalSize = 0;

        for (const file of files) {
            const stats = fs.statSync(path.join(sessionPath, file));
            totalSize += stats.size;
        }

        return totalSize;
    }

    /**
     * Format file size in human-readable format
     */
    formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    /**
     * Clean up old recordings (older than specified days)
     */
    cleanupOldRecordings(recordingsPath, maxAgeDays = 7) {
        const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
        const now = Date.now();
        let cleaned = 0;

        const sessions = fs.readdirSync(recordingsPath);
        for (const session of sessions) {
            const sessionPath = path.join(recordingsPath, session);
            const stats = fs.statSync(sessionPath);

            if (stats.isDirectory() && (now - stats.mtimeMs) > maxAge) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                cleaned++;
            }
        }

        return cleaned;
    }
}

module.exports = new AudioProcessor();
