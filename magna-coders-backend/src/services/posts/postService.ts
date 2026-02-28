import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// TypeScript interfaces
interface CreatePostData {
  title: string;
  content?: string;
  categoryId?: string;
  authorId: string;
  imageLink?: string;
  imageId?: string;
}

interface PostQueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  categoryId?: string;
  authorId?: string;
}

interface UpdatePostData {
  content?: string;
  tags?: string[];
  categoryId?: string;
}

interface PostServiceResponse {
  success: boolean;
  data?: any;
  message?: string;
}

interface PostError {
  code: string;
  message: string;
  statusCode: number;
  details?: any;
}

// Logger utility
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[POST SERVICE INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[POST SERVICE ERROR] ${message}`, error ? JSON.stringify(error, null, 2) : '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[POST SERVICE WARN] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

class PostService {
  // Create new post
  async createPost(postData: CreatePostData): Promise<any> {
    try {
      // Validate post data
      if (!postData.title?.trim()) {
        const error: PostError = {
          code: 'INVALID_TITLE',
          message: 'Title is required',
          statusCode: 400
        };
        logger.error('Post creation failed: Invalid title', error);
        throw error;
      }

      if (!postData.content && !postData.imageLink) {
        const error: PostError = {
          code: 'INVALID_CONTENT',
          message: 'Content or image is required',
          statusCode: 400
        };
        logger.error('Post creation failed: No content or image', error);
        throw error;
      }

      logger.info('Creating new post', {
        title: postData.title,
        authorId: postData.authorId
      });

      // Create post using Prisma
      const post = await prisma.posts.create({
        data: {
          id: uuidv4(),
          title: postData.title.trim(),
          content: postData.content?.trim(),
          author_id: postData.authorId,
          category_id: postData.categoryId,
          // Note: imageLink and imageId would be stored in post_media table
          // For now, we'll assume they're stored directly on posts
        },
        include: {
          users: {
            select: {
              id: true,
              username: true,
              email: true
            }
          },
          categories: true
        }
      });

      logger.info('Post created successfully', { postId: post.id });
      return post;

    } catch (error: any) {
      // Re-throw custom errors
      if (error.code && error.statusCode) {
        throw error;
      }

      // Handle Prisma errors
      logger.error('Database error in createPost', error);
      const dbError: PostError = {
        code: 'DATABASE_ERROR',
        message: 'Failed to create post',
        statusCode: 500,
        details: error.message
      };
      throw dbError;
    }
  }

  // Get posts with filtering and pagination
  async getPosts(options: PostQueryOptions = {}): Promise<any> {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'created_at',
        categoryId,
        authorId
      } = options;

      const skip = (page - 1) * limit;

      logger.info('Fetching posts', { page, limit, categoryId, authorId });

      const posts = await prisma.posts.findMany({
        where: {
          ...(categoryId && { category_id: categoryId }),
          ...(authorId && { author_id: authorId })
        },
        include: {
          users: {
            select: {
              id: true,
              username: true,
              email: true,
              avatar_url: true
            }
          },
          categories: true,
          likes: {
            select: {
              user_id: true
            }
          },
          comments: {
            select: {
              id: true
            }
          }
        },
        orderBy: {
          [sortBy]: 'desc'
        },
        skip,
        take: limit
      });

      const total = await prisma.posts.count({
        where: {
          ...(categoryId && { category_id: categoryId }),
          ...(authorId && { author_id: authorId })
        }
      });

      return {
        posts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error: any) {
      logger.error('Database error in getPosts', error);
      const dbError: PostError = {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch posts',
        statusCode: 500,
        details: error.message
      };
      throw dbError;
    }
  }

  // Get single post with details
  async getPostById(id: string, userId?: string): Promise<any> {
    try {
      logger.info('Fetching post by ID', { postId: id, userId });

      const post = await prisma.posts.findUnique({
        where: { id },
        include: {
          users: {
            select: {
              id: true,
              username: true,
              email: true,
              avatar_url: true,
              bio: true
            }
          },
          categories: true,
          likes: {
            select: {
              user_id: true
            }
          },
          comments: {
            include: {
              users: {
                select: {
                  id: true,
                  username: true,
                  avatar_url: true
                }
              }
            },
            orderBy: {
              created_at: 'asc'
            }
          }
        }
      });

      if (!post) {
        const error: PostError = {
          code: 'POST_NOT_FOUND',
          message: 'Post not found',
          statusCode: 404
        };
        logger.warn('Post not found', { postId: id });
        throw error;
      }

      // Increment view count (assuming posts table has a views field)
      // await prisma.posts.update({
      //   where: { id },
      //   data: { views: { increment: 1 } }
      // });

      logger.info('Post retrieved successfully', { postId: id });
      return post;

    } catch (error: any) {
      // Re-throw custom errors
      if (error.code && error.statusCode) {
        throw error;
      }

      logger.error('Database error in getPostById', error);
      const dbError: PostError = {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch post',
        statusCode: 500,
        details: error.message
      };
      throw dbError;
    }
  }

  // Update post
  async updatePost(id: string, updates: UpdatePostData, authorId: string): Promise<any> {
    try {
      logger.info('Updating post', { postId: id, authorId });

      // Check if post exists and user has permission
      const post = await prisma.posts.findUnique({
        where: { id },
        select: {
          id: true,
          author_id: true
        }
      });

      if (!post) {
        const error: PostError = {
          code: 'POST_NOT_FOUND',
          message: 'Post not found',
          statusCode: 404
        };
        logger.warn('Post not found for update', { postId: id });
        throw error;
      }

      if (post.author_id !== authorId) {
        const error: PostError = {
          code: 'ACCESS_DENIED',
          message: 'Access denied',
          statusCode: 403
        };
        logger.warn('Access denied for post update', { postId: id, authorId });
        throw error;
      }

      // Update post
      const updatedPost = await prisma.posts.update({
        where: { id },
        data: {
          ...(updates.content && { content: updates.content.trim() }),
          ...(updates.tags && { tags: updates.tags }),
          ...(updates.categoryId && { category_id: updates.categoryId }),
          updated_at: new Date()
        },
        include: {
          users: {
            select: {
              id: true,
              username: true
            }
          },
          categories: true
        }
      });

      logger.info('Post updated successfully', { postId: id });
      return updatedPost;

    } catch (error: any) {
      // Re-throw custom errors
      if (error.code && error.statusCode) {
        throw error;
      }

      logger.error('Database error in updatePost', error);
      const dbError: PostError = {
        code: 'DATABASE_ERROR',
        message: 'Failed to update post',
        statusCode: 500,
        details: error.message
      };
      throw dbError;
    }
  }

  // Delete post
  async deletePost(id: string, authorId: string): Promise<PostServiceResponse> {
    try {
      logger.info('Deleting post', { postId: id, authorId });

      // Check if post exists and user has permission
      const post = await prisma.posts.findUnique({
        where: { id },
        select: {
          id: true,
          author_id: true
        }
      });

      if (!post) {
        const error: PostError = {
          code: 'POST_NOT_FOUND',
          message: 'Post not found',
          statusCode: 404
        };
        logger.warn('Post not found for deletion', { postId: id });
        throw error;
      }

      if (post.author_id !== authorId) {
        const error: PostError = {
          code: 'ACCESS_DENIED',
          message: 'Access denied',
          statusCode: 403
        };
        logger.warn('Access denied for post deletion', { postId: id, authorId });
        throw error;
      }

      // Delete associated comments and replies
      await prisma.comments.deleteMany({
        where: { post_id: id }
      });

      // Delete the post
      await prisma.posts.delete({
        where: { id }
      });

      logger.info('Post deleted successfully', { postId: id });
      return {
        success: true,
        message: 'Post deleted successfully'
      };

    } catch (error: any) {
      // Re-throw custom errors
      if (error.code && error.statusCode) {
        throw error;
      }

      logger.error('Database error in deletePost', error);
      const dbError: PostError = {
        code: 'DATABASE_ERROR',
        message: 'Failed to delete post',
        statusCode: 500,
        details: error.message
      };
      throw dbError;
    }
  }

  // Get trending posts
  async getTrendingPosts(limit: number = 10): Promise<any> {
    try {
      logger.info('Fetching trending posts', { limit });

      // This would typically use a complex algorithm based on likes, comments, views, recency
      // For now, we'll sort by most liked posts in the last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const posts = await prisma.posts.findMany({
        where: {
          created_at: {
            gte: sevenDaysAgo
          }
        },
        include: {
          users: {
            select: {
              id: true,
              username: true,
              avatar_url: true
            }
          },
          categories: true,
          likes: {
            select: {
              user_id: true
            }
          },
          comments: {
            select: {
              id: true
            }
          }
        },
        orderBy: {
          likes: {
            _count: 'desc'
          }
        },
        take: limit
      });

      return posts;

    } catch (error: any) {
      logger.error('Database error in getTrendingPosts', error);
      const dbError: PostError = {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch trending posts',
        statusCode: 500,
        details: error.message
      };
      throw dbError;
    }
  }

  // Get posts by category
  async getPostsByCategory(categoryId: string, options: PostQueryOptions = {}): Promise<any> {
    return await this.getPosts({ ...options, categoryId });
  }

  // Get user's posts
  async getUserPosts(userId: string, options: PostQueryOptions = {}): Promise<any> {
    return await this.getPosts({ ...options, authorId: userId });
  }
}

export default PostService;