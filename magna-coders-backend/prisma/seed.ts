import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clear existing data
  console.log('🗑️  Clearing existing data...');
  await prisma.post_tags.deleteMany();
  await prisma.tags.deleteMany();
  await prisma.comments.deleteMany();
  await prisma.likes.deleteMany();
  await prisma.post_media.deleteMany();
  await prisma.posts.deleteMany();
  await prisma.project_members.deleteMany();
  await prisma.projects.deleteMany();
  await prisma.opportunities.deleteMany();
  await prisma.companies.deleteMany();
  await prisma.categories.deleteMany();

  // Create categories
  console.log('📁 Creating categories...');
  const categories = await Promise.all([
    prisma.categories.create({
      data: {
        id: uuidv4(),
        name: 'Technology',
        description: 'Tech-related posts and opportunities'
      }
    }),
    prisma.categories.create({
      data: {
        id: uuidv4(),
        name: 'Web Development',
        description: 'Frontend and Backend Development'
      }
    }),
    prisma.categories.create({
      data: {
        id: uuidv4(),
        name: 'Mobile Development',
        description: 'iOS and Android development'
      }
    }),
    prisma.categories.create({
      data: {
        id: uuidv4(),
        name: 'Data Science',
        description: 'Machine Learning and Data Analysis'
      }
    }),
    prisma.categories.create({
      data: {
        id: uuidv4(),
        name: 'DevOps',
        description: 'Infrastructure and Cloud Services'
      }
    })
  ]);

  console.log(`✅ Created ${categories.length} categories`);

  // Create tags
  console.log('🏷️  Creating tags...');
  const tags = await Promise.all([
    prisma.tags.create({
      data: { id: uuidv4(), name: 'javascript' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'react' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'nodejs' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'typescript' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'python' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'django' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'nextjs' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'mongodb' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'postgresql' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'docker' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'aws' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'react-native' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'machine-learning' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'firebase' }
    }),
    prisma.tags.create({
      data: { id: uuidv4(), name: 'graphql' }
    })
  ]);

  console.log(`✅ Created ${tags.length} tags`);

  // Create companies
  console.log('🏢 Creating companies...');
  const companies = await Promise.all([
    prisma.companies.create({
      data: { id: uuidv4(), name: 'TechCorp Solutions', slug: 'techcorp', logo_url: null, website_url: 'https://techcorp.example.com', description: 'Enterprise software solutions', verified: true }
    }),
    prisma.companies.create({
      data: { id: uuidv4(), name: 'StartupXYZ', slug: 'startupxyz', logo_url: null, website_url: 'https://startupxyz.example.com', description: 'Innovative startup', verified: false }
    }),
    prisma.companies.create({
      data: { id: uuidv4(), name: 'CloudSystems Inc', slug: 'cloudsystems', logo_url: null, website_url: 'https://cloudsystems.example.com', description: 'Cloud infrastructure', verified: true }
    })
  ]);

  console.log(`✅ Created ${companies.length} companies`);

  // Get first user for seeding (or create if none exists)
  let users = await prisma.users.findMany({ take: 5 });

  if (users.length === 0) {
    console.log('👥 Creating sample users...');
    // Hash the seed password before storing
    const plainPassword = '123456';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    users = await Promise.all([
      prisma.users.create({
        data: {
          id: uuidv4(),
          username: 'john_developer',
          email: 'john@example.com',
          password_hash: hashedPassword,
          bio: 'Full-stack developer passionate about React and Node.js',
          avatar_url: 'https://i.pravatar.cc/150?img=1',
          location: 'San Francisco, CA',
          github_url: 'https://github.com/john'
        }
      }),
      prisma.users.create({
        data: {
          id: uuidv4(),
          username: 'jane_designer',
          email: 'jane@example.com',
          password_hash: hashedPassword,
          bio: 'Product designer and UI/UX enthusiast',
          avatar_url: 'https://i.pravatar.cc/150?img=2',
          location: 'New York, NY'
        }
      }),
      prisma.users.create({
        data: {
          id: uuidv4(),
          username: 'alice_founder',
          email: 'alice@example.com',
          password_hash: hashedPassword,
          bio: 'Founder & CEO of TechStartup Inc',
          avatar_url: 'https://i.pravatar.cc/150?img=3',
          location: 'Boston, MA',
          linkedin_url: 'https://linkedin.com/in/alice'
        }
      }),
      prisma.users.create({
        data: {
          id: uuidv4(),
          username: 'bob_recruiter',
          email: 'bob@techcorp.com',
          password_hash: hashedPassword,
          bio: 'Tech Recruiter at TechCorp',
          avatar_url: 'https://i.pravatar.cc/150?img=4',
          location: 'Remote'
        }
      }),
      prisma.users.create({
        data: {
          id: uuidv4(),
          username: 'carol_engineer',
          email: 'carol@example.com',
          password_hash: hashedPassword,
          bio: 'Senior Software Engineer, Cloud Architecture Expert',
          avatar_url: 'https://i.pravatar.cc/150?img=5',
          location: 'Seattle, WA'
        }
      })
    ]);
    console.log(`✅ Created ${users.length} users`);
  } else {
    console.log(`ℹ️  Using existing ${users.length} users`);
  }

  // Normalize users array for TypeScript non-null assertions
  const u = users as any[];

  // Create regular posts
  console.log('📝 Creating regular posts...');
  const regularPosts = await Promise.all([
    prisma.posts.create({
      data: {
        id: uuidv4(),
        title: 'Getting Started with React Hooks: A Comprehensive Guide',
        content: `React Hooks have revolutionized the way we write React components. They allow you to use state and other React features without writing a class component. In this guide, we'll explore the most commonly used hooks like useState, useEffect, useContext, and custom hooks. 

Some key benefits of using hooks:
- Simpler code structure
- Better code reusability through custom hooks
- Easier state management
- Better performance optimization

Let's dive into some practical examples and best practices for using hooks effectively in your projects.`,
        post_type: 'regular',
        author_id: u[0].id,
        category_id: categories[1].id
      }
    }),
    prisma.posts.create({
      data: {
        id: uuidv4(),
        title: 'Building Scalable Node.js Applications',
        content: `Scalability is crucial for any backend application. Node.js provides excellent tools and patterns for building scalable systems. In this post, we'll discuss:

1. Clustering and Load Balancing
2. Database Optimization
3. Caching Strategies
4. Asynchronous Programming Best Practices
5. Monitoring and Performance Metrics

With these techniques, you can build Node.js applications that can handle millions of requests per second.`,
        post_type: 'regular',
        author_id: u[0].id,
        category_id: categories[1].id
      }
    }),
    prisma.posts.create({
      data: {
        id: uuidv4(),
        title: 'The Future of Web Development: Web3 and Decentralization',
        content: `Web3 is reshaping how we think about the internet. Decentralized applications (dApps) are changing user data ownership and digital interactions. Let's explore:

- Smart contracts and blockchain
- Decentralized finance (DeFi)
- NFTs and digital assets
- Self-sovereign identity

The shift towards Web3 presents both opportunities and challenges for developers.`,
        post_type: 'regular',
        author_id: u[4].id,
        category_id: categories[0].id
      }
    }),
    prisma.posts.create({
      data: {
        id: uuidv4(),
        title: 'Machine Learning in Production: Best Practices',
        content: `Deploying ML models to production is challenging. Here are the best practices:

1. Model Versioning and Tracking
2. A/B Testing and Canary Deployments
3. Monitoring Model Performance
4. Handling Data Drift
5. Cost Optimization

Learn how to build production-grade ML pipelines that scale.`,
        post_type: 'regular',
        author_id: u[2].id,
        category_id: categories[3].id
      }
    }),
    prisma.posts.create({
      data: {
        id: uuidv4(),
        title: 'Docker and Kubernetes: Modern DevOps Stack',
        content: `Container orchestration with Kubernetes is the industry standard. This comprehensive guide covers:

- Docker fundamentals
- Kubernetes clusters and deployments
- Service mesh with Istio
- GitOps workflows
- Security best practices

Transform your deployment process with container technologies.`,
        post_type: 'regular',
        author_id: u[4].id,
        category_id: categories[4].id
      }
    }),
    prisma.posts.create({
      data: {
        id: uuidv4(),
        title: 'TypeScript Tips and Tricks for Better Code',
        content: `TypeScript helps us write safer, more maintainable code. Discover advanced features:

- Generics and type inference
- Utility types and conditional types
- Decorators and metadata
- Advanced patterns

Become a TypeScript expert and improve your development workflow.`,
        post_type: 'regular',
        author_id: u[0].id,
        category_id: categories[0].id
      }
    }),
    prisma.posts.create({
      data: {
        id: uuidv4(),
        title: 'Database Optimization: Indexes, Queries, and Performance',
        content: `Database performance is critical for application speed. Learn optimization techniques:

- Query optimization
- Index design
- Connection pooling
- Caching strategies
- Monitoring tools

Reduce query times and improve application responsiveness.`,
        post_type: 'regular',
        author_id: u[4].id,
        category_id: categories[1].id
      }
    }),
    prisma.posts.create({
      data: {
        id: uuidv4(),
        title: 'API Design: RESTful Services and GraphQL',
        content: `Designing robust APIs is an art and science. Compare REST and GraphQL:

- RESTful principles and best practices
- GraphQL schema design
- Pagination and filtering
- Error handling
- Security considerations

Build APIs that your users will love.`,
        post_type: 'regular',
        author_id: u[0].id,
        category_id: categories[1].id
      }
    })
  ]);

  console.log(`✅ Created ${regularPosts.length} regular posts`);

  // Create tech news posts
  console.log('📰 Creating tech news posts...');
  const newsPosts = await Promise.all([
    prisma.posts.create({
      data: {
        id: uuidv4(),
        title: 'React 19 Released with New Compiler and Transitions API',
        content: 'Exciting updates in React 19 including automatic batching, new hooks, and improved performance.',
        post_type: 'tech-news',
        author_id: u[1].id,
        category_id: categories[1].id
      }
    }),
    prisma.posts.create({
      data: {
        id: uuidv4(),
        title: 'Deno 2.0: New Runtime Alternative to Node.js',
        content: 'Deno launches version 2.0 with significant improvements in performance and compatibility.',
        post_type: 'tech-news',
        author_id: u[4].id,
        category_id: categories[1].id
      }
    }),
    prisma.posts.create({
      data: {
        id: uuidv4(),
        title: 'Artificial Intelligence Regulation: New Global Standards',
        content: 'International bodies establish new standards for AI safety and ethical deployment.',
        post_type: 'tech-news',
        author_id: u[2].id,
        category_id: categories[3].id
      }
    })
  ]);

  console.log(`✅ Created ${newsPosts.length} tech news posts`);

  // Create job posts
  console.log('💼 Creating job posts...');
  const jobPosts = await Promise.all([
    prisma.opportunities.create({
      data: {
        id: uuidv4(),
        title: 'Senior React Developer',
        description: `We're looking for an experienced React developer to join our team. You'll be working on cutting-edge web applications with a talented team of engineers.

Requirements:
- 5+ years of React experience
- Strong TypeScript skills
- Experience with state management (Redux, Zustand)
- Familiarity with testing frameworks (Jest, React Testing Library)

Benefits:
- Competitive salary
- Remote work options
- Professional development budget
- Health insurance`,
        company: 'TechCorp Solutions',
        company_id: companies[0].id,
        location: 'San Francisco, CA (Remote)',
        salary: '$120,000 - $160,000',
        job_type: 'full-time',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        author_id: u[3].id,
        category_id: categories[1].id
      }
    }),
    prisma.opportunities.create({
      data: {
        id: uuidv4(),
        title: 'Full-Stack Developer (Next.js + Django)',
        description: `Join our startup as a Full-Stack Developer. We're building innovative solutions with modern technologies.

Your Role:
- Develop responsive web applications with Next.js
- Build robust APIs with Django
- Optimize database performance
- Collaborate with designers and product team

Nice to Have:
- GraphQL experience
- Docker/Kubernetes knowledge
- AI/ML basics`,
        company: 'StartupXYZ',
        company_id: companies[1].id,
        location: 'New York, NY (Hybrid)',
        salary: '$100,000 - $140,000',
        job_type: 'full-time',
        deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        author_id: u[3].id,
        category_id: categories[1].id
      }
    }),
    prisma.opportunities.create({
      data: {
        id: uuidv4(),
        title: 'DevOps Engineer - Cloud Infrastructure',
        description: `We're hiring a DevOps engineer to manage our cloud infrastructure and CI/CD pipelines.

Responsibilities:
- Manage AWS infrastructure
- Design and implement CI/CD pipelines
- Monitor system performance and reliability
- Implement security best practices

Requirements:
- 3+ years DevOps experience
- AWS certification preferred
- Kubernetes experience
- Infrastructure as Code (Terraform, CloudFormation)`,
        company: 'CloudSystems Inc',
        company_id: companies[2].id,
        location: 'Seattle, WA (Remote)',
        salary: '$130,000 - $170,000',
        job_type: 'full-time',
        deadline: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        author_id: u[3].id,
        category_id: categories[4].id
      }
    }),
    prisma.opportunities.create({
      data: {
        id: uuidv4(),
        title: 'Mobile Developer (React Native)',
        description: `Build cross-platform mobile applications with React Native. Work on an app used by millions.

Position Details:
- Develop iOS and Android apps
- Optimize performance for mobile devices
- Implement offline functionality
- Work with native modules`,
        company: 'MobileApp Inc',
        company_id: companies[0].id,
        location: 'Remote',
        salary: '$110,000 - $150,000',
        job_type: 'full-time',
        deadline: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
        author_id: u[3].id,
        category_id: categories[2].id
      }
    }),
    prisma.opportunities.create({
      data: {
        id: uuidv4(),
        title: 'Machine Learning Engineer',
        description: `Help us build the next generation of AI-powered features. We're looking for ML experts.

What You'll Do:
- Design and train machine learning models
- Implement deep learning pipelines
- Optimize model performance
- Deploy models to production

Requirements:
- Strong Python skills
- Deep learning frameworks (PyTorch, TensorFlow)
- Statistics and mathematics background`,
        company: 'AI Innovations Ltd',
        company_id: companies[0].id,
        location: 'Boston, MA (Remote)',
        salary: '$140,000 - $180,000',
        job_type: 'full-time',
        deadline: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
        author_id: u[3].id,
        category_id: categories[3].id
      }
    }),
    prisma.opportunities.create({
      data: {
        id: uuidv4(),
        title: 'Junior Developer (6-month Internship)',
        description: `Kick-start your tech career with our internship program. Learn from experienced developers.

What We Offer:
- Hands-on experience with modern tech stack
- Mentorship from senior engineers
- Competitive internship stipend
- Possible full-time offer after internship`,
        company: 'TechCorp Solutions',
        company_id: companies[0].id,
        location: 'San Francisco, CA (On-site)',
        salary: '$25/hour',
        job_type: 'internship',
        deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        author_id: u[3].id,
        category_id: categories[1].id
      }
    })
  ]);

  console.log(`✅ Created ${jobPosts.length} job posts`);

  // Create sample files (resumes / attachments)
  console.log('📎 Creating sample files...');
  const files = await Promise.all([
    prisma.files.create({
      data: { id: uuidv4(), url: 'https://files.example.com/resume_john.pdf', filename: 'resume_john.pdf', mime_type: 'application/pdf', size: 123456, uploaded_by: u[0].id }
    }),
    prisma.files.create({
      data: { id: uuidv4(), url: 'https://files.example.com/portfolio_jane.pdf', filename: 'portfolio_jane.pdf', mime_type: 'application/pdf', size: 234567, uploaded_by: u[1].id }
    })
  ]);

  console.log(`✅ Created ${files.length} files`);

  // Create sample applications
  console.log('📝 Creating sample applications...');
  const applications = await Promise.all([
    prisma.applications.create({
      data: { id: uuidv4(), opportunity_id: jobPosts[0].id, user_id: u[0].id, resume_url: files[0].url, cover_letter: 'I am excited to apply for this role.', status: 'submitted' }
    }),
    prisma.applications.create({
      data: { id: uuidv4(), opportunity_id: jobPosts[1].id, user_id: u[1].id, resume_url: files[1].url, cover_letter: 'Looking forward to contributing.', status: 'submitted' }
    })
  ]);

  console.log(`✅ Created ${applications.length} applications`);

  // Create sample bookmarks
  console.log('🔖 Creating sample bookmarks...');
  const bookmarks = [];
  bookmarks.push(prisma.bookmarks.create({ data: { id: uuidv4(), user_id: u[0].id, opportunity_id: jobPosts[2].id } }));
  bookmarks.push(prisma.bookmarks.create({ data: { id: uuidv4(), user_id: u[1].id, opportunity_id: jobPosts[0].id } }));
  await Promise.all(bookmarks);
  console.log('✅ Created bookmarks');

  // Create project posts
  console.log('🚀 Creating project posts...');
  const projectPosts = await Promise.all([
    prisma.projects.create({
      data: {
        id: uuidv4(),
        title: 'E-Commerce Platform Rebuild',
        description: `We're rebuilding our e-commerce platform with modern technologies. Looking for developers to help scale to millions of users.

Tech Stack: Next.js, TypeScript, PostgreSQL, Redis, Docker, Kubernetes

Project Goals:
- Migrate from legacy system
- Improve performance by 50%
- Implement real-time notifications
- Build mobile app version

Timeline: 6 months
Team Size: 8-10 developers`,
        owner_id: u[2].id,
        category_id: categories[1].id,
        max_contributors: 5,
        deadline_for_joining: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
      }
    }),
    prisma.projects.create({
      data: {
        id: uuidv4(),
        title: 'Mobile App for Fitness Tracking',
        description: `Creating a comprehensive fitness tracking application with AI coaching features.

Features:
- Real-time workout tracking
- AI-powered personalized coaching
- Social features (friend challenges, leaderboards)
- Integration with wearables
- Analytics dashboard

Looking for:
- React Native developers
- Backend developers
- ML engineers for coaching algorithm
- UI/UX designers`,
        owner_id: u[1].id,
        category_id: categories[2].id,
        max_contributors: 4,
        deadline_for_joining: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)
      }
    }),
    prisma.projects.create({
      data: {
        id: uuidv4(),
        title: 'Open-Source Web Framework',
        description: `Building an innovative web framework that simplifies full-stack development.

Goals:
- Create intuitive API
- Excellent documentation
- Strong community
- Production-ready

We need:
- Core framework developers
- Documentation writers
- Community managers
- DevOps engineer`,
        owner_id: u[0].id,
        category_id: categories[1].id,
        max_contributors: 3,
        deadline_for_joining: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    }),
    prisma.projects.create({
      data: {
        id: uuidv4(),
        title: 'AI-Powered Analytics Dashboard',
        description: `Building an advanced analytics platform with AI insights for businesses.

Features:
- Real-time data processing
- Predictive analytics
- Natural language queries
- Custom visualizations
- White-label solution

Seeking:
- Full-stack developers
- Data engineers
- ML engineers
- DevOps specialists`,
        owner_id: u[2].id,
        category_id: categories[3].id,
        max_contributors: 6,
        deadline_for_joining: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000)
      }
    }),
    prisma.projects.create({
      data: {
        id: uuidv4(),
        title: 'Microservices Infrastructure Tool',
        description: `Developing open-source tooling for microservices deployment and management.

Key Components:
- Service discovery
- Load balancing
- Health checks
- Logging and monitoring
- Configuration management

Looking for:
- Go developers
- Backend engineers
- DevOps experts
- Documentation team`,
        owner_id: u[4].id,
        category_id: categories[4].id,
        max_contributors: 4,
        deadline_for_joining: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000)
      }
    })
  ]);

  console.log(`✅ Created ${projectPosts.length} project posts`);

  // Normalize projectPosts for safe indexing
  const pp = projectPosts as any[];

  // Assign tags to posts
  console.log('🏷️  Assigning tags to posts...');
  const allPosts = [...regularPosts, ...newsPosts];
  const tagAssignments = [
    [tags[0], tags[1], tags[3]], // JavaScript, React, TypeScript
    [tags[1], tags[2], tags[3]], // React, Node.js, TypeScript
    [tags[4], tags[5], tags[8]], // Python, Django, PostgreSQL
    [tags[4], tags[12], tags[5]], // Python, ML, Django
    [tags[9], tags[10], tags[3]], // Docker, AWS, TypeScript
    [tags[3], tags[0], tags[14]], // TypeScript, JavaScript, GraphQL
    [tags[8], tags[0], tags[2]], // PostgreSQL, JavaScript, Node.js
    [tags[14], tags[0], tags[2]], // GraphQL, JavaScript, Node.js
    [tags[1], tags[3]], // React, TypeScript
    [tags[2]], // Node.js
    [tags[12], tags[4]], // ML, Python
  ];

  let tagIndex = 0;
  for (const post of allPosts) {
    const assignedTags = tagAssignments[tagIndex % tagAssignments.length] as any[];
    for (const tag of assignedTags) {
      await prisma.post_tags.create({
        data: {
          id: uuidv4(),
          post_id: post.id,
          tag_id: tag.id
        }
      });
    }
    tagIndex++;
  }

  console.log(`✅ Assigned tags to posts`);

  // Create comments and replies
  console.log('💬 Creating comments and replies...');
  const comments = await Promise.all([
    // Comments on first post
    prisma.comments.create({
      data: {
        id: uuidv4(),
        content: 'Great article! I especially liked the explanation of useEffect cleanup. Very helpful for beginners.',
        author_id: u[1].id,
        post_id: regularPosts[0].id
      }
    }),
    prisma.comments.create({
      data: {
        id: uuidv4(),
        content: 'Thanks for sharing! Do you have any examples of custom hooks for managing form state?',
        author_id: u[3].id,
        post_id: regularPosts[0].id
      }
    }),
    prisma.comments.create({
      data: {
        id: uuidv4(),
        content: 'The performance tips section was exactly what I needed for my current project.',
        author_id: u[4].id,
        post_id: regularPosts[0].id
      }
    }),
    // Comments on second post
    prisma.comments.create({
      data: {
        id: uuidv4(),
        content: 'This is a comprehensive guide! I especially appreciated the monitoring section.',
        author_id: u[2].id,
        post_id: regularPosts[1].id
      }
    }),
    prisma.comments.create({
      data: {
        id: uuidv4(),
        content: 'Have you considered covering load testing tools? Would be a great addition.',
        author_id: u[0].id,
        post_id: regularPosts[1].id
      }
    }),
    // Comments on third post
    prisma.comments.create({
      data: {
        id: uuidv4(),
        content: 'Interesting perspective on Web3. I think the adoption curve will be key.',
        author_id: u[3].id,
        post_id: regularPosts[2].id
      }
    })
  ]);

  console.log(`✅ Created ${comments.length} comments`);

  const c = comments as any[];

  // Create replies to comments
  console.log('↪️  Creating comment replies...');
  await Promise.all([
    prisma.comments.create({
      data: {
        id: uuidv4(),
        content: 'Thanks! Yes, here\'s an example for form state management...',
        author_id: u[0].id,
        post_id: regularPosts[0].id,
        parent_id: comments[1].id
      }
    }),
    prisma.comments.create({
      data: {
        id: uuidv4(),
        content: 'Great point! Load testing is definitely important. I should write a follow-up post on that.',
        author_id: u[0].id,
        post_id: regularPosts[1].id,
        parent_id: comments[4].id
      }
    }),
    prisma.comments.create({
      data: {
        id: uuidv4(),
        content: 'You\'re absolutely right. The real test will be when mainstream adoption begins.',
        author_id: u[4].id,
        post_id: regularPosts[2].id,
        parent_id: comments[5].id
      }
    })
  ]);

  console.log(`✅ Created comment replies`);

  // Create likes
  console.log('❤️  Adding likes to posts...');
  const likes = [];
  for (const post of [...regularPosts, ...newsPosts].slice(0, 5)) {
    for (let i = 0; i < 3; i++) {
      likes.push(
        prisma.likes.create({
          data: {
            id: uuidv4(),
            post_id: post.id,
            user_id: u[i].id
          }
        })
      );
    }
  }

  await Promise.all(likes);
  console.log(`✅ Added likes to posts`);

  // Create comment likes (reactions)
  console.log('👍 Adding likes to comments...');
  const commentLikes = [];
  for (let i = 0; i < comments.length; i++) {
    // let different users like first few comments
    for (let j = 0; j < Math.min(3, u.length); j++) {
      commentLikes.push(
        prisma.likes.create({
          data: {
            id: uuidv4(),
            comment_id: c[i].id,
            user_id: u[j].id
          }
        })
      );
    }
  }

  await Promise.all(commentLikes);
  console.log(`✅ Added comment likes`);

  // Create project members
  console.log('👥 Adding project members...');
  const projectMembers = [];
  for (let i = 0; i < projectPosts.length; i++) {
    for (let j = 1; j < Math.min(3, users.length); j++) {
      projectMembers.push(
        prisma.project_members.create({
          data: {
            id: uuidv4(),
            project_id: pp[i].id,
            user_id: u[j].id,
            role: j === 1 ? 'lead' : 'member'
          }
        })
      );
    }
  }

  await Promise.all(projectMembers);
  console.log(`✅ Added project members`);

  // Create friendships
  console.log('👫 Creating friendships...');
  const friendships = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < Math.min(i + 3, users.length); j++) {
      friendships.push(
        prisma.friends.create({
          data: {
            id: uuidv4(),
            user_id: u[i].id,
            friend_id: u[j].id,
            status: 'accepted'
          }
        }),
        // Create reverse friendship
        prisma.friends.create({
          data: {
            id: uuidv4(),
            user_id: u[j].id,
            friend_id: u[i].id,
            status: 'accepted'
          }
        })
      );
    }
  }

  await Promise.all(friendships);
  console.log(`✅ Created ${friendships.length} friendships`);

  // Create conversations (direct messages)
  console.log('💬 Creating conversations and messages...');
  const conversations = [];
  let messageCount = 0;

  // Create a conversation between first two users
  const conversation1 = await prisma.conversations.create({
    data: {
      id: uuidv4(),
      is_group: false
    }
  });

  // Add members to conversation
  await Promise.all([
    prisma.conversation_members.create({
      data: {
        id: uuidv4(),
        conversation_id: conversation1.id,
        user_id: u[0].id
      }
    }),
    prisma.conversation_members.create({
      data: {
        id: uuidv4(),
        conversation_id: conversation1.id,
        user_id: u[1].id
      }
    })
  ]);

  // Add messages to conversation
  const messages1 = await Promise.all([
    prisma.messages.create({
      data: {
        id: uuidv4(),
        content: 'Hey! How are you doing?',
        message_type: 'TEXT',
        sender_id: u[0].id,
        conversation_id: conversation1.id
      }
    }),
    prisma.messages.create({
      data: {
        id: uuidv4(),
        content: 'Doing great! Just finished a project.',
        message_type: 'TEXT',
        sender_id: u[1].id,
        conversation_id: conversation1.id
      }
    }),
    prisma.messages.create({
      data: {
        id: uuidv4(),
        content: 'That sounds awesome! Want to collaborate on something?',
        message_type: 'TEXT',
        sender_id: u[0].id,
        conversation_id: conversation1.id
      }
    })
  ]);
  conversations.push(conversation1);
  messageCount += messages1.length;

  // Create another conversation between different users
  const conversation2 = await prisma.conversations.create({
    data: {
      id: uuidv4(),
      is_group: false
    }
  });

  await Promise.all([
    prisma.conversation_members.create({
      data: {
        id: uuidv4(),
        conversation_id: conversation2.id,
        user_id: u[2].id
      }
    }),
    prisma.conversation_members.create({
      data: {
        id: uuidv4(),
        conversation_id: conversation2.id,
        user_id: u[3].id
      }
    })
  ]);

  const messages2 = await Promise.all([
    prisma.messages.create({
      data: {
        id: uuidv4(),
        content: 'Hello! Interested in this frontend position?',
        message_type: 'TEXT',
        sender_id: u[3].id,
        conversation_id: conversation2.id
      }
    }),
    prisma.messages.create({
      data: {
        id: uuidv4(),
        content: 'Yes, I am! What are the requirements?',
        message_type: 'TEXT',
        sender_id: u[2].id,
        conversation_id: conversation2.id
      }
    })
  ]);
  conversations.push(conversation2);
  messageCount += messages2.length;

  console.log(`✅ Created ${conversations.length} conversations with ${messageCount} messages`);

  console.log('✨ Database seeding completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`  - Categories: ${categories.length}`);
  console.log(`  - Tags: ${tags.length}`);
  console.log(`  - Users: ${users.length}`);
  console.log(`  - Regular Posts: ${regularPosts.length}`);
  console.log(`  - News Posts: ${newsPosts.length}`);
  console.log(`  - Job Opportunities: ${jobPosts.length}`);
  console.log(`  - Projects: ${projectPosts.length}`);
  console.log(`  - Comments: ${comments.length}`);
  console.log(`  - Likes: ${likes.length}`);
  console.log(`  - Project Members: ${projectMembers.length}`);
  console.log(`  - Friendships: ${friendships.length}`);
  console.log(`  - Conversations: ${conversations.length}`);
  console.log(`  - Messages: ${messageCount}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('\n✅ All done!');
  })
  .catch(async (e) => {
    console.error('❌ Seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
