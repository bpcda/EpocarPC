import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GripVertical, Plus, Trash2, ArrowUp, ArrowDown, X, FileUp, FileText } from "lucide-react";
import {
  FormField,
  FieldType,
  FIELD_TYPE_LABELS,
  NEEDS_OPTIONS,
  newField,
  ALLOWED_UPLOAD_ACCEPT,
  isAllowedUploadFile,
  DocumentAttachment,
} from "@/lib/form-fields";

interface Props {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}

export default function FormBuilder({ fields, onChange }: Props) {
  const [newType, setNewType] = useState<FieldType>("text");
  const [uploadingFieldId, setUploadingFieldId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<FormField>) => {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };
  const remove = (id: string) => onChange(fields.filter((f) => f.id !== id));

  const uploadDocument = async (field: FormField, file: File) => {
    if (!isAllowedUploadFile(file.name)) {
      toast({
        title: "Formato non consentito",
        description: "Solo PDF, DOCX o immagini (JPG, PNG, WEBP, HEIC).",
        variant: "destructive",
      });
      return;
    }
    setUploadingFieldId(field.id);
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `${field.id}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from("event-documents")
      .upload(path, file, { upsert: false, contentType: file.type || undefined });
    setUploadingFieldId(null);
    if (error) {
      toast({ title: "Upload fallito", description: error.message, variant: "destructive" });
      return;
    }
    const doc: DocumentAttachment = { path, filename: file.name, size: file.size };
    update(field.id, { documents: [...(field.documents || []), doc] });
  };

  const removeDocument = async (field: FormField, doc: DocumentAttachment) => {
    await supabase.storage.from("event-documents").remove([doc.path]);
    update(field.id, { documents: (field.documents || []).filter((d) => d.path !== doc.path) });
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const copy = [...fields];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange(copy);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">
            Aggiungi campo
          </label>
          <Select value={newType} onValueChange={(v) => setNewType(v as FieldType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => onChange([...fields, newField(newType)])}
        >
          <Plus className="h-4 w-4 mr-1" />
          Aggiungi
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6 border border-dashed">
          Nessun campo. Aggiungi il primo per iniziare.
        </p>
      ) : (
        <div className="space-y-2">
          {fields.map((field, i) => (
            <div key={field.id} className="border border-border p-3 space-y-2 bg-card">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {FIELD_TYPE_LABELS[field.type]}
                </span>
                <div className="ml-auto flex gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === fields.length - 1}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(field.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Input
                placeholder="Etichetta del campo"
                value={field.label}
                onChange={(e) => update(field.id, { label: e.target.value })}
              />
              {field.type === "file_upload" && (
                <Input
                  placeholder="Istruzioni (opzionale) — es. carica il documento firmato"
                  value={field.hint || ""}
                  onChange={(e) => update(field.id, { hint: e.target.value })}
                />
              )}
              {field.type === "document" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Carica i documenti da scaricare (PDF, DOCX, immagini).
                  </p>
                  <div className="space-y-1">
                    {(field.documents || []).map((d) => (
                      <div
                        key={d.path}
                        className="flex items-center gap-2 text-sm border border-border px-2 py-1"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{d.filename}</span>
                        <span className="text-xs text-muted-foreground">
                          {Math.max(1, Math.round(d.size / 1024))} KB
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeDocument(field, d)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer border border-dashed border-border px-3 py-2 hover:bg-accent/50">
                    <FileUp className="h-4 w-4" />
                    {uploadingFieldId === field.id ? "Upload in corso..." : "Aggiungi documento"}
                    <input
                      type="file"
                      className="hidden"
                      accept={ALLOWED_UPLOAD_ACCEPT}
                      disabled={uploadingFieldId === field.id}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadDocument(field, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              )}
              {NEEDS_OPTIONS.includes(field.type) && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Opzioni</label>
                  {(field.options || []).map((opt, idx) => (
                    <div key={idx} className="flex gap-1">
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const options = [...(field.options || [])];
                          options[idx] = e.target.value;
                          update(field.id, { options });
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const options = (field.options || []).filter((_, k) => k !== idx);
                          update(field.id, { options });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update(field.id, {
                        options: [...(field.options || []), `Opzione ${(field.options?.length || 0) + 1}`],
                      })
                    }
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Opzione
                  </Button>
                </div>
              )}
              {field.type !== "document" && (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={field.required}
                    onCheckedChange={(checked) => update(field.id, { required: checked })}
                  />
                  <span className="text-xs text-muted-foreground">Obbligatorio</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}