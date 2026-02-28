import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

const followUser = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user as string;
  const { targetUserId } = req.params;

  if (!targetUserId) {
    res.status(400).send({ message: 'Target user ID is required.' });
    return;
  }

  if (userId === targetUserId) {
    res.status(400).send({ message: 'Cannot follow yourself.' });
    return;
  }

  const [user, targetUser] = await Promise.all([
    prisma.users.findUnique({ where: { id: userId } }),
    prisma.users.findUnique({ where: { id: targetUserId } })
  ]);

  if (!user || !targetUser) {
    res.status(404).send({ message: 'User not found.' });
    return;
  }

  const existingFriend = await prisma.friends.findFirst({
    where: {
      AND: [
        { user_id: userId },
        { friend_id: targetUserId },
      ]
    }
  });

  if (existingFriend) {
    res.status(400).send({ message: 'Already following this user.' });
    return;
  }

  await prisma.friends.create({
    data: {
      id: uuidv4(),
      user_id: userId,
      friend_id: targetUserId,
      status: 'accepted',
    }
  });

  // Create notification
  await prisma.notifications.create({
    data: {
      id: uuidv4(),
      user_id: targetUserId,
      title: 'New Follower',
      message: `${user.username} started following you`,
      is_read: false,
    }
  });

  res.status(200).json({ message: 'User followed successfully.' });
};

const unfollowUser = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user as string;
  const { targetUserId } = req.params;

  if (!targetUserId) {
    res.status(400).send({ message: 'Target user ID is required.' });
    return;
  }

  const friend = await prisma.friends.findFirst({
    where: {
      AND: [
        { user_id: userId },
        { friend_id: targetUserId },
      ]
    }
  });

  if (!friend) {
    res.status(400).send({ message: 'Not following this user.' });
    return;
  }

  await prisma.friends.delete({
    where: { id: friend.id }
  });

  res.status(200).json({ message: 'User unfollowed successfully.' });
};

const getFollowers = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  const followers = await prisma.friends.findMany({
    where: { friend_id: userId },
    take: limit,
    skip: (page - 1) * limit,
    include: {
      users_friends_user_idTousers: {
        select: {
          id: true,
          username: true,
          avatar_url: true,
          bio: true,
        }
      }
    }
  });

  const formattedFollowers = followers.map(f => ({
    ...f.users_friends_user_idTousers,
  }));

  res.status(200).json(formattedFollowers);
};

const getFollowing = async (req: Request, res: Response):Promise<void> => {
  const { userId } = req.params;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  const following = await prisma.friends.findMany({
    where: { user_id: userId },
    take: limit,
    skip: (page - 1) * limit,
    include: {
      users_friends_friend_idTousers: {
        select: {
          id: true,
          username: true,
          avatar_url: true,
          bio: true,
        }
      }
    }
  });

  const formattedFollowing = following.map(f => ({
    ...f.users_friends_friend_idTousers,
  }));

  res.status(200).json(formattedFollowing);
};

const getUserFeed = async (req: Request, res: Response):Promise<void> => {
  const userId = req.user as string;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  // Get users that current user follows
  const following = await prisma.friends.findMany({
    where: { user_id: userId },
    select: { friend_id: true }
  });

  const followingIds = following.map(f => f.friend_id);

  // Include user's own posts and posts from followed users
  const feedPosts = await prisma.posts.findMany({
    where: {
      author_id: { in: [...followingIds, userId] },
    },
    orderBy: { created_at: 'desc' },
    take: limit,
    skip: (page - 1) * limit,
    include: {
      users: {
        select: {
          id: true,
          username: true,
          avatar_url: true,
        }
      },
      _count: {
        select: {
          comments: true,
          likes: true,
        }
      }
    }
  });

  const postsWithCounts = feedPosts.map(post => ({
    id: post.id,
    title: post.title,
    content: post.content,
    author_id: post.author_id,
    created_at: post.created_at,
    updated_at: post.updated_at,
    author: post.users, // Map users to author for frontend compatibility
    commentsCount: post._count.comments,
    likesCount: post._count.likes,
  }));

  res.status(200).json(postsWithCounts);
};

const searchUsers = async (req: Request, res: Response):Promise<void> => {
  const { query } = req.query;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  if (!query || typeof query !== 'string') {
    res.status(400).send({ message: 'Search query is required.' });
    return;
  }

  const users = await prisma.users.findMany({
    where: {
      OR: [
        {
          username: {
            contains: query,
            mode: 'insensitive'
          }
        },
        {
          email: {
            contains: query,
            mode: 'insensitive'
          }
        }
      ]
    },
    take: limit,
    skip: (page - 1) * limit,
    select: {
      id: true,
      username: true,
      avatar_url: true,
      bio: true,
      _count: {
        select: {
          posts: true,
        }
      }
    }
  });

  const usersWithCounts = users.map(user => ({
    ...user,
    postsCount: user._count.posts,
    _count: undefined,
  }));

  res.status(200).json(usersWithCounts);
};

export {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getUserFeed,
  searchUsers,
};