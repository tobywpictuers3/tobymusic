import { useEffect } from 'react';
import { toast } from '@/hooks/use-toast';
import { subscribeFinancialDurabilityWarnings } from '@/lib/financialDurability';

export default function FinancialDurabilityNotifier() {
  useEffect(() => subscribeFinancialDurabilityWarnings(message => {
    toast({
      title: '⚠️ שמירה כספית לא אומתה',
      description: message,
      variant: 'destructive',
    });
  }), []);

  return null;
}
