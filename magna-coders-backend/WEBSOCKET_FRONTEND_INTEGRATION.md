# WebSocket Integration (Frontend)

This document outlines how the frontend application should connect to and interact with the Magna Coders backend via WebSocket (Socket.IO). The server exposes a real-time messaging system used mainly for chat functionality, but the same patterns apply to other real-time features.

---

## 🚀 Getting Started

1. **Install Socket.IO client**

   ```bash
   npm install socket.io-client
   # or
   yarn add socket.io-client
   ```

2. **Import and create the socket**

   ```ts
   import { io, Socket } from 'socket.io-client';

   // Replace with your API host/port or use environment variable.
   const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

   // instantiate socket
   const socket: Socket = io(SOCKET_URL, {
     transports: ['websocket', 'polling'],
     autoConnect: false
   });
   ```

3. **Authenticate after user login**

   The backend expects clients to emit an `auth` event with a JWT token obtained from the standard login API. Failing to authenticate will result in immediate disconnection.

   ```ts
   function connectSocket(token: string) {
     socket.connect();
     socket.emit('auth', token);
   }

   // Example: call after login/refresh
   connectSocket(user.jwtToken);
   ```


---

## 📦 Core Events & Payloads

All payloads correspond to the TypeScript interfaces defined on the server (see `src/websocket/types.ts`).

### Global events

| Event               | Direction        | Payload / Notes |
|---------------------|------------------|-----------------|
| `user_online`       | server → clients | `{ userId, username, isOnline }` updates when anyone connects.
| `user_offline`      | server → clients | `{ userId, username, isOnline, lastSeen }` when someone disconnects.
| `error`             | server → client  | `{ message: string }` generic error notification.


### Conversation-specific events

Clients must first join a conversation room before interacting.

| Event               | Direction        | Payload / Notes |
|---------------------|------------------|-----------------|
| `join_conversation` | client → server  | `conversationId: string` (no response event)
| `leave_conversation`| client → server  | `conversationId: string` (no response event)
| `new_message`       | server → clients | `ChatMessage` object for everyone in the room.
| `send_message`      | client → server  | `{ conversationId, content, messageType? }` saves + broadcasts.
| `message_delivered` | both             | `MessageReceipt` when a message is delivered/read.
| `message_read`      | client → server  | `{ messageId, conversationId }` to mark read (double tick).
| `typing`            | client → server  | `{ conversationId, isTyping: boolean }` toggles indicator.
| `user_typing`       | server → clients | `TypingIndicator` updates others in conversation on typing status.


**Notes:**

- The server emits the appropriate receipt events automatically when messages are created or updated. Frontend should update UI accordingly.
- Rooms are named `conversation:<id>` and `user:<id>` internally.
- To acknowledge delivery you do **not** have to emit anything; the server handles it.

---

## 💡 Example Usage (React/TypeScript)

```ts
import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
let socket: Socket;

export function useChat(conversationId: string, token: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingIndicator[]>([]);

  useEffect(() => {
    socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      socket.emit('auth', token);
      socket.emit('join_conversation', conversationId);
    });

    socket.on('new_message', (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('user_typing', (indicator: TypingIndicator) => {
      // update local list of typing users
      setTypingUsers(prev => {
        const others = prev.filter(i => i.userId !== indicator.userId);
        if (indicator.isTyping) others.push(indicator);
        return others;
      });
    });

    return () => {
      socket.emit('leave_conversation', conversationId);
      socket.disconnect();
    };
  }, [conversationId, token]);

  const sendMessage = useCallback(
    (content: string) => {
      socket.emit('send_message', { conversationId, content });
    },
    [conversationId]
  );

  const setTyping = useCallback(
    (isTyping: boolean) => {
      socket.emit('typing', { conversationId, isTyping });
    },
    [conversationId]
  );

  return { messages, typingUsers, sendMessage, setTyping };
}
```

---

## 🔒 Authentication & Error Handling

- Always call `socket.emit('auth', token)` before any other event. The server will reject unauthorized requests and disconnect.
- Listen for the `error` event to display messages returned from the backend (e.g., invalid token, not authenticated, failure to send).

## 📌 Environment Variables

- `REACT_APP_API_URL` (or similar) should point to the backend host/port (including http://). Example: `http://localhost:5000`.

---

## 🛠 Notes for Developers

- **Reconnection:** Socket.IO will retry automatically; you may need to re-authenticate on `reconnect` event.
- **Room names:** Use the `conversation:<id>` prefix when debugging on server.
- **Performance:** Avoid joining too many rooms; clean up on component unmount.

---

With these instructions and sample code, the frontend should be able to integrate with the backend WebSocket layer, enabling realtime chat and presence updates.
