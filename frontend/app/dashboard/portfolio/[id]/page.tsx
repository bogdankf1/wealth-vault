'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  useGetPortfolioAssetQuery,
  useGetAssetTransactionsQuery,
  useBuyAssetMutation,
  useSellAssetMutation,
  useRecordDividendMutation,
  useRefreshPriceMutation,
  useDeletePortfolioAssetMutation,
  useUpdatePortfolioAssetMutation,
  PortfolioTransaction,
} from '@/lib/api/portfolioApi';
import { useGetAccountQuery } from '@/lib/api/savingsApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { PortfolioForm } from '@/components/portfolio/portfolio-form';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Archive,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Plus,
  Minus,
  DollarSign,
  Clock,
  Calendar,
  Wallet,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function PortfolioDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params.id as string;

  const t = useTranslations('portfolio.detail');
  const tTransactions = useTranslations('portfolio.transactions');
  const tActions = useTranslations('portfolio.actions');
  const tOverview = useTranslations('portfolio.overview');

  // State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBuyDialogOpen, setIsBuyDialogOpen] = useState(false);
  const [isSellDialogOpen, setIsSellDialogOpen] = useState(false);
  const [isDividendDialogOpen, setIsDividendDialogOpen] = useState(false);

  // Buy form state
  const [buyQuantity, setBuyQuantity] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyFees, setBuyFees] = useState('0');
  const [buyDate, setBuyDate] = useState(new Date().toISOString().split('T')[0]);
  const [buyNotes, setBuyNotes] = useState('');
  const [buyWithdrawFromAccount, setBuyWithdrawFromAccount] = useState(true);

  // Sell form state
  const [sellQuantity, setSellQuantity] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellFees, setSellFees] = useState('0');
  const [sellDate, setSellDate] = useState(new Date().toISOString().split('T')[0]);
  const [sellNotes, setSellNotes] = useState('');
  const [sellDepositToAccount, setSellDepositToAccount] = useState(true);

  // Dividend form state
  const [dividendAmount, setDividendAmount] = useState('');
  const [dividendDate, setDividendDate] = useState(new Date().toISOString().split('T')[0]);
  const [dividendNotes, setDividendNotes] = useState('');
  const [dividendDepositToAccount, setDividendDepositToAccount] = useState(true);

  // Queries
  const { data: asset, isLoading, error } = useGetPortfolioAssetQuery(assetId);
  const { data: transactionsData } = useGetAssetTransactionsQuery({ assetId, page_size: 50 });
  const transactions = transactionsData?.items || [];
  const { data: linkedAccount } = useGetAccountQuery(asset?.payment_account_id || '', {
    skip: !asset?.payment_account_id,
  });
  const { data: dividendAccount } = useGetAccountQuery(asset?.dividend_account_id || '', {
    skip: !asset?.dividend_account_id,
  });

  // Mutations
  const [buyAsset, { isLoading: isBuying }] = useBuyAssetMutation();
  const [sellAsset, { isLoading: isSelling }] = useSellAssetMutation();
  const [recordDividend, { isLoading: isRecordingDividend }] = useRecordDividendMutation();
  const [refreshPrice, { isLoading: isRefreshing }] = useRefreshPriceMutation();
  const [deleteAsset, { isLoading: isDeleting }] = useDeletePortfolioAssetMutation();
  const [updateAsset] = useUpdatePortfolioAssetMutation();

  // Handlers
  const handleBack = () => router.push('/dashboard/portfolio/overview');

  const handleRefreshPrice = async () => {
    try {
      await refreshPrice(assetId).unwrap();
      toast.success(t('priceRefreshed'));
    } catch {
      toast.error(t('priceRefreshError'));
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAsset(assetId).unwrap();
      toast.success(t('deleteSuccess'));
      router.push('/dashboard/portfolio/overview');
    } catch {
      toast.error(t('deleteError'));
    }
  };

  const handleArchive = async () => {
    try {
      await updateAsset({ id: assetId, data: { is_active: false } }).unwrap();
      toast.success(tOverview('archiveSuccess'));
      router.push('/dashboard/portfolio/overview');
    } catch {
      toast.error(tOverview('archiveError'));
    }
  };

  const handleBuy = async () => {
    try {
      await buyAsset({
        assetId,
        data: {
          quantity: parseFloat(buyQuantity),
          price_per_unit: parseFloat(buyPrice),
          fees: parseFloat(buyFees) || 0,
          transaction_date: `${buyDate}T00:00:00`,
          notes: buyNotes || undefined,
          withdraw_from_account: buyWithdrawFromAccount,
        },
      }).unwrap();
      toast.success(t('buySuccess'));
      setIsBuyDialogOpen(false);
      resetBuyForm();
    } catch (error: unknown) {
      // Check if it's an insufficient funds error
      const apiError = error as { data?: { detail?: { error_code?: string; account_name?: string; current_balance?: number; required_amount?: number; currency?: string } } };
      if (apiError?.data?.detail?.error_code === 'INSUFFICIENT_FUNDS') {
        const { account_name, current_balance, required_amount, currency } = apiError.data.detail;
        const formattedBalance = new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(current_balance || 0);
        const formattedAmount = new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(required_amount || 0);
        toast.error(t('insufficientFunds', { accountName: account_name || 'Unknown', balance: formattedBalance, amount: formattedAmount }));
      } else {
        toast.error(t('buyError'));
      }
    }
  };

  const handleSell = async () => {
    try {
      const result = await sellAsset({
        assetId,
        data: {
          quantity: parseFloat(sellQuantity),
          price_per_unit: parseFloat(sellPrice),
          fees: parseFloat(sellFees) || 0,
          transaction_date: `${sellDate}T00:00:00`,
          notes: sellNotes || undefined,
          deposit_to_account: sellDepositToAccount,
        },
      }).unwrap();

      const gainLoss = Number(result.realized_gain_loss);
      const gainLossMsg = result.is_gain
        ? t('realizedGain', { amount: gainLoss.toFixed(2) })
        : t('realizedLoss', { amount: Math.abs(gainLoss).toFixed(2) });
      toast.success(`${t('sellSuccess')} ${gainLossMsg}`);
      setIsSellDialogOpen(false);
      resetSellForm();
    } catch {
      toast.error(t('sellError'));
    }
  };

  const handleRecordDividend = async () => {
    try {
      await recordDividend({
        assetId,
        data: {
          amount: parseFloat(dividendAmount),
          payment_date: `${dividendDate}T00:00:00`,
          notes: dividendNotes || undefined,
          deposit_to_account: dividendDepositToAccount,
        },
      }).unwrap();
      toast.success(t('dividendSuccess'));
      setIsDividendDialogOpen(false);
      resetDividendForm();
    } catch {
      toast.error(t('dividendError'));
    }
  };

  const resetBuyForm = () => {
    setBuyQuantity('');
    setBuyPrice('');
    setBuyFees('0');
    setBuyDate(new Date().toISOString().split('T')[0]);
    setBuyNotes('');
    setBuyWithdrawFromAccount(true);
  };

  const resetSellForm = () => {
    setSellQuantity('');
    setSellPrice('');
    setSellFees('0');
    setSellDate(new Date().toISOString().split('T')[0]);
    setSellNotes('');
    setSellDepositToAccount(true);
  };

  const resetDividendForm = () => {
    setDividendAmount('');
    setDividendDate(new Date().toISOString().split('T')[0]);
    setDividendNotes('');
    setDividendDepositToAccount(true);
  };

  const getTransactionTypeIcon = (type: string) => {
    switch (type) {
      case 'buy': return <Plus className="h-4 w-4 text-green-600" />;
      case 'sell': return <Minus className="h-4 w-4 text-red-600" />;
      case 'dividend': return <DollarSign className="h-4 w-4 text-blue-600" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getTransactionTypeBadge = (type: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      buy: 'default',
      sell: 'destructive',
      dividend: 'secondary',
    };
    return <Badge variant={variants[type] || 'outline'}>{tTransactions(type)}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-3 lg:space-y-6">
        <div className="flex items-center gap-2 lg:gap-4">
          <Skeleton className="h-8 w-8 lg:h-10 lg:w-10" />
          <div className="space-y-1.5 lg:space-y-2">
            <Skeleton className="h-5 lg:h-6 w-48" />
            <Skeleton className="h-3 lg:h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:gap-3 lg:gap-4 lg:grid-cols-4">
          <Skeleton className="h-20 lg:h-32" />
          <Skeleton className="h-20 lg:h-32" />
          <Skeleton className="h-20 lg:h-32" />
          <Skeleton className="h-20 lg:h-32" />
        </div>
        <Skeleton className="h-48 lg:h-64" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="text-center py-8">
        <h1 className="text-lg md:text-2xl font-bold mb-4">{t('notFound')}</h1>
        <p className="text-muted-foreground mb-4">{t('notFoundDescription')}</p>
        <Button onClick={handleBack}>{t('backToPortfolio')}</Button>
      </div>
    );
  }

  const returnPercent = Number(asset.return_percentage) || 0;
  const isPositiveReturn = returnPercent >= 0;
  const progressPercent = Math.min(100, Math.max(0, ((asset.current_value || 0) / (asset.total_invested || 1)) * 100));

  return (
    <div className="space-y-3 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 lg:gap-4">
          <Button variant="ghost" size="icon" className="h-8 w-8 lg:h-10 lg:w-10" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 lg:h-5 lg:w-5" />
          </Button>
          <div>
            <h1 className="text-lg lg:text-2xl font-bold flex items-center gap-2">
              {asset.asset_name}
              {asset.symbol && <Badge variant="outline" className="text-[10px] lg:text-xs">{asset.symbol}</Badge>}
              {asset.ticker && asset.use_dynamic_pricing && (
                <Badge variant="secondary" className="text-[10px] lg:text-xs">{asset.ticker}</Badge>
              )}
            </h1>
            <p className="text-xs lg:text-sm text-muted-foreground">
              {asset.asset_type} • {asset.quantity} {t('shares')}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="lg:h-10 lg:px-4 lg:text-sm">
              {t('actions')}
              <ChevronDown className="ml-1.5 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setIsBuyDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('buy')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsSellDialogOpen(true)} disabled={Number(asset.quantity) <= 0}>
              <Minus className="h-4 w-4" />
              {t('sell')}
            </DropdownMenuItem>
            {asset.is_dividend_paying && (
              <DropdownMenuItem onClick={() => setIsDividendDialogOpen(true)}>
                <DollarSign className="h-4 w-4" />
                {t('recordDividend')}
              </DropdownMenuItem>
            )}
            {asset.ticker && asset.use_dynamic_pricing && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleRefreshPrice} disabled={isRefreshing}>
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {t('refreshPrice')}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
              <Edit className="h-4 w-4" />
              {tActions('edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleArchive}>
              <Archive className="h-4 w-4" />
              {tActions('archive')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4" />
              {tActions('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-2 md:gap-3 lg:gap-4 lg:grid-cols-4">
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium text-muted-foreground">{t('totalInvested')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">
              <CurrencyDisplay amount={asset.total_invested || 0} currency={asset.currency} showSymbol />
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground">@ <CurrencyDisplay amount={asset.purchase_price} currency={asset.currency} showSymbol /> {t('perShare')}</p>
          </CardContent>
        </Card>

        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium text-muted-foreground">{t('currentValue')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">
              <CurrencyDisplay amount={asset.current_value || 0} currency={asset.currency} showSymbol />
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground">@ <CurrencyDisplay amount={asset.current_price} currency={asset.currency} showSymbol /> {t('perShare')}</p>
          </CardContent>
        </Card>

        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium text-muted-foreground">{t('totalReturn')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className={`text-base sm:text-lg lg:text-2xl font-bold flex items-center gap-2 ${isPositiveReturn ? 'text-green-600' : 'text-red-600'}`}>
              {isPositiveReturn ? <TrendingUp className="h-4 w-4 lg:h-5 lg:w-5" /> : <TrendingDown className="h-4 w-4 lg:h-5 lg:w-5" />}
              <CurrencyDisplay amount={asset.total_return || 0} currency={asset.currency} showSymbol />
            </div>
            <p className={`text-[10px] lg:text-xs ${isPositiveReturn ? 'text-green-600' : 'text-red-600'}`}>
              {isPositiveReturn ? '+' : ''}{returnPercent.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium text-muted-foreground">{t('totalDividends')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">
              <CurrencyDisplay amount={asset.total_dividends_received || 0} currency={asset.currency} showSymbol />
            </div>
            {asset.is_dividend_paying && asset.dividend_yield && (
              <p className="text-[10px] lg:text-xs text-muted-foreground">{(Number(asset.dividend_yield) * 100).toFixed(2)}% {t('yield')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
        <CardHeader className="px-3 lg:px-6">
          <CardTitle className="text-sm lg:text-base">{t('investmentProgress')}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 lg:px-6 space-y-2 lg:space-y-4">
          <Progress value={progressPercent} className="h-3" />
          <div className="flex justify-between text-xs lg:text-sm">
            <span className="text-muted-foreground">{t('costBasis')}: <CurrencyDisplay amount={asset.cost_basis || asset.total_invested || 0} currency={asset.currency} showSymbol /></span>
            <span className={isPositiveReturn ? 'text-green-600' : 'text-red-600'}>
              {progressPercent.toFixed(1)}% {t('ofInvestment')}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Asset Details */}
      <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
        <CardHeader className="px-3 lg:px-6">
          <CardTitle className="text-sm lg:text-base">{t('assetDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 lg:px-6 grid gap-2 lg:gap-4 md:grid-cols-2">
          <div className="space-y-1.5 lg:space-y-2 text-xs lg:text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('purchaseDate')}</span>
              <span>{format(new Date(asset.purchase_date), 'PP')}</span>
            </div>
            {asset.description && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('description')}</span>
                <span className="text-right max-w-xs truncate">{asset.description}</span>
              </div>
            )}
            {asset.last_price_update && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('lastPriceUpdate')}</span>
                <span>{format(new Date(asset.last_price_update), 'PPp')}</span>
              </div>
            )}
            {asset.price_source && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('priceSource')}</span>
                <Badge variant="outline">{asset.price_source}</Badge>
              </div>
            )}
          </div>
          <div className="space-y-1.5 lg:space-y-2 text-xs lg:text-sm">
            {asset.is_dividend_paying && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('dividendFrequency')}</span>
                  <span>{asset.dividend_frequency || '-'}</span>
                </div>
                {asset.next_dividend_date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('nextDividend')}</span>
                    <span>{format(new Date(asset.next_dividend_date), 'PP')}</span>
                  </div>
                )}
                {asset.dividend_per_share && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('dividendPerShare')}</span>
                    <CurrencyDisplay amount={Number(asset.dividend_per_share)} currency={asset.currency} showSymbol />
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Linked Account Card */}
      <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
        <CardHeader className="px-3 lg:px-6">
          <CardTitle className="text-sm lg:text-base">{t('linkedAccount')}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 lg:px-6 space-y-2 lg:space-y-3">
          {linkedAccount ? (
            <>
              <div className="flex items-center gap-2 text-xs lg:text-sm">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{linkedAccount.name}</span>
                <Badge variant="outline" className="text-[10px] lg:text-xs">
                  <CurrencyDisplay
                    amount={linkedAccount.current_balance}
                    currency={linkedAccount.currency}
                    showSymbol
                  />
                </Badge>
              </div>
              <div className="flex justify-between text-xs lg:text-sm">
                <span className="text-muted-foreground">{t('autoTransact')}</span>
                <Badge variant={asset.auto_transact ? 'default' : 'secondary'} className="text-[10px] lg:text-xs">
                  {asset.auto_transact ? t('autoTransactEnabled') : t('autoTransactDisabled')}
                </Badge>
              </div>
            </>
          ) : (
            <p className="text-xs lg:text-sm text-muted-foreground">{t('noLinkedAccount')}</p>
          )}
        </CardContent>
      </Card>

      {/* Dividend Account Card */}
      {asset.is_dividend_paying && (
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6">
            <CardTitle className="text-sm lg:text-base">{t('dividendAccount')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 lg:px-6 space-y-2 lg:space-y-3">
            {dividendAccount ? (
              <>
                <div className="flex items-center gap-2 text-xs lg:text-sm">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{dividendAccount.name}</span>
                  <Badge variant="outline" className="text-[10px] lg:text-xs">
                    <CurrencyDisplay
                      amount={dividendAccount.current_balance}
                      currency={dividendAccount.currency}
                      showSymbol
                    />
                  </Badge>
                </div>
                <div className="flex justify-between text-xs lg:text-sm">
                  <span className="text-muted-foreground">{t('autoDepositDividends')}</span>
                  <Badge variant={asset.auto_deposit_dividends ? 'default' : 'secondary'} className="text-[10px] lg:text-xs">
                    {asset.auto_deposit_dividends ? t('enabled') : t('disabled')}
                  </Badge>
                </div>
              </>
            ) : (
              <p className="text-xs lg:text-sm text-muted-foreground">{t('noDividendAccount')}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Transaction History */}
      <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
        <CardHeader className="px-3 lg:px-6">
          <CardTitle className="text-sm lg:text-base">{tTransactions('title')}</CardTitle>
          <CardDescription className="text-xs lg:text-sm">{tTransactions('description')}</CardDescription>
        </CardHeader>
        <CardContent className="px-3 lg:px-6">
          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 lg:py-8">{tTransactions('noTransactions')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tTransactions('type')}</TableHead>
                  <TableHead>{tTransactions('date')}</TableHead>
                  <TableHead className="text-right">{tTransactions('quantity')}</TableHead>
                  <TableHead className="text-right">{tTransactions('price')}</TableHead>
                  <TableHead className="text-right">{tTransactions('total')}</TableHead>
                  <TableHead>{tTransactions('notes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx: PortfolioTransaction) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTransactionTypeIcon(tx.type)}
                        {getTransactionTypeBadge(tx.type)}
                      </div>
                    </TableCell>
                    <TableCell>{format(new Date(tx.transaction_date), 'PP')}</TableCell>
                    <TableCell className="text-right">{Number(tx.quantity).toFixed(4)}</TableCell>
                    <TableCell className="text-right">
                      <CurrencyDisplay amount={tx.price_per_unit} currency={tx.currency} showSymbol />
                    </TableCell>
                    <TableCell className="text-right">
                      <CurrencyDisplay amount={tx.total_amount} currency={tx.currency} showSymbol />
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{tx.notes || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <PortfolioForm
        assetId={assetId}
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
      />

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tActions('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground">
              {isDeleting ? t('deleting') : tActions('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Buy Dialog */}
      <Dialog open={isBuyDialogOpen} onOpenChange={setIsBuyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('buyTitle')}</DialogTitle>
            <DialogDescription>{t('buyDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>{t('quantity')}</Label>
                <Input type="number" step="0.00000001" value={buyQuantity} onChange={(e) => setBuyQuantity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('pricePerShare')}</Label>
                <Input type="number" step="0.01" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>{t('fees')}</Label>
                <Input type="number" step="0.01" value={buyFees} onChange={(e) => setBuyFees(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('date')}</Label>
                <Input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea value={buyNotes} onChange={(e) => setBuyNotes(e.target.value)} />
            </div>
            {asset.payment_account_id && (
              <div className="flex items-center justify-between">
                <Label>{t('withdrawFromAccount')}</Label>
                <Switch checked={buyWithdrawFromAccount} onCheckedChange={setBuyWithdrawFromAccount} />
              </div>
            )}
            {buyQuantity && buyPrice && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm">{t('totalCost')}: <CurrencyDisplay amount={(parseFloat(buyQuantity) || 0) * (parseFloat(buyPrice) || 0) + (parseFloat(buyFees) || 0)} currency={asset.currency} showSymbol /></p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBuyDialogOpen(false)}>{tActions('cancel')}</Button>
            <Button onClick={handleBuy} disabled={isBuying || !buyQuantity || !buyPrice}>
              {isBuying ? t('processing') : t('confirmBuy')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sell Dialog */}
      <Dialog open={isSellDialogOpen} onOpenChange={setIsSellDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sellTitle')}</DialogTitle>
            <DialogDescription>{t('sellDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('availableShares')}: {Number(asset.quantity).toFixed(4)}</p>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>{t('quantity')}</Label>
                <Input type="number" step="0.00000001" max={asset.quantity} value={sellQuantity} onChange={(e) => setSellQuantity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('pricePerShare')}</Label>
                <Input type="number" step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>{t('fees')}</Label>
                <Input type="number" step="0.01" value={sellFees} onChange={(e) => setSellFees(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('date')}</Label>
                <Input type="date" value={sellDate} onChange={(e) => setSellDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea value={sellNotes} onChange={(e) => setSellNotes(e.target.value)} />
            </div>
            {asset.payment_account_id && (
              <div className="flex items-center justify-between">
                <Label>{t('depositToAccount')}</Label>
                <Switch checked={sellDepositToAccount} onCheckedChange={setSellDepositToAccount} />
              </div>
            )}
            {sellQuantity && sellPrice && (
              <div className="p-3 bg-muted rounded-lg space-y-1">
                <p className="text-sm">{t('proceeds')}: <CurrencyDisplay amount={(parseFloat(sellQuantity) || 0) * (parseFloat(sellPrice) || 0) - (parseFloat(sellFees) || 0)} currency={asset.currency} showSymbol /></p>
                <p className="text-sm">{t('costBasis')}: <CurrencyDisplay amount={(parseFloat(sellQuantity) || 0) * asset.purchase_price} currency={asset.currency} showSymbol /></p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSellDialogOpen(false)}>{tActions('cancel')}</Button>
            <Button onClick={handleSell} disabled={isSelling || !sellQuantity || !sellPrice || parseFloat(sellQuantity) > Number(asset.quantity)} variant="destructive">
              {isSelling ? t('processing') : t('confirmSell')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dividend Dialog */}
      <Dialog open={isDividendDialogOpen} onOpenChange={setIsDividendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dividendTitle')}</DialogTitle>
            <DialogDescription>{t('dividendDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>{t('amount')}</Label>
                <Input type="number" step="0.01" value={dividendAmount} onChange={(e) => setDividendAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('date')}</Label>
                <Input type="date" value={dividendDate} onChange={(e) => setDividendDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea value={dividendNotes} onChange={(e) => setDividendNotes(e.target.value)} />
            </div>
            {asset.dividend_account_id && (
              <div className="flex items-center justify-between">
                <Label>{t('depositToAccount')}</Label>
                <Switch checked={dividendDepositToAccount} onCheckedChange={setDividendDepositToAccount} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDividendDialogOpen(false)}>{tActions('cancel')}</Button>
            <Button onClick={handleRecordDividend} disabled={isRecordingDividend || !dividendAmount}>
              {isRecordingDividend ? t('processing') : t('confirmDividend')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
