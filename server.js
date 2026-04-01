const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", // Lock this down to your domain in production
        methods: ["GET", "POST"]
    }
});

// ✅ FIX: Credentials now come from environment variables, NOT hardcoded
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ✅ FIX: Rate limiting map to prevent brute-force on 4-digit passwords
const loginAttempts = {};
const MAX_ATTEMPTS = 5;

// ✅ Ensure table exists on startup
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS remote_sessions (
                host_id VARCHAR(20) PRIMARY KEY,
                password VARCHAR(10) NOT NULL,
                socket_id VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('Database ready.');
    } catch (err) {
        console.error('DB init error:', err);
    }
}
initDB();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Host generates ID and joins room
    socket.on('request-host-info', async (callback) => {
        const hostId = Math.floor(100000000 + Math.random() * 900000000).toString();
        const password = Math.floor(1000 + Math.random() * 9000).toString();
        try {
            await pool.query(
                `INSERT INTO remote_sessions (host_id, password, socket_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (host_id) DO UPDATE SET password = $2, socket_id = $3`,
                [hostId, password, socket.id]
            );
            socket.join(hostId);
            callback({ id: hostId, password });
        } catch (err) {
            console.error('DB Error on host register:', err);
            callback({ error: 'Server error. Please try again.' });
        }
    });

    // ✅ FIX: Host can cleanly end a session and remove from DB
    socket.on('stop-hosting', async (hostId) => {
        try {
            await pool.query('DELETE FROM remote_sessions WHERE host_id = $1', [hostId]);
            socket.leave(hostId);
            console.log(`Session ${hostId} removed.`);
        } catch (err) {
            console.error('DB Error on stop-hosting:', err);
        }
    });

    // Viewer attempts to log into the Host's room
    socket.on('attempt-login', async (credentials, callback) => {
        // ✅ FIX: Rate limiting — max 5 wrong attempts per socket connection
        loginAttempts[socket.id] = (loginAttempts[socket.id] || 0) + 1;
        if (loginAttempts[socket.id] > MAX_ATTEMPTS) {
            return callback({ success: false, message: 'Too many failed attempts. Please reconnect.' });
        }

        try {
            const res = await pool.query(
                'SELECT * FROM remote_sessions WHERE host_id = $1 AND password = $2',
                [credentials.id, credentials.password]
            );
            if (res.rows.length > 0) {
                loginAttempts[socket.id] = 0; // Reset on success
                socket.join(credentials.id);
                socket.to(credentials.id).emit('viewer-joined');
                callback({ success: true });
            } else {
                callback({ success: false, message: `Invalid credentials. (${MAX_ATTEMPTS - loginAttempts[socket.id]} attempts left)` });
            }
        } catch (err) {
            console.error('DB Error on login:', err);
            callback({ success: false, message: 'Server error.' });
        }
    });

    // ✅ Unified Signal Router (WebRTC, Mouse, Keys)
    const events = ['signal', 'mouse-move', 'mouse-click', 'mouse-scroll', 'key-press'];
    events.forEach(event => {
        socket.on(event, (data) => {
            if (data.room) socket.to(data.room).emit(event, data);
        });
    });

    socket.on('disconnect', async () => {
        console.log('User disconnected:', socket.id);
        // ✅ FIX: Auto-cleanup DB when host disconnects unexpectedly
        try {
            await pool.query('DELETE FROM remote_sessions WHERE socket_id = $1', [socket.id]);
        } catch (err) {
            console.error('DB cleanup error on disconnect:', err);
        }
        delete loginAttempts[socket.id];
    });
});

// Render automatically assigns a port via process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Cloud Server running on port ${PORT}`));
