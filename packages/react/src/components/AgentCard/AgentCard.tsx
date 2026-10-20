import React, { KeyboardEvent } from 'react';
import styles from './AgentCard.module.css';

/**
 * Represents an on-chain AI agent identity.
 */
export interface Agent {
  /** On-chain numeric identifier for the agent. */
  id: bigint;
  /** Stellar public key of the agent owner. */
  owner: string;
  /** Metadata URI (e.g. IPFS link to agent JSON). */
  uri: string;
  /** Human-readable display name. */
  name?: string;
  /** Short description of what the agent does. */
  description?: string;
  /** Capability or category tags. */
  tags?: string[];
  /** Reputation score (0–100). */
  reputationScore?: number;
}

/**
 * Props for the AgentCard component.
 */
export interface AgentCardProps {
  /** The agent identity data to display. */
  agent: Agent;
  /**
   * Called when the user clicks "Hire" or presses Enter/Space on the hire button.
   * Receives the agent's on-chain id.
   */
  onHire?: (agentId: bigint) => void;
  /** Optional additional className applied to the root element. */
  className?: string;
}

/**
 * AgentCard displays a single AI agent's identity card with name, description,
 * tags, reputation score, and a "Hire" call-to-action.
 *
 * @example
 * ```tsx
 * <AgentCard
 *   agent={{ id: 1n, owner: 'G...', uri: 'ipfs://...', name: 'DataBot' }}
 *   onHire={(id) => console.log('Hiring agent', id)}
 * />
 * ```
 */
export const AgentCard: React.FC<AgentCardProps> = ({ agent, onHire, className }) => {
  const {
    id,
    owner,
    uri,
    name,
    description,
    tags = [],
    reputationScore,
  } = agent;

  const handleHire = () => {
    onHire?.(id);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleHire();
    }
  };

  const scoreLabel =
    reputationScore !== undefined
      ? `Reputation: ${reputationScore}/100`
      : undefined;

  return (
    <article
      className={[styles.card, className].filter(Boolean).join(' ')}
      aria-label={name ? `Agent: ${name}` : `Agent #${id.toString()}`}
    >
      <header className={styles.header}>
        <div className={styles.avatar} aria-hidden="true">
          {name ? name[0].toUpperCase() : '#'}
        </div>
        <div className={styles.titleBlock}>
          <h3 className={styles.name}>
            {name ?? `Agent #${id.toString()}`}
          </h3>
          <span className={styles.owner} title={owner}>
            {owner.slice(0, 6)}…{owner.slice(-4)}
          </span>
        </div>
        {reputationScore !== undefined && (
          <div
            className={styles.score}
            aria-label={scoreLabel}
            title={scoreLabel}
          >
            <span className={styles.scoreValue}>{reputationScore}</span>
            <span className={styles.scoreLabel}>/ 100</span>
          </div>
        )}
      </header>

      {description && (
        <p className={styles.description}>{description}</p>
      )}

      {tags.length > 0 && (
        <ul className={styles.tags} aria-label="Agent capabilities">
          {tags.map((tag) => (
            <li key={tag} className={styles.tag}>
              {tag}
            </li>
          ))}
        </ul>
      )}

      <footer className={styles.footer}>
        <a
          href={uri}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.metaLink}
          aria-label="View agent metadata"
        >
          Metadata ↗
        </a>
        {onHire && (
          <button
            type="button"
            className={styles.hireButton}
            onClick={handleHire}
            onKeyDown={handleKeyDown}
            aria-label={`Hire agent ${name ?? id.toString()}`}
          >
            Hire
          </button>
        )}
      </footer>
    </article>
  );
};

export default AgentCard;
