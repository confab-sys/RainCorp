import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { isUuid } from '../../utils/validators';

const prisma = new PrismaClient();

/**
 * Send a friend request
 */
export const sendFriendRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const senderId = req.user; // From auth middleware
    const { receiverId } = req.body;

    if (!senderId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (!receiverId || !isUuid(receiverId)) {
      res.status(400).json({ success: false, message: 'Valid receiver ID is required' });
      return;
    }

    if (senderId === receiverId) {
      res.status(400).json({ success: false, message: 'Cannot send friend request to yourself' });
      return;
    }

    // Check if request already exists
    const existingRequest = await prisma.friend_requests.findFirst({
      where: {
        OR: [
          { sender_id: senderId, receiver_id: receiverId },
          { sender_id: receiverId, receiver_id: senderId }
        ]
      }
    });

    if (existingRequest) {
      res.status(400).json({ success: false, message: 'Friend request already exists' });
      return;
    }

    // Check if already friends
    const existingFriendship = await prisma.friends.findFirst({
      where: {
        OR: [
          { user_id: senderId, friend_id: receiverId },
          { user_id: receiverId, friend_id: senderId }
        ]
      }
    });

    if (existingFriendship) {
      res.status(400).json({ success: false, message: 'Already friends' });
      return;
    }

    // Create friend request
    const friendRequest = await prisma.friend_requests.create({
      data: {
        id: uuidv4(),
        sender_id: senderId,
        receiver_id: receiverId,
        status: 'pending'
      },
      include: {
        users_friend_requests_sender_idTousers: {
          select: {
            id: true,
            username: true,
            avatar_url: true
          }
        }
      }
    });

    // Create notification for receiver
    await prisma.notifications.create({
      data: {
        id: uuidv4(),
        user_id: receiverId,
        title: 'New Friend Request',
        message: `${friendRequest.users_friend_requests_sender_idTousers.username} sent you a friend request`,
        is_read: false
      }
    });

    res.status(201).json({
      success: true,
      message: 'Friend request sent successfully',
      friendRequest
    });
  } catch (error: any) {
    console.error('Send friend request error:', error);
    res.status(500).json({ success: false, message: 'Failed to send friend request' });
  }
};

/**
 * Get pending friend requests (received)
 */
export const getPendingRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const requests = await prisma.friend_requests.findMany({
      where: {
        receiver_id: userId,
        status: 'pending'
      },
      include: {
        users_friend_requests_sender_idTousers: {
          select: {
            id: true,
            username: true,
            email: true,
            avatar_url: true,
            bio: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    res.status(200).json({
      success: true,
      requests: requests.map(req => ({
        id: req.id,
        sender: req.users_friend_requests_sender_idTousers,
        status: req.status,
        createdAt: req.created_at
      }))
    });
  } catch (error: any) {
    console.error('Get pending requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch friend requests' });
  }
};

/**
 * Accept friend request
 */
export const acceptFriendRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { requestId } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const friendRequest = await prisma.friend_requests.findUnique({
      where: { id: requestId }
    });

    if (!friendRequest) {
      res.status(404).json({ success: false, message: 'Friend request not found' });
      return;
    }

    if (friendRequest.receiver_id !== userId) {
      res.status(403).json({ success: false, message: 'Not authorized' });
      return;
    }

    // Update request status
    await prisma.friend_requests.update({
      where: { id: requestId },
      data: { status: 'accepted' }
    });

    // Create friendship (bidirectional)
    await prisma.friends.createMany({
      data: [
        {
          id: uuidv4(),
          user_id: friendRequest.sender_id,
          friend_id: friendRequest.receiver_id,
          status: 'active'
        },
        {
          id: uuidv4(),
          user_id: friendRequest.receiver_id,
          friend_id: friendRequest.sender_id,
          status: 'active'
        }
      ]
    });

    // Create notification for sender
    await prisma.notifications.create({
      data: {
        id: uuidv4(),
        user_id: friendRequest.sender_id,
        title: 'Friend Request Accepted',
        message: 'Your friend request was accepted',
        is_read: false
      }
    });

    res.status(200).json({
      success: true,
      message: 'Friend request accepted'
    });
  } catch (error: any) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept friend request' });
  }
};

/**
 * Reject friend request
 */
