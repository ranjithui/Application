import { useAuth } from '@/auth/AuthContext';
import { Banner, Card, Dl, Grid, Page, PageHead } from '@/components/ui';

export default function HelpPage() {
  const { user } = useAuth();
  return (
    <Page>
      <PageHead title="Help" sub="How Holy Sai Smart School 360 works." />
      <Grid cols="g-2col">
        <Card title="Getting around">
          <Dl items={[
            ['Find a page', 'Type in “Find a page…” at the top of the sidebar. Esc clears it.'],
            ['Search', 'Ctrl K focuses global search for students, parents, staff, leads and pages.'],
            ['Students', 'Every student name opens the same Student 360 profile.'],
            ['Campus', 'The campus selector in the header scopes every figure in the application.'],
            ['Language', 'Use the language button for English, தமிழ் or हिन्दी.'],
          ]} />
        </Card>
        <Card title="Your access">
          <p className="t-sm">You are signed in as <strong>{user?.fullName}</strong> ({user?.role.name}). Menus, data and actions follow your role, and the server enforces the same rules on every request.</p>
          <div className="mt-4"><Banner tone="neutral" icon="shield">If you need access to a module you cannot see, ask the school administrator.</Banner></div>
        </Card>
        <Card title="Student tracking">
          <p className="t-sm">Locations come from the student's ID-card tag or bus RFID. A location older than 30 minutes is shown as “last known”. Parents see only their own children; every view is audited.</p>
        </Card>
        <Card title="Support">
          <p className="t-sm">Front office: Monday to Saturday, 8:00 am to 5:00 pm. For account or password problems, contact the school office.</p>
        </Card>
      </Grid>
    </Page>
  );
}
