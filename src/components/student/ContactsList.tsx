import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Mail, Phone, Search, Users } from 'lucide-react';
import { getStudents } from '@/lib/storage';

const ContactsList = () => {
  const [query, setQuery] = useState('');
  const contacts = useMemo(() => getStudents()
    .filter(student => student.isActive !== false)
    .map(student => ({
      id: student.id,
      name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
      phones: [student.phone, ...(student.additionalPhones || [])].filter(Boolean),
      emails: [student.email, ...(student.additionalEmails || [])].filter(Boolean),
    }))
    .filter(contact => contact.name.toLocaleLowerCase('he-IL').includes(query.trim().toLocaleLowerCase('he-IL')))
    .sort((a, b) => a.name.localeCompare(b.name, 'he')),
  [query]);

  return (
    <Card className="overflow-hidden border-[#C9A961]/40 bg-[#fffaf0]/95 shadow-xl dark:bg-[#140c0f]/95" dir="rtl">
      <CardHeader className="border-b border-[#C9A961]/30 bg-gradient-to-l from-[#6B1F2A] to-[#8B2A37] text-white">
        <CardTitle className="flex items-center gap-2 text-2xl"><Users className="h-6 w-6 text-[#FFE5A0]" />אנשי הקשר של התלמידות</CardTitle>
        <p className="text-sm text-white/80">פרטי הקשר המעודכנים של כל התלמידות הפעילות</p>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="חיפוש לפי שם" className="pr-9" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {contacts.map(contact => (
            <div key={contact.id} className="rounded-xl border border-[#C9A961]/35 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-black/20">
              <h3 className="mb-3 text-lg font-bold text-[#6B1F2A] dark:text-[#FFE5A0]">{contact.name}</h3>
              <div className="space-y-2 text-sm">
                {contact.phones.map(phone => <a key={phone} href={`tel:${phone}`} className="flex items-center gap-2 hover:text-[#8B2A37]"><Phone className="h-4 w-4 text-[#C9A961]" />{phone}</a>)}
                {contact.emails.map(email => <a key={email} href={`mailto:${email}`} className="flex items-center gap-2 break-all hover:text-[#8B2A37]"><Mail className="h-4 w-4 shrink-0 text-[#C9A961]" />{email}</a>)}
                {!contact.phones.length && !contact.emails.length && <span className="text-muted-foreground">לא הוזנו פרטי קשר</span>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ContactsList;
