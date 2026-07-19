import { Message } from './types';
import { isDevMode, getDevStore, getStudents, loadLocalMessages, saveLocalMessages, recordTombstones } from './storage';
import { hybridSync } from './hybridSync';
import { workerApi } from './workerApi';
import { sanitizeHtml } from './sanitize';

// Get storage location
const getStorage = () => {
  if (isDevMode()) {
    const devStore = getDevStore();
    if (!devStore.messages) {
      devStore.messages = [];
    }
    return devStore;
  }
  const win = window as any;
  if (!win.__musicSystemStorage) {
    win.__musicSystemStorage = {};
  }
  if (!win.__musicSystemStorage.messages) {
    win.__musicSystemStorage.messages = [];
  }
  return win.__musicSystemStorage;
};

export const getMessages = (): Message[] => {
  const storage = getStorage();
  const messages: Message[] = storage.messages || [];
  const now = Date.now();
  const expiredIds = messages
    .filter(message => message.expiresAt && new Date(message.expiresAt).getTime() <= now)
    .map(message => message.id);

  if (expiredIds.length > 0) {
    storage.messages = messages.filter(message => !expiredIds.includes(message.id));
    recordTombstones('messages', expiredIds);
    if (!isDevMode()) {
      queueMicrotask(() => { void hybridSync.onDestructiveChange(); });
    }
  }

  return storage.messages || [];
};

export const saveMessages = (messages: Message[]): void => {
  const storage = getStorage();
  storage.messages = messages;
  
  if (!isDevMode()) {
    hybridSync.onDataChange();
  }
};

export const getMessageType = (message: Message): 'broadcast' | 'group' | 'direct-teacher' | 'direct-student' => {
  if (message.recipientIds.includes('all')) return 'broadcast';
  if (message.recipientIds.length > 1) return 'group';
  if (message.recipientIds[0] === 'admin') return 'direct-teacher';
  return 'direct-student';
};

export const canUserRemoveStar = (message: Message, userId: string): boolean => {
  // Admin can remove star from any message
  if (userId === 'admin') return true;
  
  // Sender can remove star from their own messages
  if (message.senderId === userId) return true;
  
  // Broadcast from admin - student cannot remove
  if (message.senderId === 'admin' && message.recipientIds.includes('all')) return false;
  
  // All other cases - allowed
  return true;
};

export const addMessage = (message: Omit<Message, 'id' | 'createdAt'>): Message => {
  const messages = getMessages();
  const now = new Date();
  
  // Auto-star logic:
  let autoStarred: Record<string, boolean> = {};
  let starExpiresAt: Record<string, string> = {};
  
  // 1. If sent to "all", star for all students
  if (message.recipientIds.includes('all')) {
    const allStudents = getStudents();
    autoStarred = allStudents.reduce((acc: Record<string, boolean>, s: any) => 
      ({ ...acc, [s.id]: true }), {});
    
    // If from admin, set star expiration to 48 hours
    if (message.senderId === 'admin') {
      const expiryTime = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
      starExpiresAt = allStudents.reduce((acc: Record<string, string>, s: any) => 
        ({ ...acc, [s.id]: expiryTime }), {});
    }
  }
  // 2. If from admin, star for all recipients
  else if (message.senderId === 'admin') {
    autoStarred = message.recipientIds
      .filter(id => id !== 'admin')
      .reduce((acc, id) => ({ ...acc, [id]: true }), {});
  }
  
  const messageType = getMessageType({ ...message, id: '', createdAt: '' } as Message);
  
  const newMessage: Message = {
    ...message,
    id: Date.now().toString(),
    createdAt: now.toISOString(),
    starred: autoStarred,
    starExpiresAt: Object.keys(starExpiresAt).length > 0 ? starExpiresAt : undefined,
    messageType,
    expiresAt: message.senderId !== 'admin' && message.recipientIds.includes('all')
      ? new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()
      : message.expiresAt,
  };
  messages.push(newMessage);
  saveMessages(messages);
  return newMessage;
};

export const deleteMessage = (messageId: string): void => {
  const messages = getMessages();
  const updatedMessages = messages.filter(m => m.id !== messageId);
  recordTombstones('messages', [messageId]);
  saveMessages(updatedMessages);
};

export const markMessageAsRead = (messageId: string, userId: string, isRead: boolean = true): void => {
  const messages = getMessages();
  const message = messages.find(m => m.id === messageId);
  if (message) {
    if (!message.isRead) {
      message.isRead = {};
    }
    message.isRead[userId] = isRead;
    saveMessages(messages);
  }
};

