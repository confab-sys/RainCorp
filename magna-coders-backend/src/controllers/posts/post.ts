import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { processMentionAsync } from '../../services/magnaAI/mentionHandler';
import { isUuid } from '../../utils/validators';

const prisma = new PrismaClient();

const getPosts = async (req: Request, res: Response): Promise<void> => {
	const page = Math.max(Number(req.query.page || 1), 1);
	const limit = Math.max(Number(req.query.limit || 10), 1);
	const skip = (page - 1) * limit;
	const { categoryId, authorId, sortBy, postType, tags } = req.query as Record<string, string>;

	// Validate uuid parameters when provided to avoid Prisma P2023 errors
	if (categoryId && !isUuid(categoryId)) {
		res.status(400).json({ success: false, message: 'Invalid categoryId format' });
		return;
	}
	if (authorId && !isUuid(authorId)) {
		res.status(400).json({ success: false, message: 'Invalid authorId format' });
		return;
	}

	const where: any = {};
	if (categoryId) where.category_id = categoryId;
	if (authorId) where.author_id = authorId;
	if (postType) where.post_type = postType;

	// Tag filtering
	if (tags) {
		const tagNames = tags.split(',').map(t => t.trim().toLowerCase());
		where.post_tags = {
			some: {
				tags: {
					name: {
						in: tagNames
					}
				}
			}
		};
	}

	const orderBy: any = {};
	if (sortBy === 'trending') {
		orderBy.likes = { _count: 'desc' };
	} else {
		orderBy.created_at = 'desc';
	}

	const [posts, total] = await Promise.all([
		prisma.posts.findMany({
			where,
			skip,
			take: limit,
			orderBy,
			include: {
				users: {
					select: { id: true, username: true, avatar_url: true }
				},
				categories: {
					select: { id: true, name: true }
				},
				post_tags: {
					include: { tags: { select: { id: true, name: true } } }
				},
				post_media: {
					include: { media: { select: { id: true, url: true, type: true } } }
				},
				likes: { select: { id: true } },
				comments: { select: { id: true } },
				_count: {
					select: { likes: true, comments: true }
				}
			}
		}),
		prisma.posts.count({ where })
	]);

	const totalPages = Math.ceil(total / limit);

	res.status(200).json({ 
		posts: posts.map(post => ({
			...post,
			author: post.users, // Map users to author for frontend compatibility
			likesCount: post._count.likes,
			commentsCount: post._count.comments,
			tags: post.post_tags.map(pt => pt.tags),
			mediaUrls: post.post_media.map(pm => pm.media.url)
		})), 
		totalPages, 
		currentPage: page,
		total
	});
};

const getPostById = async (req: Request, res: Response): Promise<void> => {
	const { id } = req.params;
	const userId = req.user;

	const post = await prisma.posts.findUnique({
		where: { id },
		include: {
			users: { select: { id: true, username: true, avatar_url: true } },
			categories: { select: { id: true, name: true } },
			post_tags: { include: { tags: { select: { id: true, name: true } } } },
			post_media: {
				include: { media: { select: { id: true, url: true, type: true } } }
			},
			comments: {
				orderBy: { created_at: 'desc' },
				where: { parent_id: null },
				take: 10,
				include: { 
					users: { select: { id: true, username: true, avatar_url: true } },
					other_comments: {
						orderBy: { created_at: 'asc' },
						include: { users: { select: { id: true, username: true, avatar_url: true } } }
					}
				}
			},
			likes: { select: { id: true, user_id: true } },
			_count: {
				select: { likes: true, comments: true }
			}
		}
	}).catch(() => null);

	if (!post) {
		res.status(404).json({ message: 'Post not found' });
		return;
	}

	res.status(200).json({
		...post,
		author: post.users, // Map users to author for frontend compatibility
		comments: post.comments.map(comment => ({
			...comment,
			author: comment.users,
			replies: comment.other_comments?.map(reply => ({
				...reply,
				author: reply.users
			}))
		})),
		likesCount: post._count.likes,
		commentsCount: post._count.comments,
		isLiked: userId ? post.likes.some(l => l.user_id === userId) : false,
		tags: post.post_tags.map(pt => pt.tags),
		mediaUrls: post.post_media.map(pm => pm.media.url)
	});
};

