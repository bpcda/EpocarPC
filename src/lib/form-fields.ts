export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "datetime"
  | "radio"
  | "checkbox"
  | "select"
  | "vehicle";

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  options?: string[];
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Testo breve",
  textarea: "Testo lungo",
  email: "Email",
  phone: "Telefono",
  number: "Numero",
  date: "Data",
  datetime: "Data e ora",
  radio: "Scelta singola",
  checkbox: "Scelta multipla",
  select: "Menu a tendina",
  vehicle: "Veicolo dell'utente",
};

export const NEEDS_OPTIONS: FieldType[] = ["radio", "checkbox", "select"];

export function newField(type: FieldType): FormField {
  return {
    id: crypto.randomUUID(),
    type,
    label: FIELD_TYPE_LABELS[type],
    required: false,
    options: NEEDS_OPTIONS.includes(type) ? ["Opzione 1"] : undefined,
  };
}