import type { ReactNode } from "react";

export type GuidedTourContext = {
  getTargetEl: (target: string) => HTMLElement | null;
};

/**
 * auto — form doldurulunca gecikmeli ilerler; gereksiz “İleri” yok
 * manual — kullanıcı İleri / Atla ile ilerler (İhbar vb.)
 * optional — isteğe bağlı; “Ek ödemem yok” / “Ek ödemeleri tamamladım”
 * finish — son adım; “Kılavuzu tamamla”
 */
export type GuidedTourStepMode = "auto" | "manual" | "optional" | "finish";

export type GuidedTourAutoAdvance = {
  /** Adım tamamlandığında true. */
  isReady: () => boolean;
  /** Son geçerli durumdan sonra bekleme (ms). Varsayılan 500. */
  delayMs?: number;
};

/** Stable DOM target: element must have matching `data-tour` attribute. */
export type GuidedTourStep = {
  id: string;
  /** Matches `[data-tour="<target>"]` on the page. */
  target: string;
  title: string;
  body: string;
  mode?: GuidedTourStepMode;
  /** auto adımlarda atlama izni (Atla). */
  skippable?: boolean;
  autoAdvance?: GuidedTourAutoAdvance;
  /** Hide step when false (conditional UI). */
  when?: (ctx: GuidedTourContext) => boolean;
  placement?: "auto" | "top" | "bottom" | "left" | "right";
  /** Scroll behaviour when entering the step. */
  scroll?: "center" | "nearest" | "none";
  /**
   * optional mode button labels.
   * Defaults preserve İş Kanunu ek ödeme metinleri.
   */
  optionalSkipLabel?: string;
  optionalConfirmLabel?: string;
  /** When true, only confirm + back + close are shown (no skip). */
  optionalHideSkip?: boolean;
  /**
   * optional mode: if provided and returns false, confirm does not advance.
   * Used for required optional-like steps (e.g. tanık beyanı).
   */
  optionalConfirmReady?: () => boolean;
  /** Shown in the bubble when optionalConfirmReady fails. */
  optionalConfirmBlockedHint?: string;
  /**
   * manual mode: hint shown when İleri is pressed but autoAdvance.isReady is false.
   * When autoAdvance is set, İleri uses the same readiness check as auto-advance.
   */
  advanceBlockedHint?: string;
};

export type GuidedTourDefinition = {
  id: string;
  version: number;
  steps: GuidedTourStep[];
};

export type GuidedTourPrefs = {
  version: number;
  neverShowWelcome: boolean;
};

export type GuidedTourRenderProps = {
  definition: GuidedTourDefinition;
  context?: Record<string, unknown>;
  welcomeTitle: string;
  welcomeBody: string;
  howToUseLabel?: string;
  howToUseIcon?: ReactNode;
};
