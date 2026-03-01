import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import paginateResults from '../../utils/paginateResults';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

const getProjects = async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const categoryId = req.query.category as string;
  const sortBy = req.query.sortby as string;
  const visibility = req.query.visibility as string; // Allow filtering by visibility

  let orderBy: any = { created_at: 'desc' };
  switch (sortBy) {
    case 'budget_high':
      orderBy = { created_at: 'desc' };
      break;
    case 'budget_low':
      orderBy = { created_at: 'asc' };
      break;
    case 'deadline':
      orderBy = { created_at: 'asc' };
      break;
    case 'newest':
      orderBy = { created_at: 'desc' };
      break;
  }

  const where: any = {
    // Only show public projects by default (for feed)
    visibility: visibility || 'public'
  };
  if (categoryId) where.category_id = categoryId;

  const totalCount = await prisma.projects.count({ where });

  const projects = await prisma.projects.findMany({
    where,
    orderBy,
    take: limit,
    skip: (page - 1) * limit,
    include: {
      users: {
        select: { id: true, username: true, avatar_url: true }
      },
      categories: {
        select: { id: true, name: true }
      },
      project_members: {
        include: {
          users: {
            select: { id: true, username: true, avatar_url: true }
          }
        }
      },
      _count: {
        select: { project_members: true }
      }
    }
  });

  const paginated = paginateResults(page, limit, totalCount);

  const mappedProjects = projects.map(project => ({
    id: project.id,
    title: project.title,
    name: project.title, // Alias for frontend compatibility
    description: project.description,
    status: project.status,
    category: project.categories?.name || null,
    categoryId: project.category_id,
    techStack: project.tech_stack || [],
    difficulty: project.difficulty_level,
    level: project.difficulty_level, // Alias for frontend
    github: project.repository_url,
    image: project.featured_image_url,
    location: project.location,
    membersNeeded: project.members_needed,
    teamCount: project._count.project_members,
    members: project.project_members.map(m => ({
      id: m.user_id,
      username: m.users?.username,
      avatar_url: m.users?.avatar_url,
      role: m.role
    })),
    owner: project.users,
    deadline: project.deadline,
    visibility: project.visibility,
    created_at: project.created_at,
    updated_at: project.updated_at,
    type: 'project',
    membersJoined: project._count.project_members,
    deadlineProgress: project.deadline
      ? Math.max(0, Math.min(100, 100 - ((Date.now() - project.created_at!.getTime()) / (project.deadline.getTime() - project.created_at!.getTime())) * 100))
      : null,
    timeLeft: project.deadline ? Math.max(0, Math.floor((project.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null
  }));

  const paginatedProjects = {
    previous: paginated.results.previous,
    projects: mappedProjects, // Changed from 'results' to 'projects'
    next: paginated.results.next,
    total: totalCount,
    page,
    limit
  };

  res.status(200).json(paginatedProjects);
};

const getProjectById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user as string | undefined;

  const project = await prisma.projects.findUnique({
    where: { id },
    include: {
      users: {
        select: {
          id: true,
          username: true,
          avatar_url: true,
          bio: true,
        }
      },
      categories: {
        select: {
          id: true,
          name: true,
          description: true,
        }
      },
      project_members: {
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
      _count: {
        select: { project_members: true }
      }
    }
  });

  if (!project) {
    res.status(404).send({ message: 'Project not found.' });
    return;
  }

  // Check access permissions for private projects
  if (project.visibility === 'private') {
    // Allow access if user is the owner
    const isOwner = userId && project.owner_id === userId;
    
    // Allow access if user is a member
    const isMember = userId && project.project_members.some(member => member.user_id === userId);
    
    if (!isOwner && !isMember) {
      res.status(403).send({ message: 'Access denied. This project is private.' });
      return;
    }
  }

  res.status(200).json({
    id: project.id,
    title: project.title,
    name: project.title,
    description: project.description,
    status: project.status,
    category: project.categories?.name || null,
    categoryId: project.category_id,
    techStack: project.tech_stack || [],
    difficulty: project.difficulty_level,
    level: project.difficulty_level,
    github: project.repository_url,
    repositoryUrl: project.repository_url,
    image: project.featured_image_url,
    location: project.location,
    membersNeeded: project.members_needed,
    teamCount: project._count.project_members,
    members: project.project_members.map(m => ({
      id: m.user_id,
      username: m.users?.username,
      avatar_url: m.users?.avatar_url,
      role: m.role
    })),
    owner: {
      id: project.users.id,
      username: project.users.username,
      avatar_url: project.users.avatar_url,
      bio: project.users.bio
    },
    deadline: project.deadline,
    visibility: project.visibility,
    created_at: project.created_at,
    updated_at: project.updated_at,
    type: 'project',
    membersJoined: project._count.project_members,
    deadlineProgress: project.deadline
      ? Math.max(0, Math.min(100, 100 - ((Date.now() - project.created_at!.getTime()) / (project.deadline.getTime() - project.created_at!.getTime())) * 100))
      : null,
    timeLeft: project.deadline ? Math.max(0, Math.floor((project.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null
  });
};

const createProject = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user as string;
  const {
    title,
    description,
    category,        // Frontend sends 'category' not 'categoryId'
    categoryId,      // Keep for backward compatibility
    difficulty,      // Map to difficulty_level
    techStack,       // Map to tech_stack (array)
    membersNeeded,   // Map to members_needed
    github,          // Map to repository_url
    image,           // Base64 image data
    deadline,
    visibility = 'public', // Default to public
  } = req.body;

  if (!title || !description) {
    res.status(400).send({ message: 'Title and description are required.' });
    return;
  }

  const user = await prisma.users.findUnique({ 
    where: { id: userId },
    select: { id: true, username: true, email: true, profile_complete_percentage: true }
  });
  if (!user) {
    res.status(404).send({ message: 'User not found.' });
    return;
  }

  // Use category or categoryId (frontend sends 'category')
  const finalCategoryId = category || categoryId;

  if (finalCategoryId) {
    const categoryExists = await prisma.categories.findUnique({ where: { id: finalCategoryId } });
    if (!categoryExists) {
      res.status(404).send({ message: 'Category not found.' });
      return;
    }
  }

  // Process tech stack - convert to array if string
  let techStackArray: string[] = [];
  if (techStack) {
    if (Array.isArray(techStack)) {
      techStackArray = techStack;
    } else if (typeof techStack === 'string') {
      techStackArray = techStack.split(',').map(t => t.trim()).filter(Boolean);
    }
  }

  const projectId = uuidv4();
  
  const project = await prisma.projects.create({
    data: {
      id: projectId,
      title,
      description,
      owner_id: userId,
      category_id: finalCategoryId || null,
      members_needed: membersNeeded || 0,
      deadline: deadline ? new Date(deadline) : null,
      difficulty_level: difficulty || null,
      tech_stack: techStackArray,
      repository_url: github || null,
      featured_image_url: image || null, // Save base64 image
      visibility: visibility,
      status: 'draft', // Start as draft, can be published later
    },
    include: {
      users: {
        select: {
          id: true,
          username: true,
          avatar_url: true,
        }
      },
      categories: {
        select: {
          id: true,
          name: true,
        }
      },
      _count: {
        select: { project_members: true }
      }
    }
  });

  // If project is public, create a post in the feed
  if (visibility === 'public') {
    try {
      const postId = uuidv4();
      await prisma.posts.create({
        data: {
          id: postId,
          title: project.title,
          content: project.description,
          post_type: 'project',
          author_id: userId,
          category_id: finalCategoryId || null,
        }
      });

      // If project has an image, create media entry and link to post
      if (image) {
        try {
          const mediaId = uuidv4();
          await prisma.media.create({
            data: {
              id: mediaId,
              url: image,
              type: 'image',
            }
          });

          await prisma.post_media.create({
            data: {
              id: uuidv4(),
              post_id: postId,
              media_id: mediaId,
            }
          });
        } catch (mediaError) {
          console.error('Failed to create media for project post:', mediaError);
        }
      }
    } catch (postError) {
      console.error('Failed to create feed post for project:', postError);
      // Don't fail the project creation if post creation fails
    }
  }

  res.status(201).json({
    id: project.id,
    title: project.title,
    name: project.title,
    description: project.description,
    status: project.status,
    category: project.categories?.name || null,
    categoryId: project.category_id,
    techStack: techStackArray,
    difficulty: difficulty,
    level: difficulty,
    github: github,
    repositoryUrl: github,
    image: image,
    location: null,
    membersNeeded: membersNeeded,
    teamCount: project._count.project_members,
    members: [],
    owner: {
      id: project.users.id,
      username: project.users.username,
      avatar_url: project.users.avatar_url
    },
    deadline: project.deadline,
    visibility: project.visibility,
    created_at: project.created_at,
    updated_at: project.updated_at,
    type: 'project',
    membersJoined: project._count.project_members
  });
};

const updateProject = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user as string;
  const { 
    title, 
    description, 
    category, 
    categoryId,
    difficulty,
    techStack,
    membersNeeded, 
    github,
    image,
    deadline,
    visibility
  } = req.body;

  const project = await prisma.projects.findUnique({
    where: { id },
    include: { users: true }
  });

  if (!project) {
    res.status(404).send({ message: 'Project not found.' });
    return;
  }

  if (project.owner_id !== userId) {
    res.status(403).send({ message: 'Access denied.' });
    return;
  }

  // Use category or categoryId (frontend sends 'category')
  const finalCategoryId = category || categoryId;

  // Process tech stack - convert to array if string
  let techStackArray: string[] = project.tech_stack || [];
  if (techStack !== undefined) {
    if (Array.isArray(techStack)) {
      techStackArray = techStack;
    } else if (typeof techStack === 'string') {
      techStackArray = techStack.split(',').map(t => t.trim()).filter(Boolean);
    }
  }

  const updatedProject = await prisma.projects.update({
    where: { id },
    data: {
      ...(title && { title }),
      ...(description && { description }),
      ...(finalCategoryId && { category_id: finalCategoryId }),
      ...(difficulty && { difficulty_level: difficulty }),
      ...(techStack !== undefined && { tech_stack: techStackArray }),
      ...(membersNeeded !== undefined && { members_needed: membersNeeded }),
      ...(github !== undefined && { repository_url: github }),
      ...(image !== undefined && { featured_image_url: image }),
      ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
      ...(visibility && { visibility }),
      updated_at: new Date(),
    },
    include: {
      users: {
        select: {
          id: true,
          username: true,
          avatar_url: true,
        }
      },
      categories: {
        select: {
          id: true,
          name: true,
        }
      },
      project_members: {
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
      _count: {
        select: { project_members: true }
      }
    }
  });

  res.status(200).json({
    id: updatedProject.id,
    title: updatedProject.title,
    name: updatedProject.title,
    description: updatedProject.description,
    status: updatedProject.status,
    category: updatedProject.categories?.name || null,
    categoryId: updatedProject.category_id,
    techStack: updatedProject.tech_stack || [],
    difficulty: updatedProject.difficulty_level,
    level: updatedProject.difficulty_level,
    github: updatedProject.repository_url,
    repositoryUrl: updatedProject.repository_url,
    image: updatedProject.featured_image_url,
    location: updatedProject.location,
    membersNeeded: updatedProject.members_needed,
    teamCount: updatedProject._count.project_members,
    members: updatedProject.project_members?.map(m => ({
      id: m.user_id,
      username: m.users?.username,
      avatar_url: m.users?.avatar_url,
      role: m.role
    })) || [],
    owner: {
      id: updatedProject.users.id,
      username: updatedProject.users.username,
      avatar_url: updatedProject.users.avatar_url
    },
    deadline: updatedProject.deadline,
    visibility: updatedProject.visibility,
    created_at: updatedProject.created_at,
    updated_at: updatedProject.updated_at,
    type: 'project',
    membersJoined: updatedProject._count.project_members
  });
};

const deleteProject = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user as string;

  const project = await prisma.projects.findUnique({
    where: { id },
    include: { users: true }
  });

  if (!project) {
    res.status(404).send({ message: 'Project not found.' });
    return;
  }

  if (project.owner_id !== userId) {
    res.status(403).send({ message: 'Access denied.' });
    return;
  }

  await prisma.projects.delete({ where: { id } });

  res.status(204).end();
};




// --- Project Members ---
const addProjectMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.projectId as string;
    const currentUserId = req.user as string;
    const { userId, role } = req.body;
    
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    
    const project = await prisma.projects.findUnique({ 
      where: { id: projectId },
      include: { users: { select: { username: true } } }
    });
    
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    
    const user = await prisma.users.findUnique({ 
      where: { id: userId },
      select: { id: true, username: true, email: true }
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    // Check if user is already a member
    const existingMember = await prisma.project_members.findFirst({
      where: { project_id: projectId, user_id: userId }
    });
    
    if (existingMember) {
      res.status(400).json({ error: 'User is already a member of this project' });
      return;
    }
    
    const member = await prisma.project_members.create({
      data: {
        id: uuidv4(),
        project_id: projectId,
        user_id: userId,
        role: role || 'member',
      },
      include: { users: { select: { id: true, username: true, avatar_url: true } } }
    });
    
    // Send notification to the added user
    try {
      await prisma.notifications.create({
        data: {
          id: uuidv4(),
          user_id: userId,
          title: 'Added to Project',
          message: `${project.users.username} added you to the project "${project.title}"`,
          is_read: false,
          project_id: projectId,
        }
      });
    } catch (notificationError) {
      console.error('Failed to create notification:', notificationError);
      // Don't fail the member addition if notification fails
    }
    
    res.status(201).json(member);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add project member', details: error instanceof Error ? error.message : error });
  }
};

const removeProjectMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, userId } = req.params;
    const member = await prisma.project_members.findFirst({ where: { project_id: projectId, user_id: userId } });
    if (!member) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    await prisma.project_members.delete({ where: { id: member.id } });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove project member', details: error instanceof Error ? error.message : error });
  }
};

const getProjectMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const members = await prisma.project_members.findMany({
      where: { project_id: projectId },
      include: { users: { select: { id: true, username: true, avatar_url: true }, }, },
    });
    res.status(200).json({ members });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get project members', details: error instanceof Error ? error.message : error });
  }
};
const getProjectActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const activity = await prisma.project_events.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
      include: {
        users: { select: { id: true, username: true, avatar_url: true } }
      }
    });
    res.status(200).json({ activity });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get project activity', details: error instanceof Error ? error.message : error });
  }
};
const getProjectFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const files = await prisma.project_attachments.findMany({
      where: { project_id: projectId },
      include: {
        files: { select: { id: true, url: true, filename: true, mime_type: true, size: true, uploaded_at: true } }
      }
    });
    res.status(200).json({ files: files.map(f => f.files) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get project files', details: error instanceof Error ? error.message : error });
  }
};
const getProjectTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const tasks = await prisma.project_tasks.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
    res.status(200).json({ tasks });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get project tasks', details: error instanceof Error ? error.message : error });
  }
};

const createProjectTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { title, description, status, priority, assignedTo, dueDate } = req.body;
    
    if (!title) {
      res.status(400).json({ error: 'Task title is required' });
      return;
    }

    const project = await prisma.projects.findUnique({ where: { id: projectId } });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const task = await prisma.project_tasks.create({
      data: {
        id: uuidv4(),
        project_id: projectId as string,
        title,
        description: description || null,
        status: status || 'todo',
        priority: priority || 'medium',
        assigned_to: assignedTo || null,
        due_date: dueDate ? new Date(dueDate) : null,
      }
    });

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create task', details: error instanceof Error ? error.message : error });
  }
};

const updateProjectTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, taskId } = req.params;
    const { title, description, status, priority, assignedTo, dueDate } = req.body;

    const task = await prisma.project_tasks.findFirst({
      where: { id: taskId, project_id: projectId }
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const updatedTask = await prisma.project_tasks.update({
      where: { id: taskId },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
        ...(priority && { priority }),
        ...(assignedTo !== undefined && { assigned_to: assignedTo }),
        ...(dueDate !== undefined && { due_date: dueDate ? new Date(dueDate) : null }),
        updated_at: new Date(),
      }
    });

    res.status(200).json(updatedTask);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update task', details: error instanceof Error ? error.message : error });
  }
};

const deleteProjectTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, taskId } = req.params;

    const task = await prisma.project_tasks.findFirst({
      where: { id: taskId, project_id: projectId }
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    await prisma.project_tasks.delete({ where: { id: taskId } });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete task', details: error instanceof Error ? error.message : error });
  }
};

const uploadProjectFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user as string;
    const { projectId } = req.params;
    const { filename, url, mimeType, size } = req.body;

    if (!filename || !url) {
      res.status(400).json({ error: 'Filename and URL are required' });
      return;
    }

    const project = await prisma.projects.findUnique({ where: { id: projectId } });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Create file record
    const fileId = uuidv4();
    const file = await prisma.files.create({
      data: {
        id: fileId,
        filename,
        url,
        mime_type: mimeType || 'application/octet-stream',
        size: size || 0,
        uploaded_by: userId,
      }
    });

    // Link file to project
    await prisma.project_attachments.create({
      data: {
        id: uuidv4(),
        project_id: projectId as string,
        file_id: fileId,
      }
    });

    res.status(201).json(file);
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload file', details: error instanceof Error ? error.message : error });
  }
};

const deleteProjectFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, fileId } = req.params;

    const attachment = await prisma.project_attachments.findFirst({
      where: { project_id: projectId, file_id: fileId }
    });

    if (!attachment) {
      res.status(404).json({ error: 'File not found in project' });
      return;
    }

    // Delete attachment link
    await prisma.project_attachments.delete({ where: { id: attachment.id } });
    
    // Delete file record
    await prisma.files.delete({ where: { id: fileId } });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete file', details: error instanceof Error ? error.message : error });
  }
};

const getUserProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user as string;
    const { userId: targetUserId } = req.params;

    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    // If viewing own profile, show all projects (public + private)
    // If viewing someone else's profile, show only public projects
    const isOwnProfile = !targetUserId || targetUserId === userId;
    
    const where: any = {
      owner_id: targetUserId || userId
    };

    if (!isOwnProfile) {
      where.visibility = 'public';
    }

    const projects = await prisma.projects.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        users: {
          select: { id: true, username: true, avatar_url: true }
        },
        categories: {
          select: { id: true, name: true }
        },
        _count: {
          select: { project_members: true }
        }
      }
    });

    const mappedProjects = projects.map(project => ({
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      visibility: project.visibility,
      category: project.categories?.name || null,
      techStack: project.tech_stack || [],
      difficulty: project.difficulty_level,
      github: project.repository_url,
      image: project.featured_image_url,
      membersCount: project._count.project_members,
      owner: project.users,
      created_at: project.created_at,
      updated_at: project.updated_at
    }));

    res.status(200).json({ success: true, projects: mappedProjects });
  } catch (error: any) {
    console.error('Get user projects error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user projects' });
  }
};

export {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  addProjectMember,
  removeProjectMember,
  getProjectMembers,
  getProjectActivity,
  getProjectFiles,
  getProjectTasks,
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
  uploadProjectFile,
  deleteProjectFile,
  getUserProjects,
};