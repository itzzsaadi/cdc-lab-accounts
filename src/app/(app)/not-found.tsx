import { EmptyState } from "../../components/ui/EmptyState";

export default function AppNotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you're looking for doesn't exist or hasn't been built yet."
    />
  );
}
