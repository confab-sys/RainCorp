import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

/**
 * Get all chats for the authenticated user
 */
export const getUserChats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { type } = req.query;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Get all conversations where user is a member
    const conversations = await prisma.conversations.findMany({
      where: {
        conversation_members: {
          some: { user_id: userId }
        },
        ...(type && { is_group: type === 'GROUP' })
      },
      include: {
        conversation_members: {
          include: {
            users: {
              select: {
                id: true,
                username: true,
                avatar_url: true
              }
            }
          }
        },
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: {
            content: true,
            created_at: true
          }
        }
      },
      orderBy: { updated_at: 'desc' }
    });

    // Map to frontend format
    const chats = conversations.map(conv => {
      const otherMembers = conv.conversation_members.filter(m => m.user_id !== userId);
      const chatName = conv.is_group 
        ? conv.name 
        : otherMembers[0]?.users.username || 'Unknown User';

      return {
        id: conv.id,
        type: conv.is_group ? 'GROUP' : 'DIRECT',
        name: chatName,
        participants: conv.conversation_members.map(m => m.user_id),
        createdAt: conv.created_at,
        lastMessage: conv.messages[0] || null,
        unreadCount: 0 // TODO: Implement unread count logic
      };
    });

    res.status(200).json(chats);
  } catch (error: any) {
    console.error('Get user chats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chats' });
  }
};

/**
 * Get a specific chat by ID
 */
export const getChatById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { chatId } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const conversation = await prisma.conversations.findUnique({
      where: { id: chatId },
      include: {
        conversation_members: {
          include: {
            users: {
              select: {
                id: true,
                username: true,
                avatar_url: true,
                bio: true
              }
            }
          }
        }
      }
    });

    if (!conversation) {
      res.status(404).json({ success: false, message: 'Chat not found' });
      return;
    }

    // Check if user is a member
    const isMember = conversation.conversation_members.some(m => m.user_id === userId);
    if (!isMember) {
      res.status(403).json({ success: false, message: 'Not a member of this chat' });
      return;
    }

    const otherMembers = conversation.conversation_members.filter(m => m.user_id !== userId);
    const chatName = conversation.is_group 
      ? conversation.name 
      : otherMembers[0]?.users.username || 'Unknown User';

    res.status(200).json({
      id: conversation.id,
      type: conversation.is_group ? 'GROUP' : 'DIRECT',
      name: chatName,
      description: conversation.is_group ? conversation.name : otherMembers[0]?.users.bio,
      participants: conversation.conversation_members.map(m => m.user_id),
      members: conversation.conversation_members.map(m => m.users),
      createdAt: conversation.created_at
    });
  } catch (error: any) {
    console.error('Get chat by ID error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chat' });
  }
};

/**
 * Create a direct chat with another user
 */
export const createDirectChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { participantId } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (!participantId) {
      res.status(400).json({ success: false, message: 'Participant ID is required' });
      return;
    }

    // Check if participant exists
    const participant = await prisma.users.findUnique({
      where: { id: participantId }
    });

    if (!participant) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Check if direct chat already exists between these users
    const existingChat = await prisma.conversations.findFirst({
      where: {
        is_group: false,
        conversation_members: {
          every: {
            OR: [
              { user_id: userId },
              { user_id: participantId }
            ]
          }
        }
      },
      include: {
        conversation_members: true
      }
    });

    // Verify it's exactly these two users
    if (existingChat && existingChat.conversation_members.length === 2) {
      const memberIds = existingChat.conversation_members.map(m => m.user_id).sort();
      const targetIds = [userId, participantId].sort();
      
      if (memberIds[0] === targetIds[0] && memberIds[1] === targetIds[1]) {
        res.status(200).json({
          id: existingChat.id,
          type: 'DIRECT',
          name: participant.username,
          participants: [userId, participantId],
          createdAt: existingChat.created_at
        });
        return;
      }
    }

    // Create new direct chat
    const conversationId = uuidv4();
    
    const conversation = await prisma.conversations.create({
      data: {
        id: conversationId,
        is_group: false,
        conversation_members: {
          create: [
            { id: uuidv4(), user_id: userId },
            { id: uuidv4(), user_id: participantId }
          ]
        }
      }
    });

    res.status(201).json({
      id: conversation.id,
      type: 'DIRECT',
      name: participant.username,
      participants: [userId, participantId],
      createdAt: conversation.created_at
    });
  } catch (error: any) {
    console.error('Create direct chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to create chat' });
  }
};

/**
 * Create a group chat
 */
export const createGroupChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { name, participantIds } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (!name || !participantIds || !Array.isArray(participantIds)) {
      res.status(400).json({ success: false, message: 'Name and participant IDs are required' });
      return;
    }

    // Verify all participants exist
    const participants = await prisma.users.findMany({
      where: { id: { in: participantIds } }
    });

    if (participants.length !== participantIds.length) {
      res.status(404).json({ success: false, message: 'One or more users not found' });
      return;
    }

    // Create group chat (include creator)
    const conversationId = uuidv4();
    const allParticipants = [userId, ...participantIds.filter((id: string) => id !== userId)];
    
    const conversation = await prisma.conversations.create({
      data: {
        id: conversationId,
        name,
        is_group: true,
        conversation_members: {
          create: allParticipants.map((id: string) => ({
            id: uuidv4(),
            user_id: id
          }))
        }
      }
    });

    res.status(201).json({
      id: conversation.id,
      type: 'GROUP',
      name: conversation.name,
      participants: allParticipants,
      createdAt: conversation.created_at
    });
  } catch (error: any) {
    console.error('Create group chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to create group chat' });
  }
};

