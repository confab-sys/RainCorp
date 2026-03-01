import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { isUuid } from '../../utils/validators';

const prisma = new PrismaClient();

/**
 * Get all conversations for authenticated user
 */
export const getConversations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;

    if (!userId || !isUuid(userId)) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const conversations = await prisma.conversations.findMany({
      where: {
        conversation_members: {
          some: { user_id: userId }
        }
      },
      include: {
        conversation_members: {
          select: { user_id: true }
        },
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1,
          include: {
            users: { select: { id: true, username: true, avatar_url: true } }
          }
        }
      },
      orderBy: { updated_at: 'desc' }
    });

    const formatted = conversations.map(conv => {
      const lastMessage = conv.messages[0];
      const otherMembers = conv.conversation_members
        .map(m => m.user_id)
        .filter(id => id !== userId);

      return {
        id: conv.id,
        isGroup: conv.is_group,
        name: conv.name,
        lastMessage: lastMessage ? {
          content: lastMessage.content,
          senderId: lastMessage.users.id,
          senderName: lastMessage.users.username,
          sentAt: lastMessage.created_at
        } : null,
        otherMemberIds: otherMembers,
        updatedAt: conv.updated_at
      };
    });

    res.status(200).json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('Get conversations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
  }
};

/**
 * Get messages for a conversation
 */
export const getMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { conversationId } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    if (!userId || !isUuid(userId)) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (!conversationId || !isUuid(conversationId)) {
      res.status(400).json({ success: false, message: 'Valid conversation ID required' });
      return;
    }

    // Verify user is member of conversation
    const member = await prisma.conversation_members.findFirst({
      where: { conversation_id: conversationId, user_id: userId }
    });

    if (!member) {
      res.status(403).json({ success: false, message: 'Not a member of this conversation' });
      return;
    }

    const messages = await prisma.messages.findMany({
      where: { conversation_id: conversationId },
      include: {
        users: { select: { id: true, username: true, avatar_url: true } }
      },
      orderBy: { created_at: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    res.status(200).json({
      success: true,
      data: messages.map(msg => ({
        id: msg.id,
        conversationId: msg.conversation_id,
        senderId: msg.sender_id,
        senderUsername: msg.users.username,
        senderAvatar: msg.users.avatar_url,
        content: msg.content,
        messageType: msg.message_type,
        isRead: msg.is_read,
        isDelivered: msg.is_delivered,
        createdAt: msg.created_at
      }))
    });
  } catch (error: any) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
};

/**
 * Start or get direct conversation with another user
 */
export const getOrCreateDirectChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { otherUserId } = req.params;

    if (!userId || !isUuid(userId)) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (!otherUserId || !isUuid(otherUserId)) {
      res.status(400).json({ success: false, message: 'Valid user ID required' });
      return;
    }

    if (userId === otherUserId) {
      res.status(400).json({ success: false, message: 'Cannot create conversation with yourself' });
      return;
    }

    // Check if conversation already exists
    let conversation = await prisma.conversations.findFirst({
      where: {
        is_group: false,
        conversation_members: {
          every: {
            user_id: { in: [userId, otherUserId] }
          }
        }
      },
      include: { conversation_members: true }
    });

    if (!conversation) {
      // Create new conversation
      conversation = await prisma.conversations.create({
        data: {
          id: uuidv4(),
          is_group: false,
          conversation_members: {
            create: [
              { id: uuidv4(), user_id: userId },
              { id: uuidv4(), user_id: otherUserId }
            ]
          }
        },
        include: { conversation_members: true }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        conversationId: conversation!.id,
        isGroup: conversation!.is_group
      }
    });
  } catch (error: any) {
    console.error('Get or create direct chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to create conversation' });
  }
};

/**
 * Mark all messages as read in conversation
 */
export const markConversationAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { conversationId } = req.params;

    if (!userId || !isUuid(userId)) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (!conversationId || !isUuid(conversationId)) {
      res.status(400).json({ success: false, message: 'Valid conversation ID required' });
      return;
    }

    // Verify user is member
    const member = await prisma.conversation_members.findFirst({
      where: { conversation_id: conversationId, user_id: userId }
    });

    if (!member) {
      res.status(403).json({ success: false, message: 'Not a member of this conversation' });
      return;
    }

    // Mark all messages as read
    await prisma.messages.updateMany({
      where: { conversation_id: conversationId },
      data: { is_read: true }
    });

    res.status(200).json({ success: true, message: 'Conversation marked as read' });
  } catch (error: any) {
    console.error('Mark as read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
};
