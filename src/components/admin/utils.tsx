import { useCallback } from "react";
export const handleFileSelect = (file: File, setImageFile: (arg0: File) => void, setImagePreview: (arg0: string) => void) => {
    if (!file.type.startsWith("image/")) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
};

export const handleDrop = useCallback((e: React.DragEvent, setDragging: (arg0: boolean) => void, handleFileSelect: (arg0: File) => void) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
}, []);

export const handleDragOver = useCallback((e: React.DragEvent, setDragging: (arg0: boolean) => void) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
}, []);

export const handleDragLeave = useCallback((e: React.DragEvent, setDragging: (arg0: boolean) => void) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
}, []);