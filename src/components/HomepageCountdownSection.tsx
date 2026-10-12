import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import HomepageCountdown, { type CountdownEvent } from "@/components/HomepageCountdown";

/** Loads the single flagged event; the countdown hides itself if it is ended or not eligible. */
export default function HomepageCountdownSection() {
  const [event, setEvent] = useState<CountdownEvent | null>(null);
  useEffect(() => {
    let active = true;
    supabase.from("events")
      .select("id, title, date, end_date, location, published, show_homepage_countdown")
      .eq("published", true).eq("show_homepage_countdown", true)
      .order("date", { ascending: true }).limit(1)
      .then(({ data }) => { if (active && data?.[0]) setEvent(data[0] as CountdownEvent); }, () => undefined);
    return () => { active = false; };
  }, []);
  return event ? <HomepageCountdown event={event} /> : null;
}
