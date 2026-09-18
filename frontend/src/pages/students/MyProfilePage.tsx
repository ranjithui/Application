import { useAuth } from '@/auth/AuthContext';
import { Empty, Page } from '@/components/ui';
import { Student360 } from './Student360Page';

/** Student portal: the signed-in student's own Student 360 (the API scopes it to them). */
export default function MyProfilePage() {
  const { user } = useAuth();
  if (!user?.studentId) {
    return <Page><Empty icon="user" title="No student record is linked to this account" sub="Please contact the school office." /></Page>;
  }
  return <Student360 id={user.studentId} />;
}
