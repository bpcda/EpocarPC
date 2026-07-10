import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EventRegistrationForm from "@/components/EventRegistrationForm";
import type { FormField } from "@/lib/form-fields";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface EventData {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  location: string | null;
  image_url: string | null;
  registration_enabled: boolean | null;
  allow_guests: boolean | null;
  form_fields: FormField[] | null;
}

export default function EventoIscrizione() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, description, date, location, image_url, registration_enabled, allow_guests, form_fields")
        .eq("id", id)
        .eq("published", true)
        .maybeSingle();
      setEvent((data as unknown as EventData) || null);
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!auth.user || !id) {
      setAlreadyRegistered(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("event_registrations")
        .select("id")
        .eq("event_id", id)
        .eq("user_id", auth.user!.id)
        .maybeSingle();
      setAlreadyRegistered(!!data);
    })();
  }, [auth.user, id]);

  return (
    <>
      <Navbar />
      <main className="bg-foreground min-h-screen pt-32 pb-24">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-primary-foreground/60 hover:text-primary-foreground text-sm font-headline tracking-widest mb-8"
          >
            <ArrowLeft className="w-4 h-4" /> INDIETRO
          </button>

          {loading ? (
            <p className="text-primary-foreground/50">Caricamento…</p>
          ) : !event ? (
            <p className="text-primary-foreground/70">Evento non trovato.</p>
          ) : (
            <>
              <p className="font-headline text-xs tracking-[0.3em] text-primary-foreground/40 mb-3">
                ISCRIZIONE EVENTO
              </p>
              <h1 className="font-headline text-5xl md:text-7xl text-primary-foreground leading-none tracking-wider">
                {event.title.toUpperCase()}
              </h1>
              <div className="w-24 h-0.5 bg-primary-foreground/30 mt-4 mb-8" />

              <div className="flex flex-wrap gap-8 mb-10">
                {event.date && (
                  <div>
                    <p className="font-headline text-xs tracking-widest text-primary-foreground/40">DATA</p>
                    <p className="text-primary-foreground/80 text-sm mt-1">
                      {new Date(event.date).toLocaleDateString("it-IT", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                )}
                {event.location && (
                  <div>
                    <p className="font-headline text-xs tracking-widest text-primary-foreground/40">LUOGO</p>
                    <p className="text-primary-foreground/80 text-sm mt-1">{event.location}</p>
                  </div>
                )}
              </div>

              {!event.registration_enabled ? (
                <div className="border border-primary-foreground/30 p-6 bg-primary-foreground/5">
                  <p className="text-primary-foreground/80 text-sm">
                    Le iscrizioni per questo evento non sono attive.
                  </p>
                </div>
              ) : alreadyRegistered ? (
                <div className="border border-primary-foreground/30 p-8 bg-primary-foreground/5 space-y-4">
                  <p className="font-headline text-2xl text-primary-foreground tracking-wider">
                    SEI GIÀ ISCRITTO
                  </p>
                  <p className="text-primary-foreground/70 text-sm">
                    Risulti già registrato a questo evento. Ci vediamo lì!
                  </p>
                  <Link to="/eventi">
                    <Button
                      variant="outline"
                      className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 font-headline tracking-widest"
                    >
                      TORNA AGLI EVENTI
                    </Button>
                  </Link>
                </div>
              ) : (
                <EventRegistrationForm
                  eventId={event.id}
                  allowGuests={!!event.allow_guests}
                  fields={(event.form_fields as FormField[]) || []}
                />
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}