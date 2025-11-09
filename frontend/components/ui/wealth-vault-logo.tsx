/**
 * Wealth Vault Logo Component
 */

import { Wallet } from 'lucide-react';

interface WealthVaultLogoProps {
  size?: number;
  className?: string;
}

export function WealthVaultLogo({
  size = 32,
  className = '',
}: WealthVaultLogoProps) {
  return (
    <Wallet
      className={`text-gray-700 dark:text-gray-300 ${className}`}
      size={size}
      strokeWidth={2.5}
    />
  );
}
