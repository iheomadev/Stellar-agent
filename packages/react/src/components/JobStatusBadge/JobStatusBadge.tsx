import React from 'react';
import styles from './JobStatusBadge.module.css';

/**
 * Possible states of an escrow job on the Bear Protocol.
 */
export type JobStatus =
  | 'Open'
  | 'Funded'
  | 'Submitted'
  | 'Completed'
  | 'Rejected'
  | 'Cancelled';

/**
 * Props for the JobStatusBadge component.
 */
export interface JobStatusBadgeProps {
  /**
   * Current status of the job.
   * Maps to a unique color and icon.
   */
  status: JobStatus;
  /**
   * When true, renders a subtle pulse animation for active states
   * (Open, Funded, Submitted).
   * @defaultValue false
   */
  animated?: boolean;
  /** Optional extra className for the badge root element. */
  className?: string;
}

/** Human-readable labels and icons per status. */
const STATUS_META: Record<JobStatus, { label: string; icon: string }> = {
  Open:      { label: 'Open',      icon: '◎' },
  Funded:    { label: 'Funded',    icon: '◉' },
  Submitted: { label: 'Submitted', icon: '⏳' },
  Completed: { label: 'Completed', icon: '✓'  },
  Rejected:  { label: 'Rejected',  icon: '✕'  },
  Cancelled: { label: 'Cancelled', icon: '⊘'  },
};

/** Statuses that show the pulse animation when `animated` is true. */
const ACTIVE_STATUSES: Set<JobStatus> = new Set(['Open', 'Funded', 'Submitted']);

/**
 * JobStatusBadge renders a pill badge representing the current lifecycle
 * state of a Bear Protocol escrow job.
 *
 * Colors are driven by CSS custom properties so they respect the active theme.
 * Active states (Open, Funded, Submitted) can optionally pulse.
 *
 * @example
 * ```tsx
 * <JobStatusBadge status="Funded" animated />
 * ```
 */
export const JobStatusBadge: React.FC<JobStatusBadgeProps> = ({
  status,
  animated = false,
  className,
}) => {
  const { label, icon } = STATUS_META[status];
  const isActive = ACTIVE_STATUSES.has(status);
  const showPulse = animated && isActive;

  const badgeClasses = [
    styles.badge,
    styles[`status${status}`],
    showPulse ? styles.pulse : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={badgeClasses}
      role="status"
      aria-label={`Job status: ${label}`}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.label}>{label}</span>
    </span>
  );
};

export default JobStatusBadge;
