import { Button, Empty, Page, PageHead, Card } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';

export default function NotFoundPage() {
  const { user } = useAuth();
  return (
    <Page>
      <PageHead title="Screen not found" sub="This address is not part of Holy Sai Smart School 360." />
      <Card>
        <Empty icon="compass" title="Nothing here" sub="Use the navigation on the left, or return to your dashboard." action={<Button variant="primary" to={user?.role.homeRoute ?? '/'}>Go to dashboard</Button>} />
      </Card>
    </Page>
  );
}
