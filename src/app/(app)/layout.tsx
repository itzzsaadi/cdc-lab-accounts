import { AuthenticatedShell } from "../../components/layout/AuthenticatedShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