export const markMessageAsUnread = (messageId: string, userId: string): void => {
  markMessageAsRead(messageId, userId, false);
};

export const saveDraft = (draft: Omit<Message, 'id' | 'createdAt'>): Message => {
  return addMessage({ ...draft, isDraft: true });
};

export const toggleMessageStar = (messageId: string, userId: string): boolean => {
  const messages = getMessages();
  const message = messages.find(m => m.id === messageId);
  if (!message) return false;
  
  if (!message.starred) {
    message.starred = {};
  }
  
  // Check if currently starred
  const isCurrentlyStarred = message.starred[userId];
  
  // If trying to remove star, check permissions
  if (isCurrentlyStarred && !canUserRemoveStar(message, userId)) {
    return false; // Cannot remove star
  }
  
  // Toggle star
  message.starred[userId] = !message.starred[userId];
  
  // If starring, set expiration if it's an admin broadcast
  if (message.starred[userId] && message.senderId === 'admin' && message.recipientIds.includes('all')) {
    if (!message.starExpiresAt) {
      message.starExpiresAt = {};
    }
    if (!message.starExpiresAt[userId]) {
      const now = new Date();
      message.starExpiresAt[userId] = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    }
  }
  
  saveMessages(messages);
  return true;
};

export const markMessageAsDeleted = (messageId: string, userId: string, isDeleted: boolean = true): void => {
  const messages = getMessages();
  const message = messages.find(m => m.id === messageId);
  if (message) {
    if (!message.isDeleted) {
      message.isDeleted = {};
    }
    message.isDeleted[userId] = isDeleted;
    saveMessages(messages);
  }
};

export const updateMessage = (messageId: string, updates: Partial<Message>): void => {
  const messages = getMessages();
  const index = messages.findIndex(m => m.id === messageId);
  if (index !== -1) {
    messages[index] = { ...messages[index], ...updates };
    saveMessages(messages);
  }
};

export const getMessagesForStudent = (studentId: string, includeDeleted: boolean = false): Message[] => {
  const messages = getMessages();
  const now = new Date();
  
  return messages.filter(message => {
    // Check if message is deleted by this user
    if (!includeDeleted && message.isDeleted?.[studentId]) {
      return false;
    }
    
    // Check if message has expired
    if (message.expiresAt && new Date(message.expiresAt) < now) {
      return false;
    }
    
    // Check if scheduled for future
    if (message.scheduledFor && new Date(message.scheduledFor) > now) {
      return false;
    }
    
    // Skip drafts not from this student
    if (message.isDraft && message.senderId !== studentId) {
      return false;
    }
    
    // Include messages sent to all students or specifically to this student
    // OR messages sent by this student
    return message.recipientIds.includes('all') || 
           message.recipientIds.includes(studentId) ||
           message.senderId === studentId;
  });
};

export const getMessagesForAdmin = (includeDeleted: boolean = false): Message[] => {
  const messages = getMessages();
  const now = new Date();
  
  return messages.filter(message => {
    // Check if message is deleted by admin
    if (!includeDeleted && message.isDeleted?.['admin']) {
      return false;
    }
    
    // Check if message has expired
    if (message.expiresAt && new Date(message.expiresAt) < now) {
      return false;
    }
    
    // Check if scheduled for future
    if (message.scheduledFor && new Date(message.scheduledFor) > now) {
      return false;
    }
    
    // Skip drafts not from admin
    if (message.isDraft && message.senderId !== 'admin') {
      return false;
    }
    
    // Include direct admin mail, messages sent by admin, and every swap request.
    // IVR swap recordings are addressed to the swap board ("all"), which the
    // manager owns even though they are not ordinary inbox messages.
    return message.recipientIds.includes('admin') ||
           message.senderId === 'admin' ||
           message.type === 'swap_request';
  });
};

export const getStarredMessages = (userId: string): Message[] => {
  const messages = userId === 'admin' 
    ? getMessagesForAdmin() 
    : getMessagesForStudent(userId);
  
  const now = new Date();
  
  return messages.filter(message => {
    if (!message.starred?.[userId]) return false;
    
    // Check if star has expired
    const expiresAt = message.starExpiresAt?.[userId];
    if (expiresAt && new Date(expiresAt) < now) {
      // Remove expired star
      message.starred[userId] = false;
      saveMessages(getMessages());
      return false;
    }
    
    return true;
  });
};

