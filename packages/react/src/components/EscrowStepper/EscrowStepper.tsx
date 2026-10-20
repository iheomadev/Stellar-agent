import React, { KeyboardEvent } from 'react';
import styles from './EscrowStepper.module.css';

/**
 * A single step definition for the EscrowStepper.
 */
export interface EscrowStep {
  /** Short step label displayed below the step circle. */
  label: string;
  /** Optional longer description shown as a tooltip / aria-description. */
  description?: string;
}

/**
 * Props for the EscrowStepper component.
 */
export interface EscrowStepperProps {
  /**
   * Index of the currently active step (0-based).
   * Steps before this index are considered "completed".
   * @minimum 0
   * @maximum steps.length - 1
   */
  currentStep: number;
  /**
   * Ordered array of step definitions.
   * Defaults to the standard Bear Protocol escrow lifecycle if omitted.
   */
  steps?: EscrowStep[];
  /**
   * Called when the user clicks or keyboard-activates a step that has
   * already been completed (i.e. index < currentStep).
   * Useful for stepping back in wizards.
   */
  onStepClick?: (stepIndex: number) => void;
  /** Optional extra className applied to the root element. */
  className?: string;
}

/** Default Bear Protocol escrow lifecycle steps. */
const DEFAULT_STEPS: EscrowStep[] = [
  { label: 'Create',   description: 'Job created and posted' },
  { label: 'Fund',     description: 'Client locks USDC in escrow' },
  { label: 'Submit',   description: 'Provider delivers work' },
  { label: 'Evaluate', description: 'Evaluator reviews submission' },
  { label: 'Complete', description: 'Funds released to provider' },
];

/**
 * EscrowStepper visualises the five-stage lifecycle of a Bear Protocol
 * escrow job: Create → Fund → Submit → Evaluate → Complete.
 *
 * Steps are navigable by keyboard (← / → arrow keys) when `onStepClick`
 * is provided, and each step announces its state to assistive technology.
 *
 * @example
 * ```tsx
 * <EscrowStepper currentStep={2} onStepClick={(i) => setStep(i)} />
 * ```
 */
export const EscrowStepper: React.FC<EscrowStepperProps> = ({
  currentStep,
  steps = DEFAULT_STEPS,
  onStepClick,
  className,
}) => {
  const clampedCurrent = Math.max(0, Math.min(currentStep, steps.length - 1));

  const handleStepKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (index < clampedCurrent) onStepClick?.(index);
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIdx = Math.min(index + 1, steps.length - 1);
      (e.currentTarget.parentElement?.parentElement
        ?.querySelectorAll<HTMLButtonElement>('button')
        ?.[nextIdx])?.focus();
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIdx = Math.max(index - 1, 0);
      (e.currentTarget.parentElement?.parentElement
        ?.querySelectorAll<HTMLButtonElement>('button')
        ?.[prevIdx])?.focus();
    }
  };

  return (
    <nav
      className={[styles.stepper, className].filter(Boolean).join(' ')}
      aria-label="Escrow progress"
    >
      <ol className={styles.list} role="list">
        {steps.map((step, index) => {
          const isCompleted = index < clampedCurrent;
          const isActive = index === clampedCurrent;
          const isPending = index > clampedCurrent;
          const isClickable = isCompleted && !!onStepClick;

          const stepState = isCompleted
            ? 'completed'
            : isActive
            ? 'current'
            : 'pending';

          const stepClasses = [
            styles.step,
            isCompleted ? styles.completed : undefined,
            isActive ? styles.active : undefined,
            isPending ? styles.pending : undefined,
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li
              key={index}
              className={stepClasses}
              aria-current={isActive ? 'step' : undefined}
            >
              {/* Connector line before this step */}
              {index > 0 && (
                <div
                  className={[
                    styles.connector,
                    isCompleted || isActive ? styles.connectorFilled : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden="true"
                />
              )}

              <button
                type="button"
                className={styles.circle}
                onClick={() => isClickable && onStepClick?.(index)}
                onKeyDown={(e) => handleStepKeyDown(e, index)}
                disabled={!isClickable}
                aria-label={`Step ${index + 1}: ${step.label} — ${stepState}`}
                aria-describedby={
                  step.description ? `step-desc-${index}` : undefined
                }
                tabIndex={isActive || isClickable ? 0 : -1}
              >
                {isCompleted ? (
                  <span aria-hidden="true">✓</span>
                ) : (
                  <span aria-hidden="true">{index + 1}</span>
                )}
              </button>

              <span className={styles.label}>
                {step.label}
              </span>

              {step.description && (
                <span
                  id={`step-desc-${index}`}
                  className={styles.description}
                >
                  {step.description}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default EscrowStepper;
