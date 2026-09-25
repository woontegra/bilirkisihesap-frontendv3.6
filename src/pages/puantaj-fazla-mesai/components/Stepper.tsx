import { Fragment } from "react";
import { Check } from "lucide-react";
import type { WizardStep } from "../model";
import { WIZARD_STEPS } from "../model";
import styles from "../PuantajFmPage.module.css";

type Props = {
  current: WizardStep;
  maxReached: number;
  onSelect: (step: WizardStep, index: number) => void;
};

export default function Stepper({ current, maxReached, onSelect }: Props) {
  const currentIndex = WIZARD_STEPS.findIndex((s) => s.key === current);
  return (
    <nav className={styles.stepper} aria-label="İlerleme">
      {WIZARD_STEPS.map((step, index) => {
        const isActive = step.key === current;
        const isDone = index < currentIndex;
        const reachable = index <= maxReached;
        return (
          <Fragment key={step.key}>
            {index > 0 && <span className={styles.stepSep} aria-hidden />}
            <button
              type="button"
              className={`${styles.step} ${isActive ? styles.stepActive : ""} ${isDone ? styles.stepDone : ""}`}
              onClick={() => reachable && onSelect(step.key, index)}
              disabled={!reachable}
              aria-current={isActive ? "step" : undefined}
            >
              <span className={styles.stepIndex}>
                {isDone ? <Check size={13} strokeWidth={3} /> : index + 1}
              </span>
              {step.label}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