export const getDrafts = (userId: string): Message[] => {
  const messages = getMessages();
  return messages.filter(message => 
    message.isDraft && message.senderId === userId
  );
};

export const getDeletedMessages = (userId: string): Message[] => {
  const messages = userId === 'admin' 
    ? getMessagesForAdmin(true) 
    : getMessagesForStudent(userId, true);
  
  return messages.filter(message => message.isDeleted?.[userId]);
};

export const getUnreadCount = (userId: string): number => {
  const messages = userId === 'admin' 
    ? getMessagesForAdmin() 
    : getMessagesForStudent(userId);
  
  return messages.filter(message => !message.isRead?.[userId]).length;
};

// Helper function for unique by ID
const uniqueById = (msgs: Message[]): Message[] => 
  Array.from(new Map(msgs.map(m => [m.id, m])).values());

// Sort by date (newest first)
const sortByDate = (msgs: Message[]): Message[] => 
  msgs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

// Get mailbox organized by folders - Gmail style
export const getMailbox = (userId: string): {
  inbox: Message[];
  sent: Message[];
  starred: Message[];
  trash: Message[];
  drafts: Message[];
} => {
  const messages = userId === 'admin' 
    ? getMessagesForAdmin(true) 
    : getMessagesForStudent(userId, true);
  
  const allMessages = getMessages();
  const now = new Date();

  // Filter out expired stars
  messages.forEach(message => {
    if (message.starred?.[userId]) {
      const expiresAt = message.starExpiresAt?.[userId];
      if (expiresAt && new Date(expiresAt) < now) {
        message.starred[userId] = false;
      }
    }
  });

  const inbox = sortByDate(uniqueById(
    messages.filter(m => {
      const isRecipient = m.recipientIds.includes(userId) || 
        (userId !== 'admin' && m.recipientIds.includes('all'));
      return isRecipient && 
        !m.isDeleted?.[userId] && 
        m.senderId !== userId &&
        !m.isDraft;
    })
  ));

  const sent = sortByDate(uniqueById(
    messages.filter(m => 
      m.senderId === userId && 
      !m.isDeleted?.[userId] &&
      !m.isDraft
    )
  ));

  const starred = sortByDate(uniqueById(
    messages.filter(m => 
      m.starred?.[userId] && 
      !m.isDeleted?.[userId]
    )
  ));

  const trash = sortByDate(uniqueById(
    messages.filter(m => m.isDeleted?.[userId])
  ));

  const drafts = sortByDate(uniqueById(
    allMessages.filter(m => 
      m.isDraft && 
      m.senderId === userId && 
      !m.isDeleted?.[userId]
    )
  ));

  return { inbox, sent, starred, trash, drafts };
};

