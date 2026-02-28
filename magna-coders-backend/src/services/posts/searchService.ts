import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// TypeScript interfaces
interface SearchOptions {
  query: string;
  page?: number;
  limit?: number;
  categoryId?: string;
  authorId?: string;
  postType?: 'TEXT' | 'IMAGE' | 'LINK' | 'PROJECT';
  sortBy?: 'relevance' | 'date' | 'likes';
}

interface SearchResult {
  posts: any[];
  total: number;
  query: string;
  took: number; // milliseconds
}

interface SearchError {
  code: string;
  message: string;
  statusCode: number;
  details?: any;
}

// Logger utility
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[SEARCH SERVICE INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[SEARCH SERVICE ERROR] ${message}`, error ? JSON.stringify(error, null, 2) : '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[SEARCH SERVICE WARN] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

class SearchService {
  // Search posts with advanced filtering
  async searchPosts(options: SearchOptions): Promise<SearchResult> {
    const startTime = Date.now();

    try {
      const {
        query,
        page = 1,
        limit = 20,
        categoryId,
        authorId,
        postType,
        sortBy = 'relevance'
      } = options;

      if (!query?.trim()) {
        const error: SearchError = {
          code: 'EMPTY_QUERY',
          message: 'Search query cannot be empty',
          statusCode: 400
        };
        logger.error('Empty search query', error);
        throw error;
      }

      logger.info('Searching posts', {
        query: query.trim(),
        page,
        limit,
        categoryId,
        authorId,
        postType,
        sortBy
      });

      const skip = (page - 1) * limit;
      const searchTerm = query.trim().toLowerCase();

      // Build where clause
      const where: any = {
        AND: [
          {
            OR: [
              { title: { contains: searchTerm, mode: 'insensitive' } },
              { content: { contains: searchTerm, mode: 'insensitive' } }
            ]
          }
        ]
      };

      // Add filters
      if (categoryId) {
        where.category_id = categoryId;
      }

      if (authorId) {
        where.author_id = authorId;
      }

      if (postType) {
        where.postType = postType;
      }

      // Determine sort order
      let orderBy: any;
      switch (sortBy) {
        case 'date':
          orderBy = { created_at: 'desc' };
          break;
        case 'likes':
          // This would require a more complex query with aggregations
          // For now, we'll sort by creation date
          orderBy = { created_at: 'desc' };
          break;
        case 'relevance':
        default:
          // For relevance, we'll sort by creation date (newer first)
          // In a real implementation, you'd use full-text search ranking
          orderBy = { created_at: 'desc' };
          break;
      }

      // Execute search
      const [posts, total] = await Promise.all([
        prisma.posts.findMany({
          where,
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
          orderBy,
          skip,
          take: limit
        }),
        prisma.posts.count({ where })
      ]);

      const took = Date.now() - startTime;

      logger.info('Search completed', {
        query: searchTerm,
        totalResults: total,
        returnedResults: posts.length,
        took
      });

      return {
        posts,
        total,
        query: searchTerm,
        took
      };

    } catch (error: any) {
      // Re-throw custom errors
      if (error.code && error.statusCode) {
        throw error;
      }

      logger.error('Database error in searchPosts', error);
      const dbError: SearchError = {
        code: 'SEARCH_ERROR',
        message: 'An error occurred while searching posts',
        statusCode: 500,
        details: error.message
      };
      throw dbError;
    }
  }

  // Get search suggestions/autocomplete
  async getSearchSuggestions(query: string, limit: number = 10): Promise<string[]> {
    try {
      if (!query?.trim()) {
        return [];
      }

      const searchTerm = query.trim().toLowerCase();

      logger.info('Getting search suggestions', { query: searchTerm, limit });

      // Get posts that match the query (only by title since tags don't exist)
      const posts = await prisma.posts.findMany({
        where: {
          title: { contains: searchTerm, mode: 'insensitive' }
        },
        select: {
          title: true
        },
        take: limit * 2 // Get more to filter duplicates
      });

      const suggestions = new Set<string>();

      // Add matching titles
      posts.forEach(post => {
        if (post.title.toLowerCase().includes(searchTerm)) {
          suggestions.add(post.title);
        }
      });

      const result = Array.from(suggestions).slice(0, limit);

      logger.info('Search suggestions generated', {
        query: searchTerm,
        suggestionsCount: result.length
      });

      return result;

    } catch (error: any) {
      logger.error('Database error in getSearchSuggestions', error);
      return [];
    }
  }

  // Advanced search with filters
  async advancedSearch(options: {
    query?: string;
    tags?: string[];
    categoryId?: string;
    authorId?: string;
    postType?: 'TEXT' | 'IMAGE' | 'LINK' | 'PROJECT';
    dateFrom?: Date;
    dateTo?: Date;
    minLikes?: number;
    page?: number;
    limit?: number;
    sortBy?: 'relevance' | 'date' | 'likes';
  }): Promise<SearchResult> {
    const startTime = Date.now();

    try {
      const {
        query,
        tags,
        categoryId,
        authorId,
        postType,
        dateFrom,
        dateTo,
        minLikes,
        page = 1,
        limit = 20,
        sortBy = 'relevance'
      } = options;

      logger.info('Advanced search', {
        query,
        tags,
        categoryId,
        authorId,
        postType,
        dateFrom,
        dateTo,
        minLikes,
        page,
        limit,
        sortBy
      });

      const skip = (page - 1) * limit;

      // Build complex where clause
      const where: any = {};

      // Text search
      if (query?.trim()) {
        const searchTerm = query.trim().toLowerCase();
        where.OR = [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { content: { contains: searchTerm, mode: 'insensitive' } },
          { tags: { hasSome: [searchTerm] } }
        ];
      }

      // Tag filter - not available in current schema
      // if (tags?.length) {
      //   where.tags = { hasSome: tags };
      // }

      // Other filters
      if (categoryId) {
        where.category_id = categoryId;
      }

      if (authorId) {
        where.author_id = authorId;
      }

      if (postType) {
        where.postType = postType;
      }

      // Date range
      if (dateFrom || dateTo) {
        where.created_at = {};
        if (dateFrom) where.created_at.gte = dateFrom;
        if (dateTo) where.created_at.lte = dateTo;
      }

      // For likes filter, we'd need aggregation - simplified for now
      // if (minLikes) {
      //   // This would require a more complex query
      // }

      // Execute search
      const posts = await prisma.posts.findMany({
        where,
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
          created_at: 'desc'
        },
        skip,
        take: limit
      });

      const total = await prisma.posts.count({ where });
      const took = Date.now() - startTime;

      return {
        posts,
        total,
        query: query || '',
        took
      };

    } catch (error: any) {
      logger.error('Database error in advancedSearch', error);
      const dbError: SearchError = {
        code: 'ADVANCED_SEARCH_ERROR',
        message: 'An error occurred during advanced search',
        statusCode: 500,
        details: error.message
      };
      throw dbError;
    }
  }

  // Get trending search terms
  async getTrendingSearches(limit: number = 10): Promise<string[]> {
    try {
      // This would typically use a search analytics table
      // For now, return popular tags
      logger.info('Getting trending searches', { limit });

      // Since tags don't exist in current schema, return empty array
      // In future, this would analyze popular categories or keywords
      const trendingTags: string[] = [];

      logger.info('Trending searches retrieved', {
        count: trendingTags.length
      });

      return trendingTags;

    } catch (error: any) {
      logger.error('Database error in getTrendingSearches', error);
      return [];
    }
  }
}

export default SearchService;