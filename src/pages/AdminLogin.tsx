import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && user && isAdmin) {
      navigate("/admin", { replace: true });
    }
  }, [authLoading, user, isAdmin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: authError } = await signIn(email, password);
      console.log("[AdminLogin] signIn result:", { data: !!data?.session, error: authError?.message });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
    } catch (err: any) {
      console.error("[AdminLogin] signIn exception:", err);
      setError(err?.message || "Errore di connessione al server");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loading) return;
    if (!authLoading && (!user || !isAdmin)) {
      setLoading(false);
    }
  }, [loading, authLoading, user, isAdmin]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-headline font-semibold text-foreground">
            Admin Epocar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Accedi alla dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            id="password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Accesso..." : "Accedi"}
          </Button>
        </form>
      </div>
    </div>
  );
}