const createPost = async (req: Request, res: Response): Promise<void> => {
	const authorId = req.user;
	const { title, content, post_type = 'regular', tags, categoryId, mediaUrls } = req.body;

	if (!authorId) {
		res.status(401).json({ message: 'Authentication required' });
		return;
	}

	if (!title || typeof title !== 'string' || title.trim().length === 0) {
		res.status(400).json({ message: 'Title is required' });
		return;
	}

	const postId = uuidv4();
	
	const post = await prisma.posts.create({
		data: {
			id: postId,
			title: title.trim(),
			content: content || null,
			post_type: post_type,
			category_id: categoryId || null,
			author_id: authorId,
		}
	});

	// Add tags if provided
	if (tags && Array.isArray(tags) && tags.length > 0) {
		const tagIds = await Promise.all(
			tags.map(async (tagName: string) => {
				const tag = await prisma.tags.findUnique({
					where: { name: tagName.trim().toLowerCase() }
				});
				if (tag) return tag.id;
				const newTag = await prisma.tags.create({
					data: { id: uuidv4(), name: tagName.trim().toLowerCase() }
				});
				return newTag.id;
			})
		);

		await Promise.all(
			tagIds.map(tagId =>
				prisma.post_tags.create({
					data: { id: uuidv4(), post_id: postId, tag_id: tagId }
				})
			)
		);
	}

	// Add media if provided
	if (mediaUrls && Array.isArray(mediaUrls) && mediaUrls.length > 0) {
		await Promise.all(
			mediaUrls.map(async (mediaUrl: string) => {
				// Determine media type from data URL prefix
				const mediaType = mediaUrl.startsWith('data:video/') ? 'video' : 'image';
				
				// Create media entry
				const mediaId = uuidv4();
				await prisma.media.create({
					data: {
						id: mediaId,
						url: mediaUrl,
						type: mediaType
					}
				});

				// Link media to post
				await prisma.post_media.create({
					data: {
						id: uuidv4(),
						post_id: postId,
						media_id: mediaId
					}
				});
			})
		);
	}

	const createdPost = await prisma.posts.findUnique({
		where: { id: postId },
		include: {
			users: { select: { id: true, username: true, avatar_url: true } },
			post_tags: { include: { tags: { select: { id: true, name: true } } } },
			post_media: { include: { media: { select: { id: true, url: true, type: true } } } },
			_count: { select: { likes: true, comments: true } }
		}
	});

	// Check for @magnaai mention and process asynchronously
	processMentionAsync(postId);

	res.status(201).json({
		...createdPost,
		author: createdPost?.users, // Map users to author for frontend compatibility
		likesCount: createdPost?._count.likes || 0,
		commentsCount: createdPost?._count.comments || 0,
		tags: createdPost?.post_tags.map(pt => pt.tags) || [],
		mediaUrls: createdPost?.post_media.map(pm => pm.media.url) || []
	});
};

