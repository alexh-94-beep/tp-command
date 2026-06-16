'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createInvoiceDraft } from '@/server/invoices/actions';

export default function NewInvoiceButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const r = await createInvoiceDraft();
      if (!r.ok || !r.invoiceId) {
        alert(r.error ?? 'Fehler beim Anlegen');
        return;
      }
      router.push(`/invoices/${r.invoiceId}` as never);
    });
  }

  return (
    <Button onClick={onClick} disabled={pending}>
      <Plus className="h-4 w-4" />
      {pending ? 'Erzeuge…' : 'Neue Rechnung'}
    </Button>
  );
}