export const rejectFriendRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { requestId } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const friendRequest = await prisma.friend_requests.findUnique({
      where: { id: requestId }
    });

    if (!friendRequest) {
      res.status(404).json({ success: false, message: 'Friend request not found' });
      return;
    }

    if (friendRequest.receiver_id !== userId) {
      res.status(403).json({ success: false, message: 'Not authorized' });
      return;
    }

    // Update request status
    await prisma.friend_requests.update({
      where: { id: requestId },
      data: { status: 'rejected' }
    });

    res.status(200).json({
      success: true,
      message: 'Friend request rejected'
    });
  } catch (error: any) {
    console.error('Reject friend request error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject friend request' });
  }
};

/**
 * Get friends list
 */
export const getFriends = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId || req.user;

    if (!userId || !isUuid(userId)) {
      res.status(401).json({ success: false, message: 'Authentication required or invalid user ID' });
      return;
    }

    // Get friends where current user is user_id
    const friendsAsUser = await prisma.friends.findMany({
      where: {
        user_id: userId,
        status: 'active'
      },
      include: {
        users_friends_friend_idTousers: {
          select: {
            id: true,
            username: true,
            email: true,
            avatar_url: true,
            bio: true,
            location: true
          }
        }
      }
    });

    // Get friends where current user is friend_id
    const friendsAsFriend = await prisma.friends.findMany({
      where: {
        friend_id: userId,
        status: 'active'
      },
      include: {
        users_friends_user_idTousers: {
          select: {
            id: true,
            username: true,
            email: true,
            avatar_url: true,
            bio: true,
            location: true
          }
        }
      }
    });

    // Combine and deduplicate friends
    const allFriends = [
      ...friendsAsUser.map(f => f.users_friends_friend_idTousers),
      ...friendsAsFriend.map(f => f.users_friends_user_idTousers)
    ];

    // Remove duplicates based on id
    const uniqueFriends = Array.from(
      new Map(allFriends.map(friend => [friend.id, friend])).values()
    );

    res.status(200).json({
      success: true,
      friends: uniqueFriends
    });
  } catch (error: any) {
    console.error('Get friends error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch friends' });
  }
};

/**
 * Check friendship status between two users
 */
export const checkFriendshipStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { targetUserId } = req.params;

    if (!userId || !isUuid(userId)) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    if (!targetUserId || !isUuid(targetUserId)) {
      res.status(400).json({ success: false, message: 'Valid target user ID is required' });
      return;
    }

    // Check if friends
    const friendship = await prisma.friends.findFirst({
      where: {
        OR: [
          { user_id: userId, friend_id: targetUserId },
          { user_id: targetUserId, friend_id: userId }
        ],
        status: 'active'
      }
    });

    if (friendship) {
      res.status(200).json({ success: true, status: 'friends' });
      return;
    }

    // Check for pending request
    const pendingRequest = await prisma.friend_requests.findFirst({
      where: {
        OR: [
          { sender_id: userId, receiver_id: targetUserId },
          { sender_id: targetUserId, receiver_id: userId }
        ],
        status: 'pending'
      }
    });

    if (pendingRequest) {
      const isSender = pendingRequest.sender_id === userId;
      res.status(200).json({
        success: true,
        status: isSender ? 'request_sent' : 'request_received',
        requestId: pendingRequest.id
      });
      return;
    }

    res.status(200).json({ success: true, status: 'none' });
  } catch (error: any) {
    console.error('Check friendship status error:', error);
    res.status(500).json({ success: false, message: 'Failed to check friendship status' });
  }
};

/**
 * Unfriend a user
 */
export const unfriend = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { friendId } = req.params;

    if (!userId || !isUuid(userId)) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    if (!friendId || !isUuid(friendId)) {
      res.status(400).json({ success: false, message: 'Valid friend ID is required' });
      return;
    }
    // Delete both friendship records
    await prisma.friends.deleteMany({
      where: {
        OR: [
          { user_id: userId, friend_id: friendId },
          { user_id: friendId, friend_id: userId }
        ]
      }
    });

    res.status(200).json({
      success: true,
      message: 'Unfriended successfully'
    });
  } catch (error: any) {
    console.error('Unfriend error:', error);
    res.status(500).json({ success: false, message: 'Failed to unfriend' });
  }
};