/**
 * Get messages from a chat
 */
export const getChatMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { chatId } = req.params;
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.max(Number(req.query.limit || 50), 1);
    const skip = (page - 1) * limit;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Verify user is a member of this chat
    const membership = await prisma.conversation_members.findFirst({
      where: {
        conversation_id: chatId,
        user_id: userId
      }
    });

    if (!membership) {
      res.status(403).json({ success: false, message: 'Not a member of this chat' });
      return;
    }

    // Get messages
    const [messages, total] = await Promise.all([
      prisma.messages.findMany({
        where: { conversation_id: chatId },
        orderBy: { created_at: 'asc' },
        skip,
        take: limit,
        include: {
          users: {
            select: {
              id: true,
              username: true,
              avatar_url: true
            }
          }
        }
      }),
      prisma.messages.count({ where: { conversation_id: chatId } })
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json(messages.map(msg => ({
      id: msg.id,
      content: msg.content,
      messageType: msg.message_type,
      fileUrl: msg.file_url,
      fileName: msg.file_name,
      fileSize: msg.file_size,
      fileType: msg.file_type,
      senderId: msg.sender_id,
      sender: msg.users,
      createdAt: msg.created_at,
      isRead: msg.is_read || false
    })));
  } catch (error: any) {
    console.error('Get chat messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
};

/**
 * Send a message to a chat
 */
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { chatId } = req.params;
    const { content, messageType, fileUrl, fileName, fileSize, fileType } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (!chatId) {
      res.status(400).json({ success: false, message: 'Chat ID is required' });
      return;
    }

    // Validate based on message type
    const type = messageType || 'TEXT';
    
    if (type === 'TEXT' && (!content || typeof content !== 'string' || content.trim().length === 0)) {
      res.status(400).json({ success: false, message: 'Message content is required for text messages' });
      return;
    }

    if ((type === 'IMAGE' || type === 'FILE') && !fileUrl) {
      res.status(400).json({ success: false, message: 'File URL is required for file messages' });
      return;
    }

    // Verify user is a member of this chat
    const membership = await prisma.conversation_members.findFirst({
      where: {
        conversation_id: chatId,
        user_id: userId
      }
    });

    if (!membership) {
      res.status(403).json({ success: false, message: 'Not a member of this chat' });
      return;
    }

    // Create message
    const message = await prisma.messages.create({
      data: {
        id: uuidv4(),
        content: content?.trim() || (type === 'IMAGE' ? 'Sent an image' : `Sent a file: ${fileName || 'file'}`),
        message_type: type,
        file_url: fileUrl || null,
        file_name: fileName || null,
        file_size: fileSize || null,
        file_type: fileType || null,
        sender_id: userId,
        conversation_id: chatId as string
      }
    });

    // Fetch sender info
    const sender = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        avatar_url: true
      }
    });

    // Update conversation updated_at
    await prisma.conversations.update({
      where: { id: chatId },
      data: { updated_at: new Date() }
    });

    res.status(201).json({
      id: message.id,
      content: message.content,
      messageType: message.message_type,
      fileUrl: message.file_url,
      fileName: message.file_name,
      fileSize: message.file_size,
      fileType: message.file_type,
      senderId: message.sender_id,
      sender: sender,
      createdAt: message.created_at,
      isRead: message.is_read || false
    });
  } catch (error: any) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
};

/**
 * Leave a chat
 */
export const leaveChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { chatId } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Find membership
    const membership = await prisma.conversation_members.findFirst({
      where: {
        conversation_id: chatId,
        user_id: userId
      }
    });

    if (!membership) {
      res.status(403).json({ success: false, message: 'Not a member of this chat' });
      return;
    }

    // Remove membership
    await prisma.conversation_members.delete({
      where: { id: membership.id }
    });

    // Check if conversation has no more members, delete it
    const remainingMembers = await prisma.conversation_members.count({
      where: { conversation_id: chatId }
    });

    if (remainingMembers === 0) {
      await prisma.conversations.delete({
        where: { id: chatId }
      });
    }

    res.status(200).json({ success: true, message: 'Successfully left the chat' });
  } catch (error: any) {
    console.error('Leave chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to leave chat' });
  }
};


/**
 * Mark messages as read in a chat
 */
export const markMessagesAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { chatId } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Verify user is a member of this chat
    const membership = await prisma.conversation_members.findFirst({
      where: {
        conversation_id: chatId,
        user_id: userId
      }
    });

    if (!membership) {
      res.status(403).json({ success: false, message: 'Not a member of this chat' });
      return;
    }

    // Mark all messages in this chat as read (except user's own messages)
    await prisma.messages.updateMany({
      where: {
        conversation_id: chatId,
        sender_id: { not: userId },
        is_read: false
      },
      data: {
        is_read: true
      }
    });

    res.status(200).json({ success: true, message: 'Messages marked as read' });
  } catch (error: any) {
    console.error('Mark messages as read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark messages as read' });
  }
};


/**
 * Upload a file for messaging
 */
export const uploadFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const file = req.file;
    const fileUrl = `/uploads/${file.filename}`;
    
    res.status(200).json({
      success: true,
      fileUrl,
      fileName: file.originalname,
      fileSize: file.size,
      fileType: file.mimetype
    });
  } catch (error: any) {
    console.error('Upload file error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload file' });
  }
};
