import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';
import querystring from 'querystring';

const prisma = new PrismaClient();

interface UserEligibility {
  hasMinimumUsageTime: boolean;
  hasEnoughCredits: boolean;
  hasFeedbacks: boolean;
  hasMinimumRating: boolean;
}

interface ClientResult {
  name: string;
  company: string;
  position: string;
  source: string;
  profileUrl?: string;
}

interface LinkedInProfile {
  id: string;
  localizedFirstName: string;
  localizedLastName: string;
  profilePicture?: string;
  headline?: string;
}

interface LinkedInCompany {
  id: string;
  name: string;
  description?: string;
  website?: string;
  industry?: string;
}

interface LinkedInJob {
  id: string;
  title: string;
  company: LinkedInCompany;
  location: string;
  description?: string;
  applyUrl?: string;
}

interface LinkedInToken {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

// AI Agent for client discovery
export class ClientDiscoveryAgent {
  private readonly LINKEDIN_SEARCH_URL = '#';
  private readonly NEWS_CO_URL = '#';
  private readonly MIN_USAGE_DAYS = 30;
  private readonly MIN_CREDITS = 100;
  private readonly MIN_RATING = 4.0; 

  async checkUserEligibility(userId: string): Promise<UserEligibility> {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          created_at: true,
          updated_at: true,
          profile_complete_percentage: true,
          avatar_url: true,
          bio: true,
          location: true,
          website_url: true,
          github_url: true,
          linkedin_url: true,
          twitter_url: true,
          whatsapp_url: true,
          instagram_url: true
        }
      });

      if (!user) {
        return {
          hasMinimumUsageTime: false,
          hasEnoughCredits: false,
          hasFeedbacks: false,
          hasMinimumRating: false
        };
      }

      const accountAge = user.created_at ? Math.floor((Date.now() - user.created_at.getTime()) / (1000 * 60 * 60 * 24)) : 0;

      // hapa u will need a real database field ndo i check credits, feedbacks, ratings
      const hasMinimumUsageTime = accountAge >= this.MIN_USAGE_DAYS;
      const hasEnoughCredits = true;
      const hasFeedbacks = true;
      const hasMinimumRating = true;

      return {
        hasMinimumUsageTime,
        hasEnoughCredits,
        hasFeedbacks,
        hasMinimumRating
      };
    } catch (error) {
      console.error('Error checking user eligibility:', error);
      return {
        hasMinimumUsageTime: true,
        hasEnoughCredits: false,
        hasFeedbacks: false,
        hasMinimumRating: false
      };
    }
  }

  async findClients(query: string, userId: string): Promise<ClientResult[]> {
    const eligibility = await this.checkUserEligibility(userId);

    if (!eligibility.hasMinimumUsageTime || !eligibility.hasEnoughCredits ||
        !eligibility.hasFeedbacks || !eligibility.hasMinimumRating) {
      throw new Error('User does not meet eligibility requirements for client discovery');
    }

    const results: ClientResult[] = [];

    try {
      // Search LinkedIn
      const linkedinResults = await this.searchLinkedIn(query, userId);
      results.push(...linkedinResults);

      // Search news sources
      const newsResults = await this.searchNewsSources(query);
      results.push(...newsResults);

      // Additional sources can be added here
      // const additionalResults = await this.searchAdditionalSources(query);
      // results.push(...additionalResults);

    } catch (error) {
      console.error('Error in client discovery:', error);
      throw new Error('Failed to discover clients');
    }

    return results;
  }

  private async searchLinkedIn(query: string, userId: string): Promise<ClientResult[]> {
    try {
      // weka ur  official LinkedIn API kwanza
      const officialResults = await this.searchLinkedInOfficial(query, userId);
      if (officialResults.length > 0) {
        return officialResults;
      }

      // Fallback to scraping (with caution - may violate TOS)
      console.warn('Falling back to LinkedIn scraping - consider using official API');
      const searchUrl = `${this.LINKEDIN_SEARCH_URL}?keywords=${encodeURIComponent(query)}`;

      // For demo purposes, return mock data
      // In real implementation, implement proper scraping with rate limiting
      return [
        {
          name: 'John Doe',
          company: 'Tech Corp',
          position: 'CEO',
          source: 'LinkedIn',
          profileUrl: 'https://linkedin.com/in/johndoe'
        }
      ];
    } catch (error) {
      console.error('LinkedIn search error:', error);
      return [];
    }
  }

  private async searchNewsSources(query: string): Promise<ClientResult[]> {
    try {
      const response = await axios.get(`${this.NEWS_CO_URL}search/?q=${encodeURIComponent(query)}`, {
        headers: {
           // 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const results: ClientResult[] = [];

      // ndo hi example for it ya parsing
      $('.article-title, .news-item').each((index, element) => {
        const title = $(element).text().trim();
        if (title.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            name: 'Potential Client', // Would need better extraction
            company: 'Unknown',
            position: 'Unknown',
            source: 'News.co.ke',
            profileUrl: $(element).find('a').attr('href')
          });
        }
      });

      return results.slice(0, 5); // Limit results
    } catch (error) {
      console.error('News search error:', error);
      return [];
    }
  }

  // LinkedIn OAuth and API Integration Methods

  /**
   * Generate LinkedIn OAuth authorization URL
   */
  generateLinkedInAuthUrl(state: string): string {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      throw new Error('LinkedIn OAuth credentials not configured');
    }

    const params = {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'r_liteprofile r_emailaddress w_member_social', // Profile, email, and posting permissions
      state: state
    };

    return `https://www.linkedin.com/oauth/v2/authorization?${querystring.stringify(params)}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<LinkedInToken> {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('LinkedIn OAuth credentials not configured');
    }

    try {
      const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', querystring.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return response.data;
    } catch (error) {
      console.error('LinkedIn token exchange error:', error);
      throw new Error('Failed to obtain LinkedIn access token');
    }
  }

  /**
   * Get LinkedIn user profile data
   */
  async getLinkedInProfile(accessToken: string): Promise<LinkedInProfile> {
    try {
      const response = await axios.get('https://api.linkedin.com/v2/people/~', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      return response.data;
    } catch (error) {
      console.error('LinkedIn profile fetch error:', error);
      throw new Error('Failed to fetch LinkedIn profile');
    }
  }

  /**
   * Search for companies on LinkedIn
   */
  async searchLinkedInCompanies(query: string, accessToken: string): Promise<LinkedInCompany[]> {
    try {
      const response = await axios.get('https://api.linkedin.com/v2/companySearch', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        },
        params: {
          keywords: query,
          count: 10
        }
      });

      return response.data.elements || [];
    } catch (error) {
      console.error('LinkedIn company search error:', error);
      throw new Error('Failed to search LinkedIn companies');
    }
  }

  /**
   * Search for jobs on LinkedIn
   */
  async searchLinkedInJobs(keywords: string, location: string, accessToken: string): Promise<LinkedInJob[]> {
    try {
      const response = await axios.get('https://api.linkedin.com/v2/jobSearch', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        },
        params: {
          keywords: keywords,
          location: location,
          count: 10
        }
      });

      return response.data.elements || [];
    } catch (error) {
      console.error('LinkedIn job search error:', error);
      throw new Error('Failed to search LinkedIn jobs');
    }
  }

  /**
   * Get detailed company information
   */
  async getLinkedInCompanyDetails(companyId: string, accessToken: string): Promise<LinkedInCompany> {
    try {
      const response = await axios.get(`https://api.linkedin.com/v2/companies/${companyId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      return response.data;
    } catch (error) {
      console.error('LinkedIn company details error:', error);
      throw new Error('Failed to fetch company details');
    }
  }

  /**
   * Enhanced LinkedIn search using official APIs
   */
  private async searchLinkedInOfficial(query: string, userId: string): Promise<ClientResult[]> {
    try {
      // This would require storing and retrieving user's LinkedIn access token
      // For now, return mock data - in production, implement token storage/retrieval

      // Mock implementation - replace with actual token retrieval
      const mockAccessToken = await this.getUserLinkedInToken(userId);
      if (!mockAccessToken) {
        return []; // User hasn't connected LinkedIn
      }

      // Search for people (potential clients)
      const peopleResults = await this.searchLinkedInPeople(query, mockAccessToken);

      // Search for companies
      const companies = await this.searchLinkedInCompanies(query, mockAccessToken);

      const results: ClientResult[] = [];

      // Convert people results
      for (const person of peopleResults) {
        results.push({
          name: `${person.localizedFirstName} ${person.localizedLastName}`,
          company: person.headline?.split(' at ')[1] || 'Unknown',
          position: person.headline?.split(' at ')[0] || 'Professional',
          source: 'LinkedIn API',
          profileUrl: `https://www.linkedin.com/in/${person.id}`
        });
      }

      // Convert company results to potential client contacts
      for (const company of companies.slice(0, 3)) {
        results.push({
          name: 'Company Contact',
          company: company.name,
          position: 'Decision Maker',
          source: 'LinkedIn Company',
          profileUrl: `https://www.linkedin.com/company/${company.id}`
        });
      }

      return results;
    } catch (error) {
      console.error('LinkedIn official search error:', error);
      return [];
    }
  }

  /**
   * Search LinkedIn people (requires special permissions)
   */
  private async searchLinkedInPeople(query: string, accessToken: string): Promise<any[]> {
    // Note: People search API requires special access from LinkedIn
    // This is a placeholder - actual implementation depends on approved permissions
    try {
      const response = await axios.get('https://api.linkedin.com/v2/peopleSearch', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        },
        params: {
          keywords: query,
          count: 5
        }
      });

      return response.data.elements || [];
    } catch (error) {
      console.error('LinkedIn people search error:', error);
      return [];
    }
  }

  /**
   * Get user's stored LinkedIn access token
   * This would need to be implemented with proper token storage in database
   */
  private async getUserLinkedInToken(userId: string): Promise<string | null> {
    // Placeholder - implement token storage and retrieval
    // In production, store tokens securely in database with encryption
    try {
      // This would query a user_linkedin_tokens table or similar
      // For now, return null to indicate no token
      return null;
    } catch (error) {
      console.error('Error retrieving LinkedIn token:', error);
      return null;
    }
  }

  /**
   * Store user's LinkedIn access token
   */
  async storeUserLinkedInToken(userId: string, tokenData: LinkedInToken): Promise<void> {
    // Placeholder - implement secure token storage
    // In production, encrypt and store tokens in database
    console.log(`Storing LinkedIn token for user ${userId}`);
    // TODO: Implement database storage for tokens
  }
}