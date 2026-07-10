import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GripVertical, Plus, Trash2, ArrowUp, ArrowDown, X } from "lucide-react";
import {
  FormField,
  FieldType,
  FIELD_TYPE_LABELS,
  NEEDS_OPTIONS,
  newField,
} from "@/lib/form-fields";

interface Props {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}

export default function FormBuilder({ fields, onChange }: Props) {
  const [newType, setNewType] = useState<FieldType>("text");

  const update = (id: string, patch: Partial<FormField>) => {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };
  const remove = (id: string) => onChange(fields.filter((f) => f.id !== id));
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
              <div className="flex items-center gap-2">
                <Switch
                  checked={field.required}
                  onCheckedChange={(checked) => update(field.id, { required: checked })}
                />
                <span className="text-xs text-muted-foreground">Obbligatorio</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}