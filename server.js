const fs = require('fs');
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');

app.use(express.static(__dirname));
app.use(express.static('public'));

// Directories
const boundUsersDir = path.join(__dirname, 'bound_users');
const giftDir = path.join(__dirname, 'gifts');
const soundsDir = path.join(__dirname, 'sounds');
const giftSoundsDir = path.join(__dirname, 'gift_sounds');
const overlaysDir = path.join(__dirname, 'overlays');

// Ensure directories exist
[boundUsersDir, giftDir, soundsDir, giftSoundsDir, overlaysDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Paths
const userBindingsPath = path.join(boundUsersDir, 'bindings.json');
const giftBindingsPath = path.join(boundUsersDir, 'gift_bindings.json');
const userImagesPath = path.join(boundUsersDir, 'user_images.json');
const giftImagesPath = path.join(boundUsersDir, 'gift_images.json');
const defaultSettingsPath = path.join(boundUsersDir, 'default_settings.json');
const giftsTxtPath = path.join(giftDir, 'gifts.txt');
const joinedUsersPath = path.join(boundUsersDir, 'users.txt');

// Load Data with File System Check
const loadJSON = (filePath) => {
    try {
        return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
    } catch (e) { return {}; }
};

let userBindings = loadJSON(userBindingsPath);
let giftBindings = loadJSON(giftBindingsPath);
let userImages = loadJSON(userImagesPath);
let giftImages = loadJSON(giftImagesPath);
let defaultSettings = loadJSON(defaultSettingsPath);

// Helper to sort and save users alphabetically
const addAndSortUser = (username) => {
    if (!username) return;
    const cleanUser = username.trim();
    let users = [];
    if (fs.existsSync(joinedUsersPath)) {
        users = fs.readFileSync(joinedUsersPath, 'utf8')
            .split('\n')
            .map(u => u.trim())
            .filter(Boolean);
    }
    if (!users.map(u => u.toLowerCase()).includes(cleanUser.toLowerCase())) {
        users.push(cleanUser);
        users.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'accent' }));
        fs.writeFileSync(joinedUsersPath, users.join('\n') + '\n');
    }
};

// Helper to sort and save gifts alphabetically
const addAndSortGift = (giftName) => {
    if (!giftName) return;
    const cleanGift = giftName.trim();
    let gifts = [];
    if (fs.existsSync(giftsTxtPath)) {
        gifts = fs.readFileSync(giftsTxtPath, 'utf8')
            .split('\n')
            .map(g => g.trim())
            .filter(Boolean);
    }
    if (!gifts.map(g => g.toLowerCase()).includes(cleanGift.toLowerCase())) {
        gifts.push(cleanGift);
        gifts.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'accent' }));
        fs.writeFileSync(giftsTxtPath, gifts.join('\n') + '\n');
    }
};

let tiktokConnection = null;

io.on('connection', (socket) => {
    socket.on('SYNC_USER_BINDINGS', (data) => {
        userBindings = data; 
        fs.writeFileSync(userBindingsPath, JSON.stringify(data, null, 2));
    });

    socket.on('SYNC_GIFT_BINDINGS', (data) => {
        giftBindings = data;
        fs.writeFileSync(giftBindingsPath, JSON.stringify(data, null, 2));
    });

    socket.on('SYNC_USER_IMAGES', (data) => {
        userImages = data;
        fs.writeFileSync(userImagesPath, JSON.stringify(data, null, 2));
    });

    socket.on('SYNC_GIFT_IMAGES', (data) => {
        giftImages = data;
        fs.writeFileSync(giftImagesPath, JSON.stringify(data, null, 2));
    });

    socket.on('SYNC_DEFAULT_SETTINGS', (data) => {
        defaultSettings = data;
        fs.writeFileSync(defaultSettingsPath, JSON.stringify(data, null, 2));
    });

    socket.on('trigger_alert', (data) => {
        io.emit('trigger_alert', data);
    });

    socket.on('CONNECT_TIKTOK', async (username) => {
        if (tiktokConnection) {
            try {
                tiktokConnection.removeAllListeners();
                await tiktokConnection.disconnect();
            } catch (e) { console.log("Cleanup error:", e); }
        }

        try {
            tiktokConnection = new WebcastPushConnection(username);
            await tiktokConnection.connect();
            io.emit('status_update', 'Connected to @' + username);
            
            tiktokConnection.on('gift', (d) => {
                const giftName = d.giftName;
                const user = d.uniqueId;
                
                addAndSortGift(giftName);

                const soundFile = giftBindings[giftName];
                const imageUrl = giftImages[giftName] || '';

                io.emit('gift', { giftName, username: user });
                io.emit('trigger_alert', {
                    username: user,
                    text: `Sent ${giftName}!`,
                    imageUrl: imageUrl,
                    soundUrl: soundFile ? (soundFile.startsWith('http') || soundFile.startsWith('./') ? soundFile : `./gift_sounds/${soundFile}`) : null
                });
            });

            tiktokConnection.on('follow', (d) => io.emit('follow', { username: d.uniqueId }));

            tiktokConnection.on('member', (d) => {
                addAndSortUser(d.uniqueId);
                io.emit('member_join', { username: d.uniqueId });

                const lowerUser = d.uniqueId.toLowerCase();
                const soundFile = userBindings[lowerUser] || defaultSettings.defaultSound || '';
                const imageUrl = userImages[lowerUser] || defaultSettings.defaultImageUrl || '';

                if (soundFile || imageUrl) {
                    io.emit('trigger_alert', {
                        username: d.uniqueId,
                        text: `Joined the stream!`,
                        imageUrl: imageUrl,
                        soundUrl: soundFile ? (soundFile.startsWith('http') || soundFile.startsWith('./') ? soundFile : `./sounds/${soundFile}`) : null
                    });
                }
            });
        } catch (err) {
            io.emit('status_update', 'Connection Failed');
            tiktokConnection = null;
        }
    });

    socket.on('DISCONNECT_TIKTOK', async () => {
        if (tiktokConnection) {
            tiktokConnection.removeAllListeners();
            await tiktokConnection.disconnect();
            tiktokConnection = null;
            io.emit('status_update', 'Disconnected');
        }
    });
});