// Format recipients for display - Gmail style
export const formatRecipients = (recipientIds: string[], students: { id: string; firstName: string; lastName: string }[]): string => {
  if (recipientIds.includes('all')) return 'כל התלמידות';
  if (recipientIds.includes('admin')) return 'המנהל';
  
  const names = recipientIds
    .map(id => students.find(s => s.id === id))
    .filter(Boolean)
    .map(s => `${s!.firstName} ${s!.lastName}`);
  
  if (names.length === 0) return 'נמען לא ידוע';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]}, ${names[1]} + ${names.length - 2} נוספות`;
};

// Toggle reaction on a message
export const toggleReaction = (messageId: string, userId: string, emoji: string): void => {
  const messages = getMessages();
  const message = messages.find(m => m.id === messageId);
  if (!message) return;
  
  if (!message.reactions) {
    message.reactions = {};
  }
  
  // If same emoji, remove it; otherwise set new emoji
  if (message.reactions[userId] === emoji) {
    delete message.reactions[userId];
  } else {
    message.reactions[userId] = emoji;
  }
  
  saveMessages(messages);
};

// Hard delete message (permanent) - also deletes attachments
export const hardDeleteMessage = async (messageId: string): Promise<void> => {
  const messages = getMessages();
  const message = messages.find(m => m.id === messageId);
  
  // Delete attachments from Dropbox first
  if (message?.attachments?.length) {
    const { workerApi } = await import('./workerApi');
    for (const att of message.attachments) {
      if (att.path) {
        try {
          await workerApi.deleteAttachment(att.path);
        } catch (e) {
          console.error('Failed to delete attachment:', att.path, e);
        }
      }
    }
  }
  
  recordTombstones('messages', [messageId]);
  saveMessages(messages.filter(m => m.id !== messageId));
};

// Empty trash for user - also deletes attachments of permanently deleted messages
export const emptyTrash = async (userId: string): Promise<void> => {
  const messages = getMessages();
  const trashMessages = messages.filter(m => m.isDeleted?.[userId]);
  
  // Delete attachments from Dropbox for each trashed message
  if (trashMessages.length > 0) {
    const { workerApi } = await import('./workerApi');
    for (const msg of trashMessages) {
      if (msg.attachments?.length) {
        for (const att of msg.attachments) {
          if (att.path) {
            try {
              await workerApi.deleteAttachment(att.path);
            } catch (e) {
              console.error('Failed to delete attachment:', att.path, e);
            }
          }
        }
      }
    }
  }
  
  recordTombstones('messages', trashMessages.map(m => m.id));
  saveMessages(messages.filter(m => !m.isDeleted?.[userId]));
};

// Cascade delete messages for student (Policy C)
export const deleteMessagesForStudentCascade = async (studentId: string): Promise<void> => {
  const messages = getMessages();
  const remaining: Message[] = [];
  const { workerApi } = await import('./workerApi');
  const removedIds: string[] = [];

  for (const msg of messages) {
    const isSender = msg.senderId === studentId;
    const isRecipient = msg.recipientIds.includes(studentId);

    // 1. Student is sender → full delete
    if (isSender) {
      if (msg.attachments?.length) {
        for (const att of msg.attachments) {
          if (att.path) await workerApi.deleteAttachment(att.path).catch(() => {});
        }
      }
      removedIds.push(msg.id);
      continue;
    }

    // 2. Private message (single non-broadcast recipient)
    const nonSystemRecipients = msg.recipientIds.filter(r => r !== 'admin' && r !== 'all');
    const singlePrivate = nonSystemRecipients.length === 1 && nonSystemRecipients[0] === studentId;
    const isBroadcast = msg.recipientIds.includes('all');

    if (isRecipient && !isBroadcast && singlePrivate) {
      if (msg.attachments?.length) {
        for (const att of msg.attachments) {
          if (att.path) await workerApi.deleteAttachment(att.path).catch(() => {});
        }
      }
      removedIds.push(msg.id);
      continue;
    }

    // 3. Broadcast/group message → remove student from recipients
    if (isRecipient) {
      msg.recipientIds = msg.recipientIds.filter(id => id !== studentId);
      if (msg.isRead) delete msg.isRead[studentId];
      if (msg.isDeleted) delete msg.isDeleted[studentId];
      if (msg.starred) delete msg.starred[studentId];
      if (msg.starExpiresAt) delete msg.starExpiresAt[studentId];
      if (msg.reactions) delete msg.reactions[studentId];
    }

    remaining.push(msg);
  }

  if (removedIds.length) recordTombstones('messages', removedIds);
  saveMessages(remaining);
};

/* ===========================================================
   Gmail Sync Functions
   =========================================================== */

// Convert Worker message format to App Message format
const workerMessageToAppMessage = (workerMsg: any): Message => {
  const now = new Date().toISOString();
  
  // Extract sender info
  const senderId = workerMsg.sender?.id || (workerMsg.direction === 'out' ? 'admin' : 'unknown');
  const senderName = workerMsg.sender?.name || (senderId === 'admin' ? 'המנהל' : 'לא ידוע');
  
  // Extract recipient IDs
  const recipientIds: string[] = workerMsg.recipients?.map((r: any) => r.id || r.email) || [];
  
  // Build isRead object from state.readBy
  const isRead: Record<string, boolean> = {};
  if (workerMsg.state?.readBy) {
    for (const userId of workerMsg.state.readBy) {
      isRead[userId] = true;
    }
  }
  
  // Build starred object from state.starredBy
  const starred: Record<string, boolean> = {};
  if (workerMsg.state?.starredBy) {
    for (const userId of workerMsg.state.starredBy) {
      starred[userId] = true;
    }
  }
  
  // Build isDeleted object from state.deletedBy
  const isDeleted: Record<string, boolean> = {};
  if (workerMsg.state?.deletedBy) {
    for (const userId of workerMsg.state.deletedBy) {
      isDeleted[userId] = true;
    }
  }

  return {
    id: workerMsg.id || Date.now().toString(),
    senderId,
    senderName,
    recipientIds,
    subject: workerMsg.subject || '(ללא נושא)',
    content: workerMsg.body?.text || '',
    contentHtml: workerMsg.body?.html ? sanitizeHtml(workerMsg.body.html) : undefined,
    createdAt: workerMsg.timestamps?.createdAt || now,
    type: 'general',
    messageType: recipientIds.includes('all') ? 'broadcast' : recipientIds.length > 1 ? 'group' : 'direct-student',
    gmailMessageId: workerMsg.gmailMessageId,
    threadId: workerMsg.threadId,
    isRead: Object.keys(isRead).length > 0 ? isRead : undefined,
    starred: Object.keys(starred).length > 0 ? starred : undefined,
    isDeleted: Object.keys(isDeleted).length > 0 ? isDeleted : undefined,
  };
};

// Convert App Message to Worker format for sending
const appMessageToWorkerFormat = (
  message: Omit<Message, 'id' | 'createdAt'>,
  recipientEmails: string[]
): any => {
  return {
    direction: 'out',
    sender: {
      email: '', // Will be filled by worker
      type: message.senderId === 'admin' ? 'admin' : 'student',
      id: message.senderId,
      name: message.senderName,
    },
    recipients: recipientEmails.map(email => ({
      email,
      type: 'student',
    })),
    subject: message.subject,
    body: {
      text: message.content,
      html: message.contentHtml,
    },
    recipientIds: message.recipientIds,
  };
};

// Import recent messages from Gmail
export const syncMailboxFromGmail = async (params?: { max?: number; q?: string }): Promise<Message[]> => {
  const result = await workerApi.gmailImportRecent(params);
  
  if (result.success && result.data?.messages) {
    const existingMessages = getMessages();
    const existingGmailIds = new Set(existingMessages.filter(m => m.gmailMessageId).map(m => m.gmailMessageId));
    
    // Convert and merge new messages
    const newMessages: Message[] = [];
    for (const workerMsg of result.data.messages) {
      if (workerMsg.gmailMessageId && !existingGmailIds.has(workerMsg.gmailMessageId)) {
        const appMsg = workerMessageToAppMessage(workerMsg);
        newMessages.push(appMsg);
      }
    }
    
    if (newMessages.length > 0) {
      const allMessages = [...existingMessages, ...newMessages];
      saveMessages(allMessages);
      return allMessages;
    }
  }
  
  return getMessages();
};

// Send message via Gmail (for admin sending to students with email)
export const sendMessageViaGmail = async (
  message: Omit<Message, 'id' | 'createdAt'>,
  recipientEmails: string[]
): Promise<Message | null> => {
  if (recipientEmails.length === 0) {
    console.warn('sendMessageViaGmail: No recipient emails provided');
    return null;
  }

  try {
    const workerMessage = appMessageToWorkerFormat(message, recipientEmails);
    const result = await workerApi.gmailSendAndAdd(workerMessage);
    
    if (result.success && result.data?.message) {
      // Convert the returned message and save locally
      const appMessage = workerMessageToAppMessage(result.data.message);
      
      // Apply auto-star logic
      const allStudents = getStudents();
      let autoStarred: Record<string, boolean> = {};
      let starExpiresAt: Record<string, string> = {};
      const now = new Date();
      
      if (message.recipientIds.includes('all')) {
        autoStarred = allStudents.reduce((acc: Record<string, boolean>, s: any) => 
          ({ ...acc, [s.id]: true }), {});
        if (message.senderId === 'admin') {
          const expiryTime = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
          starExpiresAt = allStudents.reduce((acc: Record<string, string>, s: any) => 
            ({ ...acc, [s.id]: expiryTime }), {});
        }
      } else if (message.senderId === 'admin') {
        autoStarred = message.recipientIds
          .filter(id => id !== 'admin')
          .reduce((acc, id) => ({ ...acc, [id]: true }), {});
      }
      
      appMessage.starred = { ...appMessage.starred, ...autoStarred };
      if (Object.keys(starExpiresAt).length > 0) {
        appMessage.starExpiresAt = starExpiresAt;
      }
      
      const messages = getMessages();
      messages.push(appMessage);
      saveMessages(messages);
      
      return appMessage;
    }
    
    console.error('sendMessageViaGmail: Worker returned error', result.error);
    return null;
  } catch (err) {
    console.error('sendMessageViaGmail error:', err);
    return null;
  }
};

// Enhanced markMessageAsRead with Gmail sync
export const markMessageAsReadWithGmail = async (messageId: string, userId: string, isRead: boolean = true): Promise<void> => {
  const messages = getMessages();
  const message = messages.find(m => m.id === messageId);
  if (!message) return;
  
  if (!message.isRead) {
    message.isRead = {};
  }
  message.isRead[userId] = isRead;
  saveMessages(messages);

  // Sync to Gmail if message has gmailMessageId
  if (message.gmailMessageId) {
    try {
      await workerApi.gmailModifyLabels({
        gmailMessageId: message.gmailMessageId,
        add: isRead ? [] : ["UNREAD"],
        remove: isRead ? ["UNREAD"] : [],
      });
    } catch (err) {
      console.error('Failed to sync read status to Gmail:', err);
    }
  }
};

// Enhanced toggleMessageStar with Gmail sync
export const toggleMessageStarWithGmail = async (messageId: string, userId: string): Promise<boolean> => {
  const messages = getMessages();
  const message = messages.find(m => m.id === messageId);
  if (!message) return false;
  
  if (!message.starred) {
    message.starred = {};
  }
  
  const isCurrentlyStarred = message.starred[userId];
  
  if (isCurrentlyStarred && !canUserRemoveStar(message, userId)) {
    return false;
  }
  
  message.starred[userId] = !message.starred[userId];
  
  if (message.starred[userId] && message.senderId === 'admin' && message.recipientIds.includes('all')) {
    if (!message.starExpiresAt) {
      message.starExpiresAt = {};
    }
    if (!message.starExpiresAt[userId]) {
      const now = new Date();
      message.starExpiresAt[userId] = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    }
  }
  
  saveMessages(messages);

  // Sync to Gmail if message has gmailMessageId
  if (message.gmailMessageId) {
    try {
      await workerApi.gmailModifyLabels({
        gmailMessageId: message.gmailMessageId,
        add: message.starred[userId] ? ["STARRED"] : [],
        remove: message.starred[userId] ? [] : ["STARRED"],
      });
    } catch (err) {
      console.error('Failed to sync star to Gmail:', err);
    }
  }

  return true;
};

// Move to trash with Gmail sync
export const moveToTrashWithGmail = async (messageId: string, userId: string): Promise<void> => {
  const messages = getMessages();
  const message = messages.find(m => m.id === messageId);
  if (!message) return;

  if (!message.isDeleted) {
    message.isDeleted = {};
  }
  message.isDeleted[userId] = true;
  saveMessages(messages);

  // Sync to Gmail if message has gmailMessageId
  if (message.gmailMessageId) {
    try {
      await workerApi.gmailModifyLabels({
        gmailMessageId: message.gmailMessageId,
        add: ["TRASH"],
        remove: ["INBOX", "SENT", "STARRED"],
      });
    } catch (err) {
      console.error('Failed to sync trash to Gmail:', err);
    }
  }
};

// Restore from trash with Gmail sync
export const restoreFromTrashWithGmail = async (messageId: string, userId: string): Promise<void> => {
  const messages = getMessages();
  const message = messages.find(m => m.id === messageId);
  if (!message) return;

  if (message.isDeleted) {
    message.isDeleted[userId] = false;
  }
  saveMessages(messages);

  // Sync to Gmail if message has gmailMessageId
  if (message.gmailMessageId) {
    try {
      const restoreLabel = message.senderId === userId ? "SENT" : "INBOX";
      await workerApi.gmailModifyLabels({
        gmailMessageId: message.gmailMessageId,
        add: [restoreLabel],
        remove: ["TRASH"],
      });
    } catch (err) {
      console.error('Failed to sync restore to Gmail:', err);
    }
  }
};

// Email bridge helpers
export const getEmailPendingMessages = (): Message[] => {
  return getMessages().filter(m =>
    !m.emailSent && !m.isDraft && m.emailSource !== 'email'
  );
};

export const getApprovalPendingMessages = (): Message[] => {
  return getMessages().filter(m => m.pendingApproval === true && !m.approvedAt);
};

export const markEmailSent = (messageId: string): void => {
  const msgs = getMessages();
  const m = msgs.find(x => x.id === messageId);
  if (m) {
    m.emailSent = true;
    m.emailSentAt = new Date().toISOString();
    saveMessages(msgs);
  }
};

export const approveMessage = (messageId: string): void => {
  const msgs = getMessages();
  const m = msgs.find(x => x.id === messageId);
  if (m) {
    m.pendingApproval = false;
    m.approvedAt = new Date().toISOString();
    saveMessages(msgs);
  }
};
