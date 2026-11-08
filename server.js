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
                const soundFile = giftBindings[giftName];
                const imageUrl = giftImages[giftName] || '';

                io.emit('gift', { giftName, username: user });
                io.emit('trigger_alert', {
                    username: user,
                    text: `Sent ${giftName}!`,
                    imageUrl: imageUrl,
                    soundUrl: soundFile ? `./gift_sounds/${soundFile}` : null
                });
            });

            tiktokConnection.on('follow', (d) => io.emit('follow', { username: d.uniqueId }));

            tiktokConnection.on('member', (d) => {
                const users = fs.existsSync(joinedUsersPath) ? fs.readFileSync(joinedUsersPath, 'utf8') : "";
                if (!users.includes(d.uniqueId)) {
                    fs.appendFileSync(joinedUsersPath, d.uniqueId + '\n');
                }
                io.emit('member_join', { username: d.uniqueId });

                const lowerUser = d.uniqueId.toLowerCase();
                const soundFile = userBindings[lowerUser] || defaultSettings.defaultSound || '';
                const imageUrl = userImages[lowerUser] || defaultSettings.defaultImageUrl || '';

                if (soundFile || imageUrl) {
                    io.emit('trigger_alert', {
                        username: d.uniqueId,
                        text: `Joined the stream!`,
                        imageUrl: imageUrl,
                        soundUrl: soundFile ? `./sounds/${soundFile}` : null
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

// Fetch overlay images from GitHub Repository API with local fallback
app.get('/get-overlay-images', async (req, res) => {
    try {
        const response = await fetch('https://api.github.com/repos/ianjonesauthor/StreamFX/contents/overlays', {
            headers: { 'User-Agent': 'StreamFX-Live-App' }
        });
        if (response.ok) {
            const data = await response.json();
            const imageFiles = data
                .filter(item => item.type === 'file' && /\.(png|jpg|jpeg|gif|webp)$/i.test(item.name))
                .map(item => item.name);
            return res.json(imageFiles);
        }
    } catch (e) {
        console.log("GitHub API fetch fallback triggered:", e.message);
    }

    fs.readdir(overlaysDir, (err, files) => {
        if (err) return res.json([]);
        res.json(files.filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f)));
    });
});

app.get('/get-gift-names', (req, res) => {
    fs.readFile(giftsTxtPath, 'utf8', (err, data) => {
        res.json(data ? [...new Set(data.split('\n').map(g => g.trim()).filter(Boolean))] : []);
    });
});

app.get('/get-user-categories', (req, res) => {
    fs.readFile(joinedUsersPath, 'utf8', (err, data) => {
        res.json({ joined: data ? [...new Set(data.split('\n').map(u => u.trim()).filter(Boolean))] : [] });
    });
});

app.get('/get-sounds', (req, res) => fs.readdir(soundsDir, (err, f) => res.json(err ? [] : f.filter(x => x.endsWith('.mp3')))));
app.get('/get-gift-sounds', (req, res) => fs.readdir(giftSoundsDir, (err, f) => res.json(err ? [] : f.filter(x => x.endsWith('.mp3')))));

http.listen(3000, () => console.log('StreamFX Live running on http://localhost:3000'));