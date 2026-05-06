import { useState, useEffect, useRef, useCallback } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { Card, CardContent } from "@/components/safe-ui/card";
import { Button } from "@/components/safe-ui/button";
import { Badge } from "@/components/safe-ui/badge";
import { Input } from "@/components/safe-ui/input";
import { Label } from "@/components/safe-ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/safe-ui/select";
import { ScrollArea } from "@/components/safe-ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/safe-ui/resizable";
import { 
  getMailbox,
  formatRecipients,
  getMessagesForAdmin,
  markMessageAsReadWithGmail,
  addMessage,
  toggleMessageStarWithGmail,
  moveToTrashWithGmail,
  restoreFromTrashWithGmail,
  hardDeleteMessage,
  emptyTrash,
  toggleReaction,
  canUserRemoveStar,
  saveDraft,
  getMessages,
  syncMailboxFromGmail,
  sendMessageViaGmail
} from "@/lib/messages";
import { getStudents, updateSwapRequestStatus } from "@/lib/storage";
import { Message, Student, Attachment } from "@/lib/types";
import { toast } from "sonner";
import { 
  Send, 
  Mail, 
  Inbox,
  Star,
  Trash2,
  FileText,
  Plus,
  Reply,
  MailOpen,
  X,
  ArrowLeftRight,
  Save,
  Forward,
  RotateCcw,
  Paperclip,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageTypeBadge } from "../student/MessageTypeBadge";
import { workerApi } from "@/lib/workerApi";
import AttachmentPreview from "@/components/messages/AttachmentPreview";
import RichTextEditor, { RichTextEditorHandle } from "@/components/messages/RichTextEditor";
import ReactionBar from "@/components/messages/ReactionBar";
import { useIsMobile } from "@/hooks/use-mobile";

// Format message date: HH:MM for today, dd/MM for older
const formatMessageDate = (createdAt: string): string => {
  const msgDate = new Date(createdAt);
  const now = new Date();
  const isToday = msgDate.toDateString() === now.toDateString();
  
  return isToday
    ? msgDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : msgDate.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
};

type FolderType = 'inbox' | 'sent' | 'drafts' | 'starred' | 'trash' | 'swap_requests';

const LAYOUT_STORAGE_KEY = 'admin-messages-layout';
const SIDEBAR_COLLAPSED_KEY = 'admin-messages-sidebar-collapsed';

