import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { ErrorBox, Loading, PageHeader, StatusBadge, defaultYear, useTreasuryData, useTreasuryYear } from "./shared";

/** Landing page of a per-year section (/tesoreria/quote, /budget, /rendiconto): pick the fiscal year. */
export default function YearPicker({ section, title }: { section: "quote" | "budget" | "rendiconto"; title: string }) {
  const year = useTreasuryYear();
  const { data, error, isLoading } = useTreasuryData(year);
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const years = data.years.length ? [...data.years].sort((a, b) => b.year - a.year) : [{ year: defaultYear(), status: "open" as const }];
  return (
    <>
      <PageHeader crumbs={[{ label: title }]} title={title} subtitle="Seleziona l’esercizio" />
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {years.map((y) => (
          <li key={y.year}>
            <Link to={`/tesoreria/${section}/${y.year}`} className="flex items-center justify-between border border-border bg-card p-5 min-h-20 hover:bg-muted/40">
              <span><span className="font-headline text-3xl text-foreground block">{y.year}</span><StatusBadge status={y.status} label={y.status === "open" ? "Aperto" : "Chiuso"} /></span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
