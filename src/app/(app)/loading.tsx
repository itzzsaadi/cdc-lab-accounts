import { LoadingSkeleton } from "../../components/ui/LoadingSkeleton";

export default function AppLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <LoadingSkeleton className="h-8 w-48" />
      <LoadingSkeleton className="h-24 w-full" />
      <LoadingSkeleton className="h-24 w-full" />
    </div>
  );
}
