import { Server as SocketIOServer, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { SECRET } from '../utils/config';
import { UserOnlineStatus, TypingIndicator, MessageReceipt } from './types';

const prisma = new PrismaClient();

// Store active users: { userId: { socketId, username, isOnline, lastSeen } }
const activeUsers = new Map<string, { socketId: string; username: string; isOnline: boolean; lastSeen: Date }>();

// Store typing indicators: { conversationId: Set<userId> }
const typingUsers = new Map<string, Set<string>>();

export function initializeSocketIO(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 New connection: ${socket.id}`);

    // Authenticate user on connection
    socket.on('auth', async (token: string) => {
      try {
        const decoded = jwt.verify(token, SECRET) as JwtPayload;
        const userId = decoded.sub || decoded.user_id;

        if (!userId) {
          socket.emit('error', { message: 'Invalid token' });
          socket.disconnect();
          return;
        }

        // Get user info
        const user = await prisma.users.findUnique({
          where: { id: userId },
          select: { id: true, username: true }
        });

        if (!user) {
          socket.emit('error', { message: 'User not found' });
          socket.disconnect();
          return;
        }

        // Store socket data
        socket.data.userId = userId;
        socket.data.username = user.username;

        // Track user as online
        activeUsers.set(userId, {
          socketId: socket.id,
          username: user.username,
          isOnline: true,
          lastSeen: new Date()
        });

        // Join user's personal room
        socket.join(`user:${userId}`);

        // Broadcast user is online
        io.emit('user_online', {
          userId,
          username: user.username,
          isOnline: true
        } as UserOnlineStatus);

        console.log(`✅ User authenticated: ${user.username} (${userId})`);
      } catch (error) {
        console.error('Auth error:', error);
        socket.emit('error', { message: 'Authentication failed' });
        socket.disconnect();
      }
    });

    // Handle joining a conversation room
    socket.on('join_conversation', (conversationId: string) => {
      if (!socket.data.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      socket.join(`conversation:${conversationId}`);
      console.log(`👤 ${socket.data.username} joined conversation ${conversationId}`);

      // Notify others that user is online in this conversation
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        conversationId,
        userId: socket.data.userId,
        username: socket.data.username,
        isTyping: false
      } as TypingIndicator);
    });

    // Handle leaving a conversation room
    socket.on('leave_conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`👋 ${socket.data.username} left conversation ${conversationId}`);
    });

    // Handle new message
    socket.on('send_message', async (data: { conversationId: string; content: string; messageType?: string }) => {
      try {
        if (!socket.data.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const { conversationId, content, messageType = 'TEXT' } = data;

        // Save message to database
        const message = await prisma.messages.create({
          data: {
            id: require('uuid').v4(),
            conversation_id: conversationId,
            sender_id: socket.data.userId,
            content,
            message_type: messageType,
            is_delivered: false,
            is_read: false
          },
          include: {
            users: {
              select: { id: true, username: true, avatar_url: true }
            }
          }
        });

        // Emit message to conversation room
        io.to(`conversation:${conversationId}`).emit('new_message', {
          id: message.id,
          conversationId,
          senderId: socket.data.userId,
          senderUsername: socket.data.username,
          senderAvatar: message.users.avatar_url,
          content: message.content,
          messageType: message.message_type,
          isRead: message.is_read,
          isDelivered: false, // Will be updated when recipient receives it
          createdAt: message.created_at
        });

        // Send delivery receipt back to sender (single tick)
        socket.emit('message_delivered', {
          messageId: message.id,
          conversationId,
          userId: socket.data.userId,
          type: 'delivered',
          timestamp: new Date().toISOString()
        } as MessageReceipt);
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle message delivered receipt
    socket.on('message_delivered', async (data: { messageId: string; conversationId: string }) => {
      try {
        const { messageId, conversationId } = data;

        // Update message delivered status
        await prisma.messages.update({
          where: { id: messageId },
          data: { is_delivered: true }
        });

        // Broadcast delivery receipt to sender
        io.to(`conversation:${conversationId}`).emit('message_delivered', {
          messageId,
          conversationId,
          userId: socket.data.userId,
          type: 'delivered',
          timestamp: new Date().toISOString()
        } as MessageReceipt);
      } catch (error) {
        console.error('Delivery receipt error:', error);
      }
    });

    // Handle message read receipt
    socket.on('message_read', async (data: { messageId: string; conversationId: string }) => {
      try {
        const { messageId, conversationId } = data;

        // Update message read status
        await prisma.messages.update({
          where: { id: messageId },
          data: { is_read: true }
        });

        // Broadcast read receipt (double tick)
        io.to(`conversation:${conversationId}`).emit('message_read', {
          messageId,
          conversationId,
          userId: socket.data.userId,
          type: 'read',
          timestamp: new Date().toISOString()
        } as MessageReceipt);
      } catch (error) {
        console.error('Read receipt error:', error);
      }
    });

    // Handle typing indicator
    socket.on('typing', (data: { conversationId: string; isTyping: boolean }) => {
      const { conversationId, isTyping } = data;
      const userId = socket.data.userId;

      // Track typing users
      if (!typingUsers.has(conversationId)) {
        typingUsers.set(conversationId, new Set());
      }

      const typing = typingUsers.get(conversationId)!;
      if (isTyping) {
        typing.add(userId);
      } else {
        typing.delete(userId);
      }

      // Broadcast typing status
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        conversationId,
        userId,
        username: socket.data.username,
        isTyping
      } as TypingIndicator);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      if (socket.data.userId) {
        const userId = socket.data.userId;
        const username = socket.data.username;

        // Mark user as offline
        activeUsers.set(userId, {
          socketId: '',
          username,
          isOnline: false,
          lastSeen: new Date()
        });

        // Broadcast user is offline
        io.emit('user_offline', {
          userId,
          username,
          isOnline: false,
          lastSeen: new Date().toISOString()
        } as UserOnlineStatus);

        console.log(`🔌 User disconnected: ${username}`);
      }
    });
  });
}

// Get active users count
export function getActiveUsersCount(): number {
  return Array.from(activeUsers.values()).filter(u => u.isOnline).length;
}

// Get user online status
export function getUserOnlineStatus(userId: string): UserOnlineStatus | null {
  const user = activeUsers.get(userId);
  if (!user) return null;

  return {
    userId,
    username: user.username,
    isOnline: user.isOnline,
    lastSeen: user.lastSeen.toISOString()
  };
}
