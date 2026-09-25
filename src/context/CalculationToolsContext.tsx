import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { apiClient } from "@/api/client";
import { AddTagModal } from "@/components/calculation-tools/AddTagModal";
import { DraggableNote } from "@/components/calculation-tools/DraggableNote";
import { PressDailyInterestModal } from "@/components/calculation-tools/PressDailyInterestModal";
import styles from "@/components/calculation-tools/calculationTools.module.css";
import type { CalculationToolsContextValue, Note, Tag } from "@/context/calculationToolsTypes";
import {
  clearCalculationBinding,
  draftIdFromPath,
  isPersistedCaseId,
  readDraftNotes,
  readDraftTags,
  resolveCalculationId,
  writeBoundCaseId,
  writeDraftNotes,
  writeDraftTags,
} from "@/utils/calculationCaseBinding";

const CalculationToolsContext = createContext<CalculationToolsContextValue | null>(null);

export function CalculationToolsProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [registeredCaseId, setRegisteredCaseId] = useState<string | null>(null);
  const draftId = useMemo(() => draftIdFromPath(location.pathname), [location.pathname]);
  const calculationId = useMemo(() => {
    if (registeredCaseId && /^\d+$/.test(registeredCaseId)) return registeredCaseId;
    return resolveCalculationId(location.pathname, location.search);
  }, [location.pathname, location.search, registeredCaseId]);
  const persisted = isPersistedCaseId(calculationId);

  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showInterestModal, setShowInterestModal] = useState(false);
  const prevCalculationIdRef = useRef(calculationId);

  useEffect(() => {
    setRegisteredCaseId(null);
  }, [location.pathname]);

  const loadFromApi = useCallback(async (caseId: string) => {
    const [loadedNotes, loadedTags] = await Promise.all([
      apiClient<Note[]>(`/api/calculation/${caseId}/notes`),
      apiClient<Tag[]>(`/api/calculation/${caseId}/tags`),
    ]);
    setNotes(Array.isArray(loadedNotes) ? loadedNotes : []);
    setTags(Array.isArray(loadedTags) ? loadedTags : []);
  }, []);

  const migrateDraftToApi = useCallback(
    async (fromDraftId: string, caseId: string) => {
      const draftNotes = readDraftNotes(fromDraftId);
      const draftTags = readDraftTags(fromDraftId);
      if (draftNotes.length === 0 && draftTags.length === 0) return;

      try {
        for (const note of draftNotes) {
          await apiClient(`/api/calculation/${caseId}/notes`, {
            method: "POST",
            body: { x: note.x, y: note.y, text: note.text },
          });
        }
        for (const tag of draftTags) {
          await apiClient(`/api/calculation/${caseId}/tags`, {
            method: "POST",
            body: { color: tag.color, label: tag.label },
          });
        }
        clearCalculationBinding(location.pathname, fromDraftId);
        await loadFromApi(caseId);
      } catch {
        /* sessiz */
      }
    },
    [loadFromApi, location.pathname],
  );

  useEffect(() => {
    const prev = prevCalculationIdRef.current;
    prevCalculationIdRef.current = calculationId;

    if (!isPersistedCaseId(prev) && isPersistedCaseId(calculationId) && prev !== calculationId) {
      void migrateDraftToApi(prev, calculationId);
      return;
    }

    if (persisted) {
      let cancelled = false;
      loadFromApi(calculationId).catch(() => {
        if (!cancelled) {
          setNotes([]);
          setTags([]);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    setNotes(readDraftNotes(calculationId));
    setTags(readDraftTags(calculationId));
    return undefined;
  }, [calculationId, loadFromApi, migrateDraftToApi, persisted]);

  useEffect(() => {
    if (persisted) return;
    writeDraftNotes(calculationId, notes);
  }, [calculationId, notes, persisted]);

  useEffect(() => {
    if (persisted) return;
    writeDraftTags(calculationId, tags);
  }, [calculationId, tags, persisted]);

  const registerCaseId = useCallback(
    (id: string | null | undefined) => {
      if (id && /^\d+$/.test(id)) {
        writeBoundCaseId(location.pathname, id);
        setRegisteredCaseId(id);
        return;
      }
      setRegisteredCaseId(null);
    },
    [location.pathname],
  );

  const beginNewCalculation = useCallback(() => {
    clearCalculationBinding(location.pathname, draftId);
    setRegisteredCaseId(null);
    setNotes([]);
    setTags([]);
  }, [draftId, location.pathname]);

  const addNote = useCallback(async () => {
    if (!persisted) {
      setNotes((prev) => [
        ...prev,
        {
          id: `draft-note-${Date.now()}`,
          calculationId,
          x: 150,
          y: 150,
          text: "",
        },
      ]);
      return;
    }
    try {
      const newNote = await apiClient<Note>(`/api/calculation/${calculationId}/notes`, {
        method: "POST",
        body: { x: 150, y: 150, text: "" },
      });
      setNotes((prev) => [...prev, newNote]);
    } catch {
      /* sessiz */
    }
  }, [calculationId, persisted]);

  const handleNoteTextChange = useCallback(
    async (noteId: string, text: string) => {
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, text } : n)));
      if (!persisted) return;
      try {
        await apiClient(`/api/calculation/${calculationId}/notes/${noteId}`, {
          method: "PUT",
          body: { text },
        });
      } catch {
        /* sessiz */
      }
    },
    [calculationId, persisted],
  );

  const handleNoteDragEnd = useCallback(
    async (noteId: string, x: number, y: number) => {
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, x, y } : n)));
      if (!persisted) return;
      try {
        await apiClient(`/api/calculation/${calculationId}/notes/${noteId}`, {
          method: "PUT",
          body: { x, y },
        });
      } catch {
        /* sessiz */
      }
    },
    [calculationId, persisted],
  );

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (!persisted) return;
      try {
        await apiClient(`/api/calculation/${calculationId}/notes/${noteId}`, { method: "DELETE" });
      } catch {
        /* sessiz */
      }
    },
    [calculationId, persisted],
  );

  const handleAddTag = useCallback(
    async (color: string, label: string) => {
      if (!persisted) {
        setTags((prev) => [
          ...prev,
          {
            id: `draft-tag-${Date.now()}`,
            calculationId,
            color,
            label,
          },
        ]);
        return;
      }
      try {
        const newTag = await apiClient<Tag>(`/api/calculation/${calculationId}/tags`, {
          method: "POST",
          body: { color, label },
        });
        setTags((prev) => [...prev, newTag]);
      } catch {
        /* sessiz */
      }
    },
    [calculationId, persisted],
  );

  const handleDeleteTag = useCallback(
    async (tagId: string) => {
      setTags((prev) => prev.filter((t) => t.id !== tagId));
      if (!persisted) return;
      try {
        await apiClient(`/api/calculation/${calculationId}/tags/${tagId}`, { method: "DELETE" });
      } catch {
        /* sessiz */
      }
    },
    [calculationId, persisted],
  );

  const value = useMemo(
    (): CalculationToolsContextValue => ({
      addNote,
      openTagModal: () => setShowTagModal(true),
      openInterestCalculator: () => setShowInterestModal(true),
      beginNewCalculation,
      registerCaseId,
    }),
    [addNote, beginNewCalculation, registerCaseId],
  );

  return (
    <CalculationToolsContext.Provider value={value}>
      {children}

      {tags.length > 0 ? (
        <div className={styles.tagBar}>
          {tags.map((tag) => (
            <span key={tag.id} className={styles.tagChip} style={{ backgroundColor: tag.color }}>
              {tag.label}
              <button
                type="button"
                className={styles.tagDelete}
                onClick={() => void handleDeleteTag(tag.id)}
                aria-label="Etiketi sil"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {notes.map((note) => (
        <DraggableNote
          key={note.id}
          id={note.id}
          x={note.x}
          y={note.y}
          text={note.text}
          onChange={handleNoteTextChange}
          onDragEnd={handleNoteDragEnd}
          onDelete={handleDeleteNote}
        />
      ))}

      <AddTagModal open={showTagModal} onClose={() => setShowTagModal(false)} onAdd={handleAddTag} />
      <PressDailyInterestModal open={showInterestModal} onClose={() => setShowInterestModal(false)} />
    </CalculationToolsContext.Provider>
  );
}

export function useCalculationTools(): CalculationToolsContextValue {
  const ctx = useContext(CalculationToolsContext);
  if (!ctx) {
    throw new Error("useCalculationTools must be used within CalculationToolsProvider");
  }
  return ctx;
}
