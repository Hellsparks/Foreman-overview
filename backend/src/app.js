const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Core routes — always mounted, no feature flag
const printersRouter = require('./routes/printers');
const filesRouter = require('./routes/files');
const statusRouter = require('./routes/status');
const queueRouter = require('./routes/queue');
const controlRouter = require('./routes/control');
const octoprintRouter = require('./routes/octoprint');
const settingsRouter = require('./routes/settings');
const foldersRouter = require('./routes/folders');
const setupRouter = require('./routes/setup');
const errorHandler = require('./middleware/errorHandler');

// Pluggable features — auto-loaded from features/ subfolders.
// To disable a feature: set "enabled": false in its feature.json.
// To add a feature: drop a new folder in features/ with routes.js + feature.json.
const { loadFeatures } = require('./features');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '10mb' }));

// Core routes
app.use('/api/printers', printersRouter);
app.use('/api/files', filesRouter);
app.use('/api/folders', foldersRouter);
app.use('/api/status', statusRouter);
// queue and control share the /api/printers prefix (they own /:id/queue and /:id/print/*).
// All three routers use distinct path prefixes so there is no collision risk,
// but if you add a route to either file, confirm it doesn't shadow printers.js.
app.use('/api/printers', queueRouter);
app.use('/api/printers', controlRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/setup', setupRouter);

// Feature routes (from features/ auto-loader)
for (const feature of loadFeatures()) {
  app.use(feature.mountPath, feature.router);
}

// Statically serve cloned Community Themes — dotfiles: 'allow' exposes .theme/ subdirectories
app.use('/themes', express.static(path.join(__dirname, '../data/themes'), { dotfiles: 'allow' }));

// OctoPrint-compatible routes — slicers hit /api/version, /api/printer, /api/files/local
// Mounted at /api so paths match OctoPrint exactly
app.use('/api', octoprintRouter);

// Serve the built frontend for non-Docker / direct deployments.
// OrcaSlicer's device tab does GET / to show the web UI — this makes it work
// when hitting the backend directly (port 3000). In Docker, nginx handles it.
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

app.use(errorHandler);

module.exports = app;
