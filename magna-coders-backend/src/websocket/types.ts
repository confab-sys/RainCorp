// WebSocket event types for chat functionality

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  senderAvatar?: string;
  content: string;
  messageType: 'TEXT' | 'IMAGE' | 'FILE';
  isRead: boolean;
  isDelivered: boolean;
  createdAt: string;
}

export interface UserOnlineStatus {
  userId: string;
  username: string;
  isOnline: boolean;
  lastSeen?: string;
}

export interface TypingIndicator {
  conversationId: string;
  userId: string;
  username: string;
  isTyping: boolean;
}

export interface MessageReceipt {
  messageId: string;
  conversationId: string;
  userId: string;
  type: 'delivered' | 'read';
  timestamp: string;
}
