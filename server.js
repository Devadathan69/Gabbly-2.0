const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Pairing Queue: Pairs users who are waiting
const waitingUsers = []; // Queue of socket IDs

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    socket.partnerId = null;

    socket.on('find_partner', () => {
        if (socket.partnerId) return;
        if (waitingUsers.includes(socket.id)) return;

        if (waitingUsers.length > 0) {
            const partnerId = waitingUsers.shift();

            if (partnerId === socket.id) {
                waitingUsers.push(socket.id);
                return;
            }

            const partnerSocket = io.sockets.sockets.get(partnerId);

            if (partnerSocket) {
                socket.partnerId = partnerId;
                partnerSocket.partnerId = socket.id;

                socket.emit('match_found', { initiator: true });
                partnerSocket.emit('match_found', { initiator: false });

                console.log(`Paired ${socket.id} with ${partnerId}`);
            } else {
                waitingUsers.push(socket.id);
            }
        } else {
            waitingUsers.push(socket.id);
            console.log(`User ${socket.id} added to queue`);
        }
    });

    socket.on('offer', (payload) => {
        if (socket.partnerId) {
            io.to(socket.partnerId).emit('offer', payload);
        }
    });

    socket.on('answer', (payload) => {
        if (socket.partnerId) {
            io.to(socket.partnerId).emit('answer', payload);
        }
    });

    socket.on('ice-candidate', (candidate) => {
        if (socket.partnerId) {
            io.to(socket.partnerId).emit('ice-candidate', candidate);
        }
    });

    const cleanupConnection = () => {
        const partnerId = socket.partnerId;
        const index = waitingUsers.indexOf(socket.id);
        if (index > -1) {
            waitingUsers.splice(index, 1);
        }

        if (partnerId) {
            io.to(partnerId).emit('partner_disconnected');
            const partnerSocket = io.sockets.sockets.get(partnerId);
            if (partnerSocket) {
                partnerSocket.partnerId = null;
            }
            socket.partnerId = null;
        }
    };

    socket.on('next', () => {
        cleanupConnection();
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        cleanupConnection();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