export default function MessagingTab() {
  const isMobile = useIsMobile();
  const [selectedFolder, setSelectedFolder] = useState<FolderType>('inbox');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [mobileView, setMobileView] = useState<'folders' | 'list' | 'message'>('list');
  
  const [composeSubject, setComposeSubject] = useState('');
  const [composeRecipients, setComposeRecipients] = useState<string[]>(['all']);
  const [expirationDate, setExpirationDate] = useState('');
  const editorRef = useRef<RichTextEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [mailbox, setMailbox] = useState<ReturnType<typeof getMailbox> | null>(null);
  const [swapRequests, setSwapRequests] = useState<Message[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncingGmail, setIsSyncingGmail] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === 'true';
  });

  // Load saved layout
  const [panelSizes, setPanelSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [15, 35, 50];
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const loadData = useCallback(() => {
    setStudents(getStudents());
    const box = getMailbox('admin');
    setMailbox(box);
    
    // Get swap requests separately
    const allMessages = getMessagesForAdmin(true);
    const swaps = allMessages.filter(m => 
      (m.type === 'swap_request' || m.metadata?.action === 'approve_or_reject') &&
      !m.isDeleted?.['admin']
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setSwapRequests(swaps);
  }, []);

  const handleLayoutChange = (sizes: number[]) => {
    setPanelSizes(sizes);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(sizes));
  };

  const handleSyncGmail = async () => {
    setIsSyncingGmail(true);
    try {
      await syncMailboxFromGmail({ max: 20 });
      loadData();
      toast.success('סנכרון מג\'ימייל הושלם');
    } catch (error) {
      console.error('Gmail sync error:', error);
      toast.error('שגיאה בסנכרון מג\'ימייל');
    } finally {
      setIsSyncingGmail(false);
    }
  };

  const handleApproveSwap = (swapRequestId: string) => {
    try {
      updateSwapRequestStatus(swapRequestId, 'approved');
      loadData();
      setSelectedMessage(null);
      toast.success('בקשת ההחלפה אושרה והשיעורים הוחלפו');
    } catch (error) {
      toast.error('לא ניתן לאשר את ההחלפה');
    }
  };

  const handleRejectSwap = (swapRequestId: string) => {
    try {
      updateSwapRequestStatus(swapRequestId, 'rejected');
      loadData();
      setSelectedMessage(null);
      toast.success('בקשת ההחלפה נדחתה');
    } catch (error) {
      toast.error('לא ניתן לדחות את ההחלפה');
    }
  };

  const handlePasteImage = async (file: File): Promise<string | null> => {
    setIsUploading(true);
    const result = await workerApi.uploadAttachment(file);
    setIsUploading(false);
    
    if (result.success && result.data) {
      return result.data.url;
    }
    toast.error('שגיאה בהעלאת התמונה');
    return null;
  };

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} גדול מדי (מקסימום 10MB)`);
        continue;
      }
      
      try {
        const result = await workerApi.uploadAttachment(file);
        
        if (result.success && result.data) {
          // Convert to Attachment type with required size field
          const attachment = {
            url: result.data.url,
            path: result.data.path,
            name: result.data.name,
            size: result.data.size ?? file.size,
            type: result.data.type
          };
          setAttachments(prev => [...prev, attachment]);
          toast.success(`${file.name} הועלה בהצלחה`);
        } else {
          toast.error(`שגיאה בהעלאת ${file.name}: ${result.error || 'שגיאה לא ידועה'}`);
        }
      } catch (error) {
        toast.error(`שגיאה בהעלאת ${file.name}`);
        console.error('Upload error:', error);
      }
    }
    setIsUploading(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      await handleFileUpload(files);
    }
  };

  const handleDeleteAttachment = async (index: number) => {
    const attachment = attachments[index];
    const result = await workerApi.deleteAttachment(attachment.path);
    
    if (result.success) {
      setAttachments(prev => prev.filter((_, i) => i !== index));
      toast.success('הקובץ נמחק');
    } else {
      toast.error('שגיאה במחיקת הקובץ');
    }
  };

  const handleCompose = () => {
    setIsComposing(true);
    setIsReplying(false);
    setComposeSubject('');
    editorRef.current?.clear();
    setComposeRecipients(['all']);
    setExpirationDate('');
    setSelectedMessage(null);
    setAttachments([]);
    if (isMobile) setMobileView('message');
  };

  const handleReply = (message: Message) => {
    setIsReplying(true);
    setIsComposing(true);
    setComposeSubject(`תגובה: ${message.subject}`);
    editorRef.current?.clear();
    setComposeRecipients([message.senderId]);
    setSelectedMessage(message);
    if (isMobile) setMobileView('message');
  };

  const handleForward = (message: Message) => {
    setIsReplying(false);
    setIsComposing(true);
    setComposeSubject(`FW: ${message.subject}`);
    const forwardContent = `<p><br></p><p>--- הודעה מועברת ---</p><p>מאת: ${message.senderName}</p><p>נושא: ${message.subject}</p><p><br></p>${message.contentHtml || message.content}`;
    setTimeout(() => editorRef.current?.setContent(forwardContent), 100);
    setComposeRecipients(['all']);
    setSelectedMessage(message);
    if (isMobile) setMobileView('message');
  };

  const handleSend = async () => {
    if (!composeSubject.trim()) {
      toast.error('נא למלא נושא');
      return;
    }

    const html = editorRef.current?.getHtml() || '';
    const plain = editorRef.current?.getText() || '';

    // Check if recipients have email addresses for Gmail sending
    const recipientEmails: string[] = [];
    if (!composeRecipients.includes('all')) {
      for (const rid of composeRecipients) {
        if (rid !== 'admin') {
          const student = students.find(s => s.id === rid);
          if (student?.email) {
            recipientEmails.push(student.email);
            // Also add additional emails if available
            if (student.additionalEmails?.length) {
              recipientEmails.push(...student.additionalEmails);
            }
          }
        }
      }
    } else {
      // For broadcast to all, gather all student emails
      for (const student of students) {
        if (student.email) {
          recipientEmails.push(student.email);
        }
        if (student.additionalEmails?.length) {
          recipientEmails.push(...student.additionalEmails);
        }
      }
    }

    const messageData = {
      senderId: 'admin',
      senderName: 'המנהל',
      recipientIds: composeRecipients,
      subject: composeSubject,
      content: plain,
      contentHtml: html,
      attachments: attachments.length > 0 ? attachments : undefined,
      expiresAt: expirationDate || undefined,
      inReplyTo: isReplying && selectedMessage ? selectedMessage.id : undefined,
      type: 'general' as const,
    };

    // Try to send via Gmail if we have recipient emails
    if (recipientEmails.length > 0) {
      const result = await sendMessageViaGmail(messageData, recipientEmails);
      if (result) {
        toast.success('ההודעה נשלחה בהצלחה דרך Gmail');
        resetCompose();
        loadData();
        return;
      }
      // If Gmail send failed, fall back to local
      console.warn('Gmail send failed, falling back to local message');
    }

    // Fallback: save locally only
    addMessage(messageData);
    toast.success('ההודעה נשלחה בהצלחה');
    resetCompose();
    loadData();
  };

  const handleSaveDraft = () => {
    if (!composeSubject.trim() && !editorRef.current?.getText()?.trim()) {
      toast.error('נא למלא נושא או תוכן');
      return;
    }

    const html = editorRef.current?.getHtml() || '';
    const plain = editorRef.current?.getText() || '';

    saveDraft({
      senderId: 'admin',
      senderName: 'המנהל',
      recipientIds: composeRecipients,
      subject: composeSubject,
      content: plain,
      contentHtml: html,
      attachments: attachments.length > 0 ? attachments : undefined,
      type: 'general',
    });

    toast.success('הטיוטה נשמרה');
    resetCompose();
    loadData();
  };

  const resetCompose = () => {
    setIsComposing(false);
    setIsReplying(false);
    setComposeSubject('');
    editorRef.current?.clear();
    setComposeRecipients(['all']);
    setExpirationDate('');
    setSelectedMessage(null);
    setAttachments([]);
  };

  const handleToggleStar = async (messageId: string) => {
    await toggleMessageStarWithGmail(messageId, 'admin');
    loadData();
  };

  const handleMoveToTrash = async (messageId: string) => {
    await moveToTrashWithGmail(messageId, 'admin');
    loadData();
    setSelectedMessage(null);
    toast.success('ההודעה הועברה לאשפה');
    if (isMobile) setMobileView('list');
  };

  const handleRestore = async (messageId: string) => {
    await restoreFromTrashWithGmail(messageId, 'admin');
    loadData();
    setSelectedMessage(null);
    toast.success('ההודעה שוחזרה');
  };

  const [isDeletingTrash, setIsDeletingTrash] = useState(false);

  const handleHardDelete = async (messageId: string) => {
    try {
      await hardDeleteMessage(messageId);
      loadData();
      setSelectedMessage(null);
      toast.success('ההודעה נמחקה לצמיתות');
      if (isMobile) setMobileView('list');
    } catch (error) {
      toast.error('שגיאה במחיקת ההודעה');
      console.error('Hard delete error:', error);
    }
  };

  const handleEmptyTrash = async () => {
    setIsDeletingTrash(true);
    try {
      await emptyTrash('admin');
      loadData();
      toast.success('האשפה רוקנה');
    } catch (error) {
      toast.error('שגיאה בריקון האשפה');
      console.error('Empty trash error:', error);
    } finally {
      setIsDeletingTrash(false);
    }
  };

  const handleToggleReaction = (messageId: string, emoji: string) => {
    toggleReaction(messageId, 'admin', emoji);
    loadData();
    // Update selected message
    if (selectedMessage?.id === messageId) {
      const box = getMailbox('admin');
      const allMessages = [...box.inbox, ...box.sent, ...box.starred, ...box.trash, ...box.drafts];
      const updated = allMessages.find(m => m.id === messageId);
      if (updated) setSelectedMessage(updated);
    }
  };

  const handleMarkAsRead = async (message: Message) => {
    if (!message.isRead?.['admin']) {
      await markMessageAsReadWithGmail(message.id, 'admin', true);
      loadData();
    }
    
    setSelectedMessage(message);
    if (isMobile) setMobileView('message');
  };

  const handleMarkAsUnread = async (messageId: string) => {
    await markMessageAsReadWithGmail(messageId, 'admin', false);
    loadData();
    toast.success('ההודעה סומנה כלא נקראה');
  };

  const getFilteredMessages = (): Message[] => {
    if (!mailbox) return [];
    
    switch (selectedFolder) {
      case 'inbox': return mailbox.inbox;
      case 'sent': return mailbox.sent;
      case 'drafts': return mailbox.drafts;
      case 'starred': return mailbox.starred;
      case 'trash': return mailbox.trash;
      case 'swap_requests': return swapRequests;
      default: return [];
    }
  };

  const filteredMessages = getFilteredMessages();

  const folders = [
    { type: 'inbox' as FolderType, label: 'דואר נכנס', icon: Inbox, count: mailbox?.inbox.filter(m => !m.isRead?.['admin']).length || 0 },
    { type: 'sent' as FolderType, label: 'דואר יוצא', icon: Send, count: mailbox?.sent.length || 0 },
    { type: 'drafts' as FolderType, label: 'טיוטות', icon: FileText, count: mailbox?.drafts.length || 0 },
    { type: 'starred' as FolderType, label: 'מסומנות בכוכב', icon: Star, count: mailbox?.starred.length || 0 },
    { type: 'swap_requests' as FolderType, label: 'בקשות החלפה', icon: ArrowLeftRight, count: swapRequests.length },
    { type: 'trash' as FolderType, label: 'אשפה', icon: Trash2, count: mailbox?.trash.length || 0 },
  ];

  // Mobile View
  if (isMobile) {
    return (
      <div className="flex flex-col h-[calc(100vh-200px)]" dir="rtl">
        {mobileView === 'list' && (
          <>
            {/* Mobile Folders Bar */}
            <div className="flex items-center gap-2 p-2 border-b overflow-x-auto">
              {folders.map(folder => (
                <Button
                  key={folder.type}
                  variant={selectedFolder === folder.type ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectedFolder(folder.type)}
                  className="flex-shrink-0"
                >
                  <folder.icon className="w-4 h-4 mr-1" />
                  {folder.count > 0 && <Badge variant="secondary" className="ml-1">{folder.count}</Badge>}
                </Button>
              ))}
            </div>
            
            {/* Compose Button */}
            <div className="p-2 border-b flex gap-2">
              <Button onClick={handleCompose} className="flex-1">
                <Plus className="w-4 h-4 mr-2" />
                הודעה חדשה
              </Button>
              <Button 
                variant="outline" 
                size="icon"
                onClick={handleSyncGmail}
                disabled={isSyncingGmail}
                title="סנכרן מג'ימייל"
              >
                <RefreshCw className={cn("w-4 h-4", isSyncingGmail && "animate-spin")} />
              </Button>
            </div>

            {/* Messages List */}
            <ScrollArea className="flex-1">
              {filteredMessages.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {selectedFolder === 'inbox' && 'אין הודעות חדשות'}
                  {selectedFolder === 'sent' && 'לא נשלחו הודעות'}
                  {selectedFolder === 'drafts' && 'אין טיוטות'}
                  {selectedFolder === 'starred' && 'אין הודעות מסומנות'}
                  {selectedFolder === 'swap_requests' && 'אין בקשות החלפה'}
                  {selectedFolder === 'trash' && 'האשפה ריקה'}
                </div>
              ) : (
                filteredMessages.map(message => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    selectedFolder={selectedFolder}
                    isSelected={selectedMessage?.id === message.id}
                    students={students}
                    onSelect={() => handleMarkAsRead(message)}
                    onToggleStar={() => handleToggleStar(message.id)}
                  />
                ))
              )}
            </ScrollArea>
          </>
        )}

        {mobileView === 'message' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 p-2 border-b">
              <Button variant="ghost" size="icon" onClick={() => {
                setMobileView('list');
                setIsComposing(false);
                setSelectedMessage(null);
              }}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <span className="font-medium">
                {isComposing ? (isReplying ? 'תגובה להודעה' : 'הודעה חדשה') : selectedMessage?.subject || '(ללא נושא)'}
              </span>
            </div>
            
            <ScrollArea className="flex-1 p-4">
              {isComposing ? (
                <ComposeForm
                  composeSubject={composeSubject}
                  setComposeSubject={setComposeSubject}
                  composeRecipients={composeRecipients}
                  setComposeRecipients={setComposeRecipients}
                  expirationDate={expirationDate}
                  setExpirationDate={setExpirationDate}
                  students={students}
                  editorRef={editorRef}
                  fileInputRef={fileInputRef}
                  attachments={attachments}
                  isUploading={isUploading}
                  onSend={handleSend}
                  onSaveDraft={handleSaveDraft}
                  onCancel={resetCompose}
                  onFileUpload={handleFileUpload}
                  onDeleteAttachment={handleDeleteAttachment}
                  onPasteImage={handlePasteImage}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ) : selectedMessage ? (
                <MessageView
                  message={selectedMessage}
                  students={students}
                  selectedFolder={selectedFolder}
                  onReply={() => handleReply(selectedMessage)}
                  onForward={() => handleForward(selectedMessage)}
                  onToggleStar={() => handleToggleStar(selectedMessage.id)}
                  onMoveToTrash={() => handleMoveToTrash(selectedMessage.id)}
                  onRestore={() => handleRestore(selectedMessage.id)}
                  onHardDelete={() => handleHardDelete(selectedMessage.id)}
                  onMarkAsUnread={() => handleMarkAsUnread(selectedMessage.id)}
                  onToggleReaction={(emoji) => handleToggleReaction(selectedMessage.id, emoji)}
                  onApproveSwap={handleApproveSwap}
                  onRejectSwap={handleRejectSwap}
                  onClose={() => {
                    setMobileView('list');
                    setSelectedMessage(null);
                  }}
                />
              ) : null}
            </ScrollArea>
          </div>
        )}
      </div>
    );
  }

  // Desktop View with Resizable Panels
  return (
    <div className="h-[calc(100vh-250px)]" dir="rtl">
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={handleLayoutChange}
        className="h-full rounded-lg border"
      >
        {/* Sidebar - Folders */}
        <ResizablePanel
          defaultSize={sidebarCollapsed ? 5 : panelSizes[0]}
          minSize={5}
          maxSize={25}
          className="bg-muted/30"
        >
          <div className="h-full flex flex-col">
            <div className="p-2 flex items-center justify-between border-b">
              {!sidebarCollapsed && (
                <>
                  <Button onClick={handleCompose} size="sm" className="flex-1 mr-2">
                    <Plus className="w-4 h-4 mr-1" />
                    חדש
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleSyncGmail}
                    disabled={isSyncingGmail}
                    title="סנכרן מג'ימייל"
                    className="h-8 w-8 mr-2"
                  >
                    <RefreshCw className={cn("w-4 h-4", isSyncingGmail && "animate-spin")} />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="h-8 w-8"
              >
                {sidebarCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
            
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-1">
                {folders.map(folder => (
                  <Button
                    key={folder.type}
                    variant={selectedFolder === folder.type ? 'secondary' : 'ghost'}
                    className={cn(
                      "w-full",
                      sidebarCollapsed ? "justify-center px-2" : "justify-between"
                    )}
                    onClick={() => {
                      setSelectedFolder(folder.type);
                      setSelectedMessage(null);
                      setIsComposing(false);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <folder.icon className="w-4 h-4" />
                      {!sidebarCollapsed && <span>{folder.label}</span>}
                    </div>
                    {!sidebarCollapsed && folder.count > 0 && (
                      <Badge variant="secondary">{folder.count}</Badge>
                    )}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Message List */}
        <ResizablePanel defaultSize={panelSizes[1]} minSize={20}>
          <div className="h-full flex flex-col">
            <div className="p-3 border-b flex items-center justify-between">
              <h3 className="font-semibold">{folders.find(f => f.type === selectedFolder)?.label}</h3>
              {selectedFolder === 'trash' && mailbox && mailbox.trash.length > 0 && (
                <Button variant="destructive" size="sm" onClick={handleEmptyTrash}>
                  רוקן אשפה
                </Button>
              )}
            </div>
            <ScrollArea className="flex-1">
              {filteredMessages.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {selectedFolder === 'inbox' && 'אין הודעות חדשות'}
                  {selectedFolder === 'sent' && 'לא נשלחו הודעות'}
                  {selectedFolder === 'drafts' && 'אין טיוטות'}
                  {selectedFolder === 'starred' && 'אין הודעות מסומנות'}
                  {selectedFolder === 'swap_requests' && 'אין בקשות החלפה'}
                  {selectedFolder === 'trash' && 'האשפה ריקה'}
                </div>
              ) : (
                filteredMessages.map(message => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    selectedFolder={selectedFolder}
                    isSelected={selectedMessage?.id === message.id}
                    students={students}
                    onSelect={() => handleMarkAsRead(message)}
                    onToggleStar={() => handleToggleStar(message.id)}
                  />
                ))
              )}
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Message View / Compose */}
        <ResizablePanel defaultSize={panelSizes[2]} minSize={30}>
          <div className="h-full overflow-y-auto p-4">
            {isComposing ? (
              <ComposeForm
                composeSubject={composeSubject}
                setComposeSubject={setComposeSubject}
                composeRecipients={composeRecipients}
                setComposeRecipients={setComposeRecipients}
                expirationDate={expirationDate}
                setExpirationDate={setExpirationDate}
                students={students}
                editorRef={editorRef}
                fileInputRef={fileInputRef}
                attachments={attachments}
                isUploading={isUploading}
                onSend={handleSend}
                onSaveDraft={handleSaveDraft}
                onCancel={resetCompose}
                onFileUpload={handleFileUpload}
                onDeleteAttachment={handleDeleteAttachment}
                onPasteImage={handlePasteImage}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ) : selectedMessage ? (
              <MessageView
                message={selectedMessage}
                students={students}
                selectedFolder={selectedFolder}
                onReply={() => handleReply(selectedMessage)}
                onForward={() => handleForward(selectedMessage)}
                onToggleStar={() => handleToggleStar(selectedMessage.id)}
                onMoveToTrash={() => handleMoveToTrash(selectedMessage.id)}
                onRestore={() => handleRestore(selectedMessage.id)}
                onHardDelete={() => handleHardDelete(selectedMessage.id)}
                onMarkAsUnread={() => handleMarkAsUnread(selectedMessage.id)}
                onToggleReaction={(emoji) => handleToggleReaction(selectedMessage.id, emoji)}
                onApproveSwap={handleApproveSwap}
                onRejectSwap={handleRejectSwap}
                onClose={() => setSelectedMessage(null)}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                בחר הודעה לצפייה
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// Message Row Component
interface MessageRowProps {
  message: Message;
  selectedFolder: FolderType;
  isSelected: boolean;
  students: Student[];
  onSelect: () => void;
  onToggleStar: () => void;
}

function MessageRow({ message, selectedFolder, isSelected, students, onSelect, onToggleStar }: MessageRowProps) {
  const isRead = message.isRead?.['admin'];
  const isStarred = message.starred?.['admin'];

  return (
    <div
      onClick={onSelect}
      className={cn(
        "p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors",
        !isRead && selectedFolder === 'inbox' && "bg-primary/5 font-medium",
        isSelected && "bg-muted"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-1">
          {!isRead && selectedFolder === 'inbox' ? (
            <Mail className="w-4 h-4 text-primary" />
          ) : (
            <MailOpen className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          disabled={isStarred && !canUserRemoveStar(message, 'admin')}
          className={cn(
            "mt-1 flex-shrink-0",
            isStarred && !canUserRemoveStar(message, 'admin') && "opacity-50 cursor-not-allowed"
          )}
        >
          <Star 
            className={cn(
              "w-4 h-4",
              isStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
            )} 
          />
        </button>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("truncate", !isRead && "font-semibold")}>
              {message.subject || '(ללא נושא)'}
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatMessageDate(message.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground truncate mt-1">
            <span>
              {selectedFolder === 'sent' 
                ? `אל: ${formatRecipients(message.recipientIds, students)}` 
                : `מאת: ${message.senderName}`}
            </span>
            <MessageTypeBadge message={message} />
          </div>
          <p className="text-xs text-muted-foreground truncate mt-1">
            {message.content}
          </p>
        </div>
      </div>
    </div>
  );
}

// Message View Component
interface MessageViewProps {
  message: Message;
  students: Student[];
  selectedFolder: FolderType;
  onReply: () => void;
  onForward: () => void;
  onToggleStar: () => void;
  onMoveToTrash: () => void;
  onRestore: () => void;
  onHardDelete: () => void;
  onMarkAsUnread: () => void;
  onToggleReaction: (emoji: string) => void;
  onApproveSwap: (swapRequestId: string) => void;
  onRejectSwap: (swapRequestId: string) => void;
  onClose: () => void;
}

function MessageView({
  message,
  students,
  selectedFolder,
  onReply,
  onForward,
  onToggleStar,
  onMoveToTrash,
  onRestore,
  onHardDelete,
  onMarkAsUnread,
  onToggleReaction,
  onApproveSwap,
  onRejectSwap,
  onClose,
}: MessageViewProps) {
  const isStarred = message.starred?.['admin'];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 pb-4 border-b">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xl font-semibold">{message.subject || '(ללא נושא)'}</h3>
            <MessageTypeBadge message={message} />
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>מאת: {message.senderName}</div>
            <div>אל: {formatRecipients(message.recipientIds, students)}</div>
            <div>{new Date(message.createdAt).toLocaleString('he-IL')}</div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="text-sm leading-relaxed">
        {message.contentHtml ? (
          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.contentHtml) }} />
        ) : (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
      </div>

      {/* Attachments */}
      {message.attachments && message.attachments.length > 0 && (
        <div className="pt-4 border-t space-y-2">
          <Label>קבצים מצורפים ({message.attachments.length})</Label>
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((att, idx) => (
              <AttachmentPreview key={idx} attachment={att} readOnly />
            ))}
          </div>
        </div>
      )}

      {/* Swap request actions */}
      {message.metadata?.action === 'approve_or_reject' && message.metadata.swapRequestId && (
        <div className="flex gap-2 p-4 bg-muted rounded-lg">
          <Button onClick={() => onApproveSwap(message.metadata!.swapRequestId!)} variant="default">
            אשר החלפה
          </Button>
          <Button onClick={() => onRejectSwap(message.metadata!.swapRequestId!)} variant="destructive">
            דחה החלפה
          </Button>
        </div>
      )}

      {/* Reactions */}
      <ReactionBar
        message={message}
        currentUserId="admin"
        onToggleReaction={onToggleReaction}
      />

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-4 border-t">
        <Button variant="outline" size="sm" onClick={onReply}>
          <Reply className="w-4 h-4 mr-2" />
          השב
        </Button>
        <Button variant="outline" size="sm" onClick={onForward}>
          <Forward className="w-4 h-4 mr-2" />
          העבר
        </Button>
        {message.isRead?.['admin'] && (
          <Button variant="outline" size="sm" onClick={onMarkAsUnread}>
            <MailOpen className="w-4 h-4 mr-2" />
            סמן כלא נקרא
          </Button>
        )}
        {selectedFolder !== 'trash' ? (
          <Button variant="outline" size="sm" onClick={onMoveToTrash}>
            <Trash2 className="w-4 h-4 mr-2" />
            העבר לאשפה
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={onRestore}>
              <RotateCcw className="w-4 h-4 mr-2" />
              שחזר
            </Button>
            <Button variant="destructive" size="sm" onClick={onHardDelete}>
              <X className="w-4 h-4 mr-2" />
              מחק לצמיתות
            </Button>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleStar}
          disabled={isStarred && !canUserRemoveStar(message, 'admin')}
        >
          <Star className={cn("w-4 h-4 mr-2", isStarred && "fill-yellow-400")} />
          {isStarred ? 'הסר כוכב' : 'סמן בכוכב'}
        </Button>
      </div>
    </div>
  );
}

// Compose Form Component
interface ComposeFormProps {
  composeSubject: string;
  setComposeSubject: (v: string) => void;
  composeRecipients: string[];
  setComposeRecipients: (v: string[]) => void;
  expirationDate: string;
  setExpirationDate: (v: string) => void;
  students: Student[];
  editorRef: React.RefObject<RichTextEditorHandle>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  attachments: Attachment[];
  isUploading: boolean;
  onSend: () => void;
  onSaveDraft: () => void;
  onCancel: () => void;
  onFileUpload: (files: FileList | null) => void;
  onDeleteAttachment: (index: number) => void;
  onPasteImage: (file: File) => Promise<string | null>;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

function ComposeForm({
  composeSubject,
  setComposeSubject,
  composeRecipients,
  setComposeRecipients,
  expirationDate,
  setExpirationDate,
  students,
  editorRef,
  fileInputRef,
  attachments,
  isUploading,
  onSend,
  onSaveDraft,
  onCancel,
  onFileUpload,
  onDeleteAttachment,
  onPasteImage,
  onDragOver,
  onDrop,
}: ComposeFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>נמענים</Label>
        <Select
          value={composeRecipients[0]}
          onValueChange={(value) => setComposeRecipients([value])}
        >
          <SelectTrigger>
            <SelectValue placeholder="בחר נמענים" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל התלמידות</SelectItem>
            {students.map((student) => (
              <SelectItem key={student.id} value={student.id}>
                {student.firstName} {student.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">נושא</Label>
        <Input
          id="subject"
          value={composeSubject}
          onChange={(e) => setComposeSubject(e.target.value)}
          placeholder="נושא ההודעה"
        />
      </div>

      <div className="space-y-2">
        <Label>תוכן</Label>
        <RichTextEditor
          ref={editorRef}
          onPasteImage={onPasteImage}
          onFileUpload={() => fileInputRef.current?.click()}
          isUploading={isUploading}
          onDragOver={onDragOver}
          onDrop={onDrop}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onFileUpload(e.target.files)}
        />
      </div>

      {/* Attachments display */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <Label>קבצים מצורפים ({attachments.length})</Label>
          <div className="flex flex-wrap gap-2">
            {attachments.map((att, idx) => (
              <AttachmentPreview 
                key={idx} 
                attachment={att} 
                onDelete={() => onDeleteAttachment(idx)}
              />
            ))}
          </div>
        </div>
      )}

      {isUploading && (
        <div className="text-sm text-muted-foreground">
          מעלה קבצים...
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="expiration">תאריך תפוגה (אופציונלי)</Label>
        <Input
          id="expiration"
          type="date"
          value={expirationDate}
          onChange={(e) => setExpirationDate(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={onSend}>
          <Send className="w-4 h-4 mr-2" />
          שלח
        </Button>
        <Button variant="outline" onClick={onSaveDraft}>
          <Save className="w-4 h-4 mr-2" />
          שמור כטיוטה
        </Button>
        <Button variant="outline" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </div>
  );
}
