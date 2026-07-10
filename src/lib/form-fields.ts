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
  | "vehicle"
  | "document"
  | "file_upload";

export interface DocumentAttachment {
  path: string;      // storage path inside "event-documents" bucket
  filename: string;  // original filename shown to the user
  size: number;      // bytes
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  options?: string[];
  /** For type = "document": files admins attach for participants to download. */
  documents?: DocumentAttachment[];
  /** For type = "file_upload": human-readable hint shown under the field. */
  hint?: string;
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
  document: "Documento da scaricare",
  file_upload: "Upload file (PDF / DOCX / immagine)",
};

export const NEEDS_OPTIONS: FieldType[] = ["radio", "checkbox", "select"];

export const ALLOWED_UPLOAD_EXTENSIONS = [
  "pdf", "docx", "jpg", "jpeg", "png", "webp", "heic",
] as const;

export const ALLOWED_UPLOAD_ACCEPT =
  ".pdf,.docx,.jpg,.jpeg,.png,.webp,.heic,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*";

export function isAllowedUploadFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return (ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext);
}

export function newField(type: FieldType): FormField {
  return {
    id: crypto.randomUUID(),
    type,
    label: FIELD_TYPE_LABELS[type],
    required: false,
    options: NEEDS_OPTIONS.includes(type) ? ["Opzione 1"] : undefined,
    documents: type === "document" ? [] : undefined,
  };
}