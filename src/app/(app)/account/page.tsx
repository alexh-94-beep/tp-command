import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import PasswordChangeForm from './password-form';

export const metadata = { title: 'Mein Konto' };

const ROLE_LABEL = {
  admin: 'Admin',
  office: 'Office',
  cleaning: 'Reinigung',
  management: 'Management',
} as const;

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Mein Konto"
        description="Eigene Stammdaten und Passwort"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stammdaten</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <div>
              <span className="text-slate-500">Name:</span>{' '}
              <span className="font-medium">{user.fullName}</span>
            </div>
            <div>
              <span className="text-slate-500">E-Mail:</span>{' '}
              <span className="font-mono text-xs">{user.email}</span>
            </div>
            <div>
              <span className="text-slate-500">Rolle:</span>{' '}
              <span className="font-medium">{ROLE_LABEL[user.role]}</span>
            </div>
            <p className="pt-2 text-xs text-slate-500">
              Name, E-Mail und Rolle werden vom Admin gepflegt.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Passwort ändern</CardTitle>
          </CardHeader>
          <CardBody>
            <PasswordChangeForm />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
