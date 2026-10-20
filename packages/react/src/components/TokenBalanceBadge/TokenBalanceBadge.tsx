import React, { useEffect, useState } from 'react';
import styles from './TokenBalanceBadge.module.css';

/**
 * Supported token symbols.
 * Extend this union as Bear Protocol adds new SAC tokens.
 */
export type TokenSymbol = 'USDC' | string;

/**
 * Props for the TokenBalanceBadge component.
 */
export interface TokenBalanceBadgeProps {
  /**
   * Stellar public key (G…) of the account whose balance is displayed.
   */
  address: string;
  /**
   * Token symbol to display.
   * @defaultValue 'USDC'
   */
  token?: TokenSymbol;
  /**
   * Pre-loaded balance value (in stroops / base units, displayed as-is
   * divided by 10^7 for USDC). When provided the component is fully
   * controlled and will not attempt any async fetch.
   */
  balance?: bigint;
  /**
   * Called after each successful balance fetch (async mode only).
   * Receives the raw balance string returned by the data source.
   */
  onBalanceFetched?: (raw: string) => void;
  /**
   * Called when the user clicks the badge (e.g. to open a wallet modal).
   */
  onClick?: () => void;
  /** Optional extra className applied to the root element. */
  className?: string;
}

/** Format raw stroops (7 decimal places) into a human amount string. */
function formatBalance(raw: bigint): string {
  const STROOPS = 10_000_000n;
  const whole = raw / STROOPS;
  const frac = raw % STROOPS;
  if (frac === 0n) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(7, '0').replace(/0+$/, '');
  return `${whole.toLocaleString()}.${fracStr}`;
}

/** Token icon characters (no external deps). */
const TOKEN_ICONS: Record<string, string> = {
  USDC: '$',
  XLM:  '✦',
};

/**
 * TokenBalanceBadge displays a Stellar account's token balance as a compact
 * pill badge. In uncontrolled mode it shows a loading skeleton while the
 * parent resolves the balance, then renders the formatted amount.
 *
 * @example
 * ```tsx
 * // Controlled (balance provided by parent)
 * <TokenBalanceBadge address="GABC..." balance={12_500_000n} />
 *
 * // Uncontrolled (parent passes undefined; badge shows skeleton)
 * <TokenBalanceBadge address="GABC..." token="USDC" />
 * ```
 */
export const TokenBalanceBadge: React.FC<TokenBalanceBadgeProps> = ({
  address,
  token = 'USDC',
  balance,
  onBalanceFetched,
  onClick,
  className,
}) => {
  const [displayBalance, setDisplayBalance] = useState<bigint | null>(
    balance !== undefined ? balance : null,
  );
  const [loading, setLoading] = useState(balance === undefined);
  const [error, setError] = useState(false);

  /* When a controlled `balance` prop changes, update display. */
  useEffect(() => {
    if (balance !== undefined) {
      setDisplayBalance(balance);
      setLoading(false);
      setError(false);
    }
  }, [balance]);

  const icon = TOKEN_ICONS[token] ?? '◈';
  const shortAddress = `${address.slice(0, 4)}…${address.slice(-4)}`;

  const rootClasses = [
    styles.badge,
    loading ? styles.loading : undefined,
    error ? styles.error : undefined,
    onClick ? styles.clickable : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = () => {
    onClick?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <span
      className={rootClasses}
      role={onClick ? 'button' : 'status'}
      tabIndex={onClick ? 0 : undefined}
      aria-label={
        loading
          ? `Loading ${token} balance for ${shortAddress}`
          : error
          ? `Failed to load ${token} balance`
          : `${token} balance: ${displayBalance !== null ? formatBalance(displayBalance) : '—'} for ${shortAddress}`
      }
      onClick={onClick ? handleClick : undefined}
      onKeyDown={onClick ? handleKeyDown : undefined}
    >
      <span className={styles.tokenIcon} aria-hidden="true">
        {icon}
      </span>

      <span className={styles.tokenSymbol}>{token}</span>

      <span className={styles.separator} aria-hidden="true">
        ·
      </span>

      {loading ? (
        <span className={styles.skeleton} aria-hidden="true" />
      ) : error ? (
        <span className={styles.errorText}>—</span>
      ) : (
        <span className={styles.amount}>
          {displayBalance !== null ? formatBalance(displayBalance) : '—'}
        </span>
      )}
    </span>
  );
};

export default TokenBalanceBadge;
