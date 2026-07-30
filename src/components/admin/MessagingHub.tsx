import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MessagingTab from '@/components/admin/MessagingTab';
import StudentMailingTab from '@/components/admin/StudentMailingTab';

export default function MessagingHub() {
  return (
    <Tabs defaultValue="messages" dir="rtl" className="space-y-4">
      <TabsList className="w-full h-auto justify-start gap-1 overflow-x-auto">
        <TabsTrigger value="messages" className="whitespace-nowrap">📨 הודעות</TabsTrigger>
        <TabsTrigger value="students-mailing" className="whitespace-nowrap">📣 שליחה לתפוצת תלמידות</TabsTrigger>
      </TabsList>

      <TabsContent value="messages" className="mt-0 space-y-4">
        <MessagingTab />
      </TabsContent>

      <TabsContent value="students-mailing" className="mt-0">
        <StudentMailingTab />
      </TabsContent>
    </Tabs>
  );
}
