const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- 1. DATABASE CONNECTION ---
const pool = new Pool({
    connectionString: 'postgresql://nexus_database_7sip_user:rBocbgcXNjc0mPsCPPoQFeJA3Q0foy00@dpg-d71tj424d50c73c00rjg-a.oregon-postgres.render.com/nexus_database_7sip',
    ssl: { rejectUnauthorized: false }
});

// --- 2. TABLE INITIALIZATION ---
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS remote_sessions (
                host_id TEXT PRIMARY KEY,
                password TEXT,
                socket_id TEXT
            )
        `);
        console.log("Database Table Ready ✅");
    } catch (err) {
        console.error("DB Init Error:", err);
    }
};
initDB();

// --- 3. THE CLOUD ENGINE ---
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // HOST GENERATES PERMANENT ID
    socket.on('request-host-info', async (callback) => {
        const hostId = Math.floor(100000000 + Math.random() * 900000000).toString();
        const password = Math.floor(1000 + Math.random() * 9000).toString();
        
        try {
            await pool.query(
                'INSERT INTO remote_sessions (host_id, password, socket_id) VALUES ($1, $2, $3)',
                [hostId, password, socket.id]
            );
            console.log(`PERMANENT SESSION SAVED: ${hostId}`);
            callback({ id: hostId, password });
        } catch (err) {
            console.error("Save Error:", err);
        }
    });

    // VIEWER LOGS IN VIA DATABASE
    socket.on('attempt-login', async (credentials, callback) => {
        try {
            const res = await pool.query(
                'SELECT * FROM remote_sessions WHERE host_id = $1 AND password = $2',
                [credentials.id, credentials.password]
            );

            if (res.rows.length > 0) {
                const host = res.rows[0];
                if (host.socket_id) {
                    socket.join(host.host_id);
                    io.to(host.socket_id).emit('viewer-joined');
                    callback({ success: true });
                } else {
                    callback({ success: false, message: 'Partner is currently offline' });
                }
            } else {
                callback({ success: false, message: 'Invalid ID or Password' });
            }
        } catch (err) {
            callback({ success: false, message: 'Database Error' });
        }
    });

    // SIGNAL ROUTING (Mouse/Video/Keyboard)
    socket.on('signal', async (data) => {
        // Find which room this socket belongs to
        const rooms = Array.from(socket.rooms);
        const room = rooms.find(r => r !== socket.id);
        if (room) socket.to(room).emit('signal', data);
    });

    // Handle Controls (Mouse Click, Move, etc.)
    const controlEvents = ['mouse-move', 'mouse-click', 'type-key', 'mouse-scroll'];
    controlEvents.forEach(event => {
        socket.on(event, (data) => {
            const rooms = Array.from(socket.rooms);
            const room = rooms.find(r => r !== socket.id);
            if (room) socket.to(room).emit(event, data);
        });
    });

    // CLEANUP
    socket.on('disconnect', async () => {
        console.log('User disconnected:', socket.id);
        // Clear socket_id so we know the host is offline, but KEEP the ID/Pass in the DB
        await pool.query('UPDATE remote_sessions SET socket_id = NULL WHERE socket_id = $1', [socket.id]);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));