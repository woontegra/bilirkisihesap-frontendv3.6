import { useCallback, useState } from "react";
import { markAutoWelcomeSeen } from "./storage";

export function useGuidedTourController() {
  const [active, setActive] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [resumeStepIndex, setResumeStepIndex] = useState(0);

  /** Manuel “Nasıl kullanılır?” — global welcome’tan bağımsız; karşılama açıksa daveti görüldü say. */
  const openTour = useCallback((stepIndex = 0) => {
    setWelcomeOpen((wasOpen) => {
      if (wasOpen) markAutoWelcomeSeen();
      return false;
    });
    setResumeStepIndex(stepIndex);
    setActive(true);
  }, []);

  const openWelcome = useCallback(() => setWelcomeOpen(true), []);

  const completeTour = useCallback(() => {
    setActive(false);
  }, []);

  return {
    active,
    setActive,
    welcomeOpen,
    setWelcomeOpen,
    resumeStepIndex,
    openTour,
    openWelcome,
    completeTour,
  };
}
