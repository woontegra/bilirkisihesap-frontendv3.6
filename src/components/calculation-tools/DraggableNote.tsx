import { useEffect, useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";
import styles from "./calculationTools.module.css";

type Props = {
  id: string;
  x: number;
  y: number;
  text: string;
  onChange: (id: string, text: string) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
};

export function DraggableNote({ id, x, y, text, onChange, onDragEnd, onDelete }: Props) {
  const [pos, setPos] = useState({ x, y });
  const dragging = useRef(false);
  const offset = useRef({ dx: 0, dy: 0 });

  useEffect(() => {
    setPos({ x, y });
  }, [x, y]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    offset.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: ev.clientX - offset.current.dx, y: ev.clientY - offset.current.dy });
    };
    const onUp = (ev: MouseEvent) => {
      dragging.current = false;
      const nx = ev.clientX - offset.current.dx;
      const ny = ev.clientY - offset.current.dy;
      setPos({ x: nx, y: ny });
      onDragEnd(id, nx, ny);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className={styles.note} style={{ left: pos.x, top: pos.y }}>
      <div className={styles.noteHead} onMouseDown={onMouseDown}>
        <span className={styles.noteTitle}>
          <GripVertical size={12} />
          Not
        </span>
        <button type="button" className={styles.noteDelete} onClick={() => onDelete(id)} aria-label="Notu sil">
          <X size={12} />
        </button>
      </div>
      <textarea
        className={styles.noteBody}
        value={text}
        onChange={(e) => onChange(id, e.target.value)}
        placeholder="Notunuzu yazın…"
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