// APIs
app.get('/get-user-bindings', (req, res) => res.json(userBindings));
app.get('/get-gift-bindings', (req, res) => res.json(giftBindings));
app.get('/get-user-images', (req, res) => res.json(userImages));
app.get('/get-gift-images', (req, res) => res.json(giftImages));
app.get('/get-default-settings', (req, res) => res.json(defaultSettings));

// Recursive GitHub Repo Traversal
async function fetchGitHubRepoAssets(dirPath = '', extensions) {
    let results = [];
    try {
        const response = await fetch(`https://api.github.com/repos/ianjonesauthor/StreamFX/contents/${dirPath}`, {
            headers: { 'User-Agent': 'StreamFX-Live-App' }
        });
        if (response.ok) {
            const items = await response.json();
            if (Array.isArray(items)) {
                for (const item of items) {
                    if (item.type === 'file' && extensions.test(item.name)) {
                        results.push({
                            name: item.name,
                            path: item.path,
                            download_url: item.download_url
                        });
                    } else if (item.type === 'dir') {
                        const subItems = await fetchGitHubRepoAssets(item.path, extensions);
                        results = results.concat(subItems);
                    }
                }
            }
        }
    } catch (e) {
        console.log(`GitHub API traversal error for ${dirPath}:`, e.message);
    }
    return results;
}

// Recursive Local Directory Traversal
function getLocalRepoAssets(dir, extensions, baseDir = dir) {
    let results = [];
    try {
        if (!fs.existsSync(dir)) return results;
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                results = results.concat(getLocalRepoAssets(filePath, extensions, baseDir));
            } else {
                if (extensions.test(file)) {
                    const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');
                    if (!relativePath.startsWith('node_modules')) {
                        results.push({
                            name: file,
                            relativePath: relativePath,
                            fullPath: filePath
                        });
                    }
                }
            }
        });
    } catch (e) {
        console.log("Local directory scan error:", e.message);
    }
    return results;
}

// API: Get Overlay & Gift Images
app.get('/get-overlay-images', async (req, res) => {
    let imageList = [];
    const extRegex = /\.(png|jpg|jpeg|gif|webp)$/i;
    try {
        const ghImages = await fetchGitHubRepoAssets('', extRegex);
        if (ghImages.length > 0) {
            imageList = ghImages.map(img => ({
                label: img.path,
                url: `https://raw.githubusercontent.com/ianjonesauthor/StreamFX/main/${img.path}`
            }));
        }
    } catch (e) {
        console.log("GitHub API image fetch fallback triggered:", e.message);
    }

    if (imageList.length === 0) {
        const localFiles = getLocalRepoAssets(__dirname, extRegex);
        imageList = localFiles.map(f => ({
            label: f.relativePath,
            url: `./${f.relativePath}`
        }));
    }

    imageList.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'accent' }));
    res.json(imageList);
});

// Helper for Audio API endpoints (sounds & gift_sounds scanning all subfolders)
async function handleAudioFetch(req, res, targetFolder) {
    let audioList = [];
    const extRegex = /\.(mp3|m4a)$/i;
    try {
        const ghAudio = await fetchGitHubRepoAssets(targetFolder, extRegex);
        if (ghAudio.length > 0) {
            audioList = ghAudio.map(a => ({
                label: a.path,
                url: `https://raw.githubusercontent.com/ianjonesauthor/StreamFX/main/${a.path}`
            }));
        }
    } catch (e) {
        console.log(`GitHub API audio fetch fallback for ${targetFolder}:`, e.message);
    }

    if (audioList.length === 0) {
        const localDir = path.join(__dirname, targetFolder);
        const localFiles = getLocalRepoAssets(localDir, extRegex, path.join(__dirname));
        audioList = localFiles.map(f => ({
            label: f.relativePath,
            url: `./${f.relativePath}`
        }));
    }

    audioList.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'accent' }));
    res.json(audioList);
}

app.get('/get-sounds', async (req, res) => {
    await handleAudioFetch(req, res, 'sounds');
});

app.get('/get-gift-sounds', async (req, res) => {
    await handleAudioFetch(req, res, 'gift_sounds');
});

app.get('/get-gift-names', (req, res) => {
    fs.readFile(giftsTxtPath, 'utf8', (err, data) => {
        const gifts = data ? [...new Set(data.split('\n').map(g => g.trim()).filter(Boolean))] : [];
        gifts.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'accent' }));
        res.json(gifts);
    });
});

app.get('/get-user-categories', (req, res) => {
    fs.readFile(joinedUsersPath, 'utf8', (err, data) => {
        const users = data ? [...new Set(data.split('\n').map(u => u.trim()).filter(Boolean))] : [];
        users.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'accent' }));
        res.json({ joined: users });
    });
});

http.listen(3000, () => console.log('StreamFX Live running on http://localhost:3000'));