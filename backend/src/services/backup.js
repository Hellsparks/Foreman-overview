const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const archiver = require('archiver');
const { getDb, DB_PATH } = require('../db');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
const DEFAULT_BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');

const TICK_MS = 60 * 1000;
let _timer = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSetting(key, def = '') {
    try {
        const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return row ? row.value : def;
    } catch { return def; }
}

function setSetting(key, value) {
    const db = getDb();
    const info = db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(value), key);
    if (info.changes === 0) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

function getBackupDirs() {
    const d1 = getSetting('backup_dir') || DEFAULT_BACKUP_DIR;
    const d2 = getSetting('backup_dir_2');
    return d2 ? [d1, d2] : [d1];
}

function getSmbCreds(dirIndex) {
    // dirIndex: 1 or 2
    return {
        user: getSetting(`backup_smb_user_${dirIndex}`),
        pass: getSetting(`backup_smb_pass_${dirIndex}`),
    };
}

/** Remove oldest backups beyond `keep` count in a single directory + subfolder. */
function rotateDir(dir, prefix, keep, subfolder) {
    if (isSmbPath(dir)) return; // SMB rotation not supported
    try {
        const target = subfolder ? path.join(dir, subfolder) : dir;
        const files = fs.readdirSync(target)
            .filter(f => f.startsWith(prefix) && f.endsWith('.zip'))
            .map(f => ({ name: f, mtime: fs.statSync(path.join(target, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
        for (const f of files.slice(keep)) {
            try { fs.unlinkSync(path.join(target, f.name)); } catch { /* ok */ }
        }
    } catch { /* ok */ }
}

function isoTimestamp() {
    return new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
}

/** Check ZIP magic header to catch silent write failures (e.g. offline SMB). */
function verifyZip(filePath) {
    const buf = Buffer.alloc(4);
    const fd = fs.openSync(filePath, 'r');
    try { fs.readSync(fd, buf, 0, 4, 0); } finally { fs.closeSync(fd); }
    if (buf[0] !== 0x50 || buf[1] !== 0x4B) {
        throw new Error('ZIP header check failed — destination may be offline or full');
    }
}

// ── SMB support ───────────────────────────────────────────────────────────────

function isSmbPath(dir) {
    return /^smb:\/\//i.test(dir) || /^smb:\/[^/]/i.test(dir) || dir.startsWith('//');
}

/**
 * Parse an SMB path into { server, share, remotePath }.
 * Handles: smb://server/share/sub, smb:/user@server/share/sub, //server/share/sub
 */
function parseSmbPath(dir) {
    // Normalise to //server/share/...  (strip smb: prefix and user@)
    let s = dir.replace(/^smb:/i, '').replace(/^\/\/[^@/]+@/, '//');
    if (!s.startsWith('//')) s = '//' + s.replace(/^\//, '');
    const m = s.match(/^\/\/([^/]+)\/([^/]+)(\/.*)?$/);
    if (!m) return null;
    return { server: m[1], share: m[2], remotePath: (m[3] || '/').replace(/^\//, '') };
}

/**
 * Upload a local file to an SMB share using smbclient.
 * Credentials are passed via a temp file (not visible in ps).
 */
async function smbPut(localFile, destDir, subfolder, user, pass) {
    const parsed = parseSmbPath(destDir);
    if (!parsed) throw new Error(`Cannot parse SMB path: ${destDir}`);

    const { server, share, remotePath } = parsed;
    const filename = path.basename(localFile);
    // Build remote dir: base path from URL + subfolder
    const parts = [remotePath, subfolder].filter(Boolean);
    const remoteDir = parts.join('/');

    const credsFile = path.join(os.tmpdir(), `smb-creds-${Date.now()}.txt`);
    fs.writeFileSync(credsFile, `username=${user}\npassword=${pass}\n`, { mode: 0o600 });

    try {
        // mkdir each path segment (smbclient mkdir doesn't recurse)
        const mkdirCmds = parts.map((_, i) => `mkdir "${parts.slice(0, i + 1).join('/')}"`);
        const putCmd = remoteDir
            ? `put "${localFile}" "${remoteDir}/${filename}"`
            : `put "${localFile}" "${filename}"`;
        const cmds = [...mkdirCmds, putCmd].join('; ');

        await new Promise((resolve, reject) => {
            exec(
                `smbclient "//${server}/${share}" -A "${credsFile}" -c '${cmds}'`,
                { timeout: 60000 },
                err => err ? reject(new Error(`smbclient: ${err.message}`)) : resolve()
            );
        });
    } finally {
        try { fs.unlinkSync(credsFile); } catch { /* ok */ }
    }
}

// ── Archive distribution ──────────────────────────────────────────────────────

/**
 * Build archive to a temp file, then distribute to all configured dirs
 * under `subfolder` (e.g. "marathon" or "spoolman").
 * Partial failure is logged but not fatal (only throws if ALL dirs fail).
 */
async function distributeArchive(buildArchive, filename, subfolder) {
    const tmpPath = path.join(os.tmpdir(), filename);

    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(tmpPath);
        const archive = archiver('zip', { zlib: { level: 5 } });
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        buildArchive(archive);
        archive.finalize();
    });

    verifyZip(tmpPath);

    const dirs = getBackupDirs();
    const errors = [];

    for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        const dirIdx = i + 1;
        try {
            if (isSmbPath(dir)) {
                const { user, pass } = getSmbCreds(dirIdx);
                if (!user) throw new Error(`SMB credentials not configured for directory ${dirIdx}`);
                await smbPut(tmpPath, dir, subfolder, user, pass);
            } else {
                const destDir = path.join(dir, subfolder);
                fs.mkdirSync(destDir, { recursive: true });
                const dest = path.join(destDir, filename);
                fs.copyFileSync(tmpPath, dest);
                verifyZip(dest);
            }
        } catch (e) {
            errors.push({ dir, error: e.message });
            console.warn(`[Backup] ${dir}: ${e.message}`);
        }
    }

    try { fs.unlinkSync(tmpPath); } catch { /* ok */ }

    if (errors.length === dirs.length) {
        throw new Error(errors.map(e => `${e.dir}: ${e.error}`).join('; '));
    }
}

// ── Marathon backup ───────────────────────────────────────────────────────────

async function backupMarathon() {
    const includeUploads = getSetting('marathon_backup_include_uploads', '1') === '1';
    try { getDb().exec('PRAGMA wal_checkpoint(FULL)'); } catch { /* ok */ }

    const filename = `marathon-${isoTimestamp()}.zip`;
    await distributeArchive(archive => {
        archive.file(path.resolve(DB_PATH), { name: 'marathon.db' });
        if (includeUploads && fs.existsSync(UPLOADS_DIR)) {
            archive.directory(UPLOADS_DIR, 'uploads');
        }
    }, filename, 'marathon');

    const keep = parseInt(getSetting('marathon_backup_keep', '7'), 10) || 7;
    for (const dir of getBackupDirs()) rotateDir(dir, 'marathon-', keep, 'marathon');
    setSetting('marathon_last_backup', new Date().toISOString());
    console.log(`[Backup] Marathon → ${filename}`);
}

// ── Spoolman backup ───────────────────────────────────────────────────────────

async function backupSpoolman() {
    const spoolmanUrl = getSetting('spoolman_url');
    if (!spoolmanUrl) throw new Error('Spoolman URL not configured — set it in Settings.');

    const fetchJson = async (endpoint) => {
        const r = await fetch(`${spoolmanUrl}${endpoint}`, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`Spoolman returned ${r.status} for ${endpoint}`);
        return r.json();
    };

    const [vendors, filaments, spools, settings] = await Promise.all([
        fetchJson('/api/v1/vendor'),
        fetchJson('/api/v1/filament'),
        fetchJson('/api/v1/spool'),
        fetchJson('/api/v1/setting').catch(() => ({})),
    ]);

    const payload = { vendors, filaments, spools, settings };
    const tmpJson = path.join(os.tmpdir(), `spoolman-src-${Date.now()}.json`);
    fs.writeFileSync(tmpJson, JSON.stringify(payload, null, 2), 'utf8');

    const filename = `spoolman-${isoTimestamp()}.zip`;
    try {
        await distributeArchive(archive => {
            archive.file(tmpJson, { name: 'spoolman.json' });
        }, filename, 'spoolman');
    } finally {
        try { fs.unlinkSync(tmpJson); } catch { /* ok */ }
    }

    const keep = parseInt(getSetting('spoolman_backup_keep', '7'), 10) || 7;
    for (const dir of getBackupDirs()) rotateDir(dir, 'spoolman-', keep, 'spoolman');
    setSetting('spoolman_last_backup', new Date().toISOString());
    console.log(`[Backup] Spoolman → ${filename}`);
}

// ── Scheduler ────────────────────────────────────────────────────────────────

async function tick() {
    const now = Date.now();

    if (getSetting('marathon_backup_enabled') === '1') {
        const intervalMs = (parseFloat(getSetting('marathon_backup_interval', '24')) || 24) * 3600000;
        const lastMs = Date.parse(getSetting('marathon_last_backup') || '0') || 0;
        if (now - lastMs >= intervalMs) {
            try { await backupMarathon(); }
            catch (e) { console.error('[Backup] Marathon failed:', e.message); }
        }
    }

    if (getSetting('spoolman_backup_enabled') === '1') {
        const intervalMs = (parseFloat(getSetting('spoolman_backup_interval', '24')) || 24) * 3600000;
        const lastMs = Date.parse(getSetting('spoolman_last_backup') || '0') || 0;
        if (now - lastMs >= intervalMs) {
            try { await backupSpoolman(); }
            catch (e) { console.error('[Backup] Spoolman failed:', e.message); }
        }
    }
}

function startBackupScheduler() {
    if (_timer) return;
    _timer = setInterval(tick, TICK_MS);
    setTimeout(tick, 15000);
    console.log('[Backup] Scheduler started');
}

function stopBackupScheduler() {
    if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = {
    startBackupScheduler,
    stopBackupScheduler,
    backupMarathon,
    backupSpoolman,
    getBackupDirs,
    isSmbPath,
    DEFAULT_BACKUP_DIR,
};