const updatePost = async (req: Request, res: Response): Promise<void> => {
	const { id } = req.params;
	const userId = req.user;
	const { title, content, tags, categoryId } = req.body;

	if (!userId || !id) {
		res.status(401).json({ message: 'Authentication required' });
		return;
	}

	const post = await prisma.posts.findUnique({ where: { id } });
	if (!post) {
		res.status(404).json({ message: 'Post not found' });
		return;
	}

	if (post.author_id !== userId) {
		res.status(403).json({ message: 'Access denied' });
		return;
	}

	const updated = await prisma.posts.update({
		where: { id },
		data: {
			title: title !== undefined ? title : post.title,
			content: content !== undefined ? content : post.content,
			category_id: categoryId !== undefined ? categoryId : post.category_id,
		}
	});

	// Update tags if provided
	if (tags && Array.isArray(tags)) {
		// Remove old tags
		await prisma.post_tags.deleteMany({ where: { post_id: id } });

		// Add new tags
		if (tags.length > 0) {
			const tagIds = await Promise.all(
				tags.map(async (tagName: string) => {
					const tag = await prisma.tags.findUnique({
						where: { name: tagName.trim().toLowerCase() }
					});
					if (tag) return tag.id;
					const newTag = await prisma.tags.create({
						data: { id: uuidv4(), name: tagName.trim().toLowerCase() }
					});
					return newTag.id;
				})
			);

			await Promise.all(
				tagIds.map(tagId =>
					prisma.post_tags.create({
						data: { id: uuidv4(), post_id: id, tag_id: tagId }
					})
				)
			);
		}
	}

	const updatedPost = await prisma.posts.findUnique({
		where: { id },
		include: {
			post_tags: { include: { tags: { select: { id: true, name: true } } } },
			_count: { select: { likes: true, comments: true } }
		}
	});

	res.status(200).json({
		...updatedPost,
		likesCount: updatedPost?._count.likes || 0,
		commentsCount: updatedPost?._count.comments || 0,
		tags: updatedPost?.post_tags.map(pt => pt.tags) || []
	});
};

const deletePost = async (req: Request, res: Response): Promise<void> => {
	const { id } = req.params;
	const userId = req.user;

	if (!userId) {
		res.status(401).json({ message: 'Authentication required' });
		return;
	}

	const post = await prisma.posts.findUnique({ where: { id } });
	if (!post) {
		res.status(404).json({ message: 'Post not found' });
		return;
	}

	if (post.author_id !== userId) {
		res.status(403).json({ message: 'Access denied' });
		return;
	}

	await prisma.posts.delete({ where: { id } });

	res.status(200).json({ message: 'Post deleted successfully' });
};

const likePost = async (req: Request, res: Response): Promise<void> => {
	const { id } = req.params;
	const userId = req.user;

	if (!userId || !id) {
		res.status(401).json({ message: 'Authentication required' });
		return;
	}

	// Verify post exists
	const post = await prisma.posts.findUnique({ where: { id } });
	if (!post) {
		res.status(404).json({ message: 'Post not found' });
		return;
	}

	const existing = await prisma.likes.findFirst({
		where: { post_id: id, user_id: userId }
	});

	// Toggle like: if already liked, unlike it; if not liked, like it
	if (existing) {
		// Unlike the post
		await prisma.likes.delete({ where: { id: existing.id } });
		const likesCount = await prisma.likes.count({ where: { post_id: id } });
		res.status(200).json({ liked: false, likesCount });
		return;
	}

	// Like the post
	await prisma.likes.create({
		data: { id: uuidv4(), post_id: id, user_id: userId }
	});

	const likesCount = await prisma.likes.count({ where: { post_id: id } });

	res.status(200).json({ liked: true, likesCount });
};

const unlikePost = async (req: Request, res: Response): Promise<void> => {
	const { id } = req.params;
	const userId = req.user;

	if (!userId || !id) {
		res.status(401).json({ message: 'Authentication required' });
		return;
	}

	// Verify post exists
	const post = await prisma.posts.findUnique({ where: { id } });
	if (!post) {
		res.status(404).json({ message: 'Post not found' });
		return;
	}

	const existing = await prisma.likes.findFirst({
		where: { post_id: id, user_id: userId }
	});

	if (!existing) {
		res.status(400).json({ message: 'Post not liked' });
		return;
	}

	await prisma.likes.delete({ where: { id: existing.id } });

	const likesCount = await prisma.likes.count({ where: { post_id: id } });

	res.status(200).json({ liked: false, likesCount });
};

export { getPosts, getPostById, createPost, updatePost, deletePost, likePost, unlikePost };