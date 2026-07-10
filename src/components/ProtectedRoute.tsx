import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";

export default function ProtectedRoute({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { user, isAdmin, canAccessDashboard, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  const allowed = adminOnly ? isAdmin : canAccessDashboard;
  if (!user || !allowed) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}
