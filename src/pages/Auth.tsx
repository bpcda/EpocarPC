import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextPath = params.get("next") || "/account";
  const { user } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate(nextPath, { replace: true });
  }, [user, nextPath, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + nextPath,
            data: { first_name: firstName, last_name: lastName },
          },
        });
        if (error) throw error;
        toast.success("Registrazione completata! Controlla la mail per confermare.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Accesso effettuato");
        navigate(nextPath, { replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore di autenticazione";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate(nextPath, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore Google";
      toast.error(msg);
      setBusy(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Accedi o registrati — Epocar"
        description="Accedi al tuo account Epocar o registrati per iscriverti ai raduni, gestire i tuoi veicoli d'epoca e partecipare alla community."
        path="/auth"
      />
      <Navbar />
      <main className="min-h-screen bg-foreground pt-32 pb-24">
        <div className="max-w-md mx-auto px-6">
          <h1 className="font-headline text-5xl md:text-6xl text-primary-foreground tracking-wider mb-2">
            {mode === "signin" ? "ACCEDI" : "REGISTRATI"}
          </h1>
          <div className="w-24 h-0.5 bg-primary-foreground/30 mb-10" />

          <Button
            type="button"
            variant="outline"
            className="w-full mb-6 border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
            onClick={handleGoogle}
            disabled={busy}
          >
            Continua con Google
          </Button>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-primary-foreground/20" />
            <span className="text-xs text-primary-foreground/50 tracking-widest">OPPURE</span>
            <div className="flex-1 h-px bg-primary-foreground/20" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="fn" className="text-primary-foreground/70">Nome</Label>
                  <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} required
                    className="bg-transparent border-primary-foreground/30 text-primary-foreground" />
                </div>
                <div>
                  <Label htmlFor="ln" className="text-primary-foreground/70">Cognome</Label>
                  <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} required
                    className="bg-transparent border-primary-foreground/30 text-primary-foreground" />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="email" className="text-primary-foreground/70">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="bg-transparent border-primary-foreground/30 text-primary-foreground" />
            </div>
            <div>
              <Label htmlFor="pw" className="text-primary-foreground/70">Password</Label>
              <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                className="bg-transparent border-primary-foreground/30 text-primary-foreground" />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-primary-foreground text-foreground hover:bg-primary-foreground/90 font-headline tracking-widest">
              {busy ? "Attendere..." : mode === "signin" ? "ACCEDI" : "CREA ACCOUNT"}
            </Button>
          </form>

          <p className="text-sm text-primary-foreground/60 mt-6 text-center">
            {mode === "signin" ? "Non hai un account?" : "Hai già un account?"}{" "}
            <button
              type="button"
              className="text-primary-foreground underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Registrati" : "Accedi"}
            </button>
          </p>
          <p className="text-xs text-primary-foreground/40 mt-8 text-center">
            <Link to="/">← Torna alla home</Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}