const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Connect to your Render PostgreSQL database
const pool = new Pool({
    connectionString: 'postgresql://nexus_database_7sip_user:rBocbgcXNjc0mPsCPPoQFeJA3Q0foy00@dpg-d71tj424d50c73c00rjg-a.oregon-postgres.render.com/nexus_database_7sip',
    ssl: { rejectUnauthorized: false }
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Host generates ID and joins room
    socket.on('request-host-info', async (callback) => {
        const hostId = Math.floor(100000000 + Math.random() * 900000000).toString();
        const password = Math.floor(1000 + Math.random() * 9000).toString();
        try {
            await pool.query(
                `INSERT INTO remote_sessions (host_id, password, socket_id) 
                 VALUES ($1, $2, $3) ON CONFLICT (host_id) DO UPDATE SET password = $2, socket_id = $3`,
                [hostId, password, socket.id]
            );
            socket.join(hostId); // Host opens the door to listen for commands
            callback({ id: hostId, password });
        } catch (err) { console.error('DB Error:', err); }
    });

    // Viewer attempts to log into the Host's room
    socket.on('attempt-login', async (credentials, callback) => {
        try {
            const res = await pool.query('SELECT * FROM remote_sessions WHERE host_id = $1 AND password = $2', [credentials.id, credentials.password]);
            if (res.rows.length > 0) {
                socket.join(credentials.id);
                socket.to(credentials.id).emit('viewer-joined'); // Tell Host the viewer arrived
                callback({ success: true });
            } else {
                callback({ success: false, message: 'Invalid Credentials' });
            }
        } catch (err) { console.error('DB Error:', err); }
    });

    // Unified Signal Router (WebRTC, Mouse, Keys)
    const events = ['signal', 'mouse-move', 'mouse-click', 'type-key'];
    events.forEach(event => {
        socket.on(event, (data) => {
            if (data.room) socket.to(data.room).emit(event, data);
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Render automatically assigns a port via process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Cloud Server running on port ${PORT}`));