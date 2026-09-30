import { type FormEvent, type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Fingerprint,
  Gem,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import {
  getGetResaleQueueQueryKey,
  getGetTelegramAuthStatusQueryKey,
  getHealthCheckQueryKey,
  useConfirmResaleGiftPurchase,
  useGetResaleQueue,
  useGetTelegramAuthStatus,
  useHealthCheck,
  usePreflightResaleGift,
  useSendTelegramAuthCode,
  useVerifyTelegramAuthCode,
  useVerifyTelegramAuthPassword,
} from '@workspace/api-client-react';
import type { ResaleGift } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'The request could not be completed. Try again.';
}

function stars(value: number | null | undefined) {
  return value === null || value === undefined ? null : value.toLocaleString();
}

function GiftIdentity({ gift }: { gift: { title: string; uniqueNumber: number } }) {
  return (
    <div className="gift-identity" aria-hidden="true">
      <div className="identity-orbit identity-orbit-a" />
      <div className="identity-orbit identity-orbit-b" />
      <div className="identity-center">
        <Gem size={39} strokeWidth={1.25} />
      </div>
      <span className="identity-caption">TG / {gift.uniqueNumber}</span>
    </div>
  );
}

function StatusPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

function AuthPanel({
  authorized,
  configured,
  pending,
  needsPassword,
  phoneNumber,
  message,
  loading,
  queryError,
  onRetry,
}: {
  authorized: boolean;
  configured: boolean;
  pending: boolean;
  needsPassword: boolean;
  phoneNumber: string | null;
  message: string;
  loading: boolean;
  queryError: unknown;
  onRetry: () => void;
}) {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState(phoneNumber ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [reportedPasswordStep, setReportedPasswordStep] = useState(false);
  const [authResultMessage, setAuthResultMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const sendCode = useSendTelegramAuthCode();
  const verifyCode = useVerifyTelegramAuthCode();
  const verifyPassword = useVerifyTelegramAuthPassword();

  const passwordStep = needsPassword || reportedPasswordStep;
  const codeStep = pending || !!authResultMessage || passwordStep;
  const waitingForCode = codeStep && !passwordStep && !authorized;

  function refreshAuthState() {
    void queryClient.invalidateQueries({ queryKey: getGetTelegramAuthStatusQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetResaleQueueQueryKey({ refresh: true }) });
  }

  function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError('');
    sendCode.mutate(
      { data: { phoneNumber: phone.trim() } },
      {
        onSuccess: (result) => {
          setAuthResultMessage(result.message);
          setReportedPasswordStep(result.status === 'password_required');
          setCode('');
          refreshAuthState();
        },
        onError: (error) => setActionError(getErrorMessage(error)),
      },
    );
  }

  function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError('');
    verifyCode.mutate(
      { data: { code: code.trim() } },
      {
        onSuccess: (result) => {
          setAuthResultMessage(result.message);
          setReportedPasswordStep(result.status === 'password_required');
          setCode('');
          refreshAuthState();
        },
        onError: (error) => setActionError(getErrorMessage(error)),
      },
    );
  }

  function handleVerifyPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError('');
    verifyPassword.mutate(
      { data: { password } },
      {
        onSuccess: (result) => {
          setAuthResultMessage(result.message);
          setPassword('');
          setReportedPasswordStep(result.status === 'password_required');
          refreshAuthState();
        },
        onError: (error) => setActionError(getErrorMessage(error)),
      },
    );
  }

  const busy = sendCode.isPending || verifyCode.isPending || verifyPassword.isPending;

  return (
    <section className="panel auth-panel enter" aria-labelledby="auth-heading">
      <div className="panel-kicker">
        <span className="kicker-index">01</span>
        <span>ACCOUNT AUTHORIZATION</span>
        <span className="kicker-line" />
        {authorized ? (
          <StatusPill tone="good"><Check size={12} /> Connected</StatusPill>
        ) : (
          <StatusPill tone={configured ? 'neutral' : 'warn'}>
            {loading ? 'Checking' : configured ? 'Not connected' : 'Setup required'}
          </StatusPill>
        )}
      </div>

      <div className="auth-heading-row">
        <div>
          <h2 id="auth-heading">{authorized ? 'Telegram is ready.' : 'Connect your account.'}</h2>
          <p className="panel-intro">
            {authorized
              ? 'Your encrypted session is held server-side. No session string is shown here.'
              : 'Authorize the Telegram user account used to discover live resale listings.'}
          </p>
        </div>
        <div className={`auth-mark ${authorized ? 'auth-mark-ready' : ''}`}>
          {authorized ? <ShieldCheck size={22} /> : <LockKeyhole size={21} />}
        </div>
      </div>

      {queryError ? (
        <div className="state-box state-error" role="alert" data-testid="status-auth-error">
          <CircleAlert size={17} />
          <div className="state-copy">
            <strong>Authorization status unavailable</strong>
            <span>{getErrorMessage(queryError)}</span>
          </div>
          <button className="button button-outline button-small" onClick={onRetry} data-testid="button-retry-auth">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : null}

      {!queryError && !loading && !configured && !authorized ? (
        <div className="state-box state-warn" role="status" data-testid="status-auth-not-configured">
          <CircleAlert size={17} />
          <div className="state-copy">
            <strong>Telegram authorization is not configured</strong>
            <span>{message}</span>
          </div>
        </div>
      ) : null}

      {!queryError && authorized ? (
        <div className="connected-card" data-testid="status-telegram-authorized">
          <div className="connected-icon"><CheckCircle2 size={19} /></div>
          <div className="connected-copy">
            <strong>Authorized Telegram account</strong>
            <span>{phoneNumber || message}</span>
          </div>
          <span className="connected-lock"><LockKeyhole size={13} /> Encrypted on server</span>
        </div>
      ) : null}

      {!queryError && !authorized && configured ? (
        <>
          {waitingForCode ? (
            <form className="auth-form" onSubmit={handleVerifyCode}>
              <label className="field-label" htmlFor="telegram-code">Telegram login code</label>
              <div className="field-wrap code-wrap">
                <KeyRound size={17} />
                <input
                  id="telegram-code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Enter the code from Telegram"
                  required
                  maxLength={32}
                  data-testid="input-telegram-code"
                />
              </div>
              <p className="field-hint"><Clock3 size={13} /> {authResultMessage || message}</p>
              <button className="button button-primary auth-submit" type="submit" disabled={busy} data-testid="button-verify-code">
                {verifyCode.isPending ? <LoaderCircle className="spin" size={16} /> : null}
                Verify code <ArrowRight size={16} />
              </button>
            </form>
          ) : passwordStep ? (
            <form className="auth-form" onSubmit={handleVerifyPassword}>
              <div className="password-note">
                <Fingerprint size={17} />
                <span>Telegram reports that this account requires a 2-step verification password.</span>
              </div>
              <label className="field-label" htmlFor="telegram-password">Telegram 2-step verification password</label>
              <div className="field-wrap">
                <LockKeyhole size={17} />
                <input
                  id="telegram-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your Telegram password"
                  required
                  maxLength={256}
                  data-testid="input-telegram-password"
                />
              </div>
              <p className="field-hint">{authResultMessage || message}</p>
              <button className="button button-primary auth-submit" type="submit" disabled={busy} data-testid="button-verify-password">
                {verifyPassword.isPending ? <LoaderCircle className="spin" size={16} /> : null}
                Verify password <ArrowRight size={16} />
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleSendCode}>
              <label className="field-label" htmlFor="telegram-phone">Phone number</label>
              <div className="field-wrap">
                <span className="field-prefix">+</span>
                <input
                  id="telegram-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Country code and number"
                  required
                  minLength={5}
                  maxLength={32}
                  data-testid="input-telegram-phone"
                />
              </div>
              <p className="field-hint"><LockKeyhole size={13} /> Code is requested directly from Telegram.</p>
              <button className="button button-primary auth-submit" type="submit" disabled={busy} data-testid="button-send-code">
                {sendCode.isPending ? <LoaderCircle className="spin" size={16} /> : null}
                Send code <ArrowRight size={16} />
              </button>
            </form>
          )}
          {actionError ? (
            <div className="inline-error" role="alert" data-testid="status-auth-action-error">
              <CircleAlert size={15} /> <span>{actionError}</span>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="security-footnote">
        <ShieldCheck size={15} />
        <span>Only the account authorization is stored. Never share your login code or password.</span>
      </div>
    </section>
  );
}

function GiftCard({ gift }: { gift: ResaleGift }) {
  return (
    <article className="gift-card" data-testid={`card-resale-gift-${gift.giftId}`}>
      <GiftIdentity gift={gift} />
      <div className="gift-details">
        <div className="gift-overline">LIVE TELEGRAM RESALE LISTING</div>
        <h3 data-testid="text-gift-title">{gift.title}</h3>
        <p className="gift-number">Unique number <b>#{gift.uniqueNumber.toLocaleString()}</b></p>
        <div className="gift-price-row">
          <div className="price-block">
            <span>Listing price</span>
            <strong data-testid="text-gift-price">{stars(gift.priceStars)} <small>Stars</small></strong>
          </div>
          <div className="price-divider" />
          <div className="price-block">
            <span>Transfer fee</span>
            <strong data-testid="text-transfer-fee">
              {gift.transferFeeStars === null ? 'Not listed' : <>{stars(gift.transferFeeStars)} <small>Stars</small></>}
            </strong>
          </div>
        </div>
        {gift.attributes.length > 0 ? (
          <div className="attribute-list" data-testid="list-gift-attributes">
            {gift.attributes.map((attribute, index) => (
              <div className="attribute" key={`${attribute.name}-${index}`}>
                <span>{attribute.name}</span>
                <strong>{attribute.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
        {gift.restrictions.length > 0 ? (
          <div className="restriction-list" data-testid="list-gift-restrictions">
            <span className="restriction-label">Restrictions reported</span>
            {gift.restrictions.map((restriction, index) => <p key={`${restriction}-${index}`}>{restriction}</p>)}
          </div>
        ) : null}
        <p className="gift-slug">Listing slug <code>{gift.slug}</code></p>
      </div>
    </article>
  );
}

function ResalePanel({ authorized }: { authorized: boolean }) {
  const queryClient = useQueryClient();
  const queueParams = { refresh: true };
  const queueQueryKey = getGetResaleQueueQueryKey(queueParams);
  const { data: queue, isLoading, isError, error, refetch } = useGetResaleQueue(queueParams, {
    query: { enabled: authorized, queryKey: queueQueryKey },
  });
  const preflightMutation = usePreflightResaleGift();
  const purchaseMutation = useConfirmResaleGiftPurchase();
  const [preflight, setPreflight] = useState<NonNullable<typeof preflightMutation.data> | null>(null);
  const [purchaseResult, setPurchaseResult] = useState<NonNullable<typeof purchaseMutation.data> | null>(null);
  const [confirmedIntent, setConfirmedIntent] = useState(false);
  const [actionError, setActionError] = useState('');

  const activeGift = purchaseResult?.success
    ? purchaseResult.nextGift
    : queue?.currentGift ?? null;
  const count = purchaseResult?.success ? purchaseResult.completedCount : queue?.completedCount;
  const requestedCount = purchaseResult?.success ? purchaseResult.requestedCount : queue?.requestedCount;
  const listingsAvailable = queue?.availableCount ?? 0;
  const insufficientBalance = !!(
    preflight?.botBalanceVerified &&
    preflight.totalStars !== null &&
    preflight.botBalanceStars !== null &&
    preflight.botBalanceStars < preflight.totalStars
  );
  const preflightMatchesGift = !!(
    preflight?.ready &&
    preflight.gift &&
    activeGift &&
    preflight.gift.giftId === activeGift.giftId &&
    preflight.gift.slug === activeGift.slug
  );
  const canConfirm = !!(
    preflightMatchesGift &&
    preflight?.confirmationNonce &&
    preflight.totalStars !== null &&
    !insufficientBalance &&
    confirmedIntent &&
    !purchaseMutation.isPending
  );

  function clearPreflight() {
    setPreflight(null);
    setConfirmedIntent(false);
    setActionError('');
  }

  function runPreflight() {
    if (!activeGift) return;
    setActionError('');
    setPurchaseResult(null);
    setConfirmedIntent(false);
    preflightMutation.mutate(
      { data: { giftId: activeGift.giftId, slug: activeGift.slug } },
      {
        onSuccess: (result) => setPreflight(result),
        onError: (error) => setActionError(getErrorMessage(error)),
      },
    );
  }

  function confirmPurchase() {
    if (!activeGift || !preflight?.confirmationNonce || preflight.totalStars === null || !preflight.gift) return;
    setActionError('');
    purchaseMutation.mutate(
      {
        data: {
          giftId: preflight.gift.giftId,
          slug: preflight.gift.slug,
          confirmationNonce: preflight.confirmationNonce,
          expectedTotalStars: preflight.totalStars,
          confirmed: true,
        },
      },
      {
        onSuccess: (result) => {
          setPurchaseResult(result);
          setPreflight(null);
          setConfirmedIntent(false);
          void queryClient.invalidateQueries({ queryKey: getGetResaleQueueQueryKey(queueParams) });
        },
        onError: (error) => setActionError(getErrorMessage(error)),
      },
    );
  }

  function refreshQueue() {
    clearPreflight();
    setPurchaseResult(null);
    void refetch();
  }

  return (
    <section className={`panel resale-panel ${authorized ? '' : 'resale-locked'} enter enter-delay-1`} aria-labelledby="resale-heading">
      <div className="panel-kicker">
        <span className="kicker-index">02</span>
        <span>ONE LISTING AT A TIME</span>
        <span className="kicker-line" />
        {authorized ? <StatusPill tone="good"><Activity size={12} /> Live discovery</StatusPill> : <StatusPill>Waiting for authorization</StatusPill>}
      </div>
      <div className="resale-heading-row">
        <div>
          <h2 id="resale-heading">Resale discovery</h2>
          <p className="panel-intro">Review a current collectible, recheck payment with Telegram, then decide.</p>
        </div>
        {authorized && queue ? (
          <div className="progress-counter" data-testid="text-delivery-progress">
            <strong>{count ?? 0}<span> / {requestedCount ?? 7}</span></strong>
            <span>successful deliveries</span>
          </div>
        ) : null}
      </div>

      {!authorized ? (
        <div className="locked-stage" data-testid="status-resale-locked">
          <div className="locked-symbol"><PackageCheck size={26} /></div>
          <strong>Listings stay hidden until authorization.</strong>
          <p>Connect Telegram first. Collectible details and balances are shown only when returned by the server.</p>
        </div>
      ) : null}

      {authorized && isLoading ? (
        <div className="skeleton-stage" aria-label="Loading live resale listing">
          <div className="skeleton-art" />
          <div className="skeleton-lines"><i /><i /><i /><i /></div>
        </div>
      ) : null}

      {authorized && isError ? (
        <div className="state-box state-error queue-error" role="alert" data-testid="status-queue-error">
          <CircleAlert size={18} />
          <div className="state-copy">
            <strong>Could not load a current resale listing</strong>
            <span>{getErrorMessage(error)}</span>
          </div>
          <button className="button button-outline button-small" onClick={refreshQueue} data-testid="button-retry-queue">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : null}

      {authorized && !isLoading && !isError && queue && !activeGift && !purchaseResult?.finished ? (
        <div className="empty-stage" data-testid="status-no-current-listing">
          <div className="empty-orbit"><Sparkles size={22} /></div>
          <div className="empty-copy">
            <span className="empty-eyebrow">{listingsAvailable < (queue.requestedCount ?? 7) ? 'LIMITED CURRENT INVENTORY' : 'NO CURRENT LISTING'}</span>
            <h3>{listingsAvailable < (queue.requestedCount ?? 7) ? 'Fewer current listings than requested.' : 'Nothing to review right now.'}</h3>
            <p>{queue.message}</p>
            <p className="inventory-count">
              {listingsAvailable} current listing{listingsAvailable === 1 ? '' : 's'} available
              {listingsAvailable < (queue.requestedCount ?? 7) ? ` · ${queue.requestedCount} requested` : ''}
            </p>
            <button className="button button-outline" onClick={refreshQueue} disabled={isLoading} data-testid="button-refresh-listings">
              <RefreshCw size={15} /> Refresh listings
            </button>
          </div>
        </div>
      ) : null}

      {authorized && !isLoading && !isError && queue && activeGift && !purchaseResult?.finished ? (
        <>
          {listingsAvailable < (queue.requestedCount ?? 7) ? (
            <div className="inventory-note" data-testid="status-limited-inventory">
              <CircleAlert size={15} />
              <span>{listingsAvailable} current listing{listingsAvailable === 1 ? '' : 's'} available; {queue.requestedCount} requested. Only verified listings are shown.</span>
            </div>
          ) : null}
          {purchaseResult?.success ? (
            <div className="purchase-result" role="status" data-testid="status-purchase-success">
              <div className="result-icon"><CheckCircle2 size={18} /></div>
              <div>
                <strong>{purchaseResult.message}</strong>
                <span>
                  {purchaseResult.gift?.title ? `${purchaseResult.gift.title} · ` : ''}
                  {purchaseResult.totalStars === null ? 'Total not reported' : `${stars(purchaseResult.totalStars)} Stars`}
                  {purchaseResult.transactionId ? ` · Transaction ${purchaseResult.transactionId}` : ''}
                </span>
              </div>
            </div>
          ) : null}
          {purchaseResult && !purchaseResult.success ? (
            <div className="state-box state-warn" role="status" data-testid="status-purchase-not-completed">
              <CircleAlert size={17} />
              <div className="state-copy"><strong>Telegram did not report a completed purchase</strong><span>{purchaseResult.message}</span></div>
            </div>
          ) : null}

          <GiftCard gift={activeGift} />
          <div className="queue-message" data-testid="text-queue-message">
            <span className="message-dot" /> {queue.message}
          </div>

          {!preflight ? (
            <div className="action-area">
              {actionError ? (
                <div className="inline-error" role="alert" data-testid="status-resale-action-error">
                  <CircleAlert size={15} /> <span>{actionError}</span>
                </div>
              ) : null}
              <div className="preflight-note">
                <Wallet size={17} />
                <span>Before anything can be purchased, Telegram must verify the live listing and exact payment total.</span>
              </div>
              <button
                className="button button-primary preflight-button"
                onClick={runPreflight}
                disabled={preflightMutation.isPending || purchaseMutation.isPending}
                data-testid="button-run-preflight"
              >
                {preflightMutation.isPending ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={17} />}
                {preflightMutation.isPending ? 'Checking with Telegram' : 'Check live payment'}
                {!preflightMutation.isPending ? <ArrowRight size={16} /> : null}
              </button>
            </div>
          ) : (
            <div className="preflight-card" data-testid="card-payment-preflight">
              <div className="preflight-topline">
                <span className="preflight-label"><ShieldCheck size={15} /> TELEGRAM PAYMENT PREFLIGHT</span>
                <StatusPill tone={preflight.ready && !insufficientBalance ? 'good' : 'warn'}>
                  {preflight.ready && !insufficientBalance ? 'Checked' : 'Not ready'}
                </StatusPill>
              </div>
              <p className="preflight-message" data-testid="text-preflight-message">{preflight.message}</p>
              {preflight.gift ? (
                <div className="verified-listing">
                  <span>Verified listing</span>
                  <strong>{preflight.gift.title} <small>#{preflight.gift.uniqueNumber.toLocaleString()}</small></strong>
                </div>
              ) : null}
              <div className="payment-facts">
                <div><span>Exact payment total</span><strong>{preflight.totalStars === null ? 'Not reported' : `${stars(preflight.totalStars)} Stars`}</strong></div>
                <div>
                  <span>Bot balance</span>
                  <strong>
                    {preflight.botBalanceVerified
                      ? preflight.botBalanceStars === null ? 'Not reported' : `${stars(preflight.botBalanceStars)} Stars`
                      : 'Not verified'}
                  </strong>
                </div>
                <div><span>Recipient</span><strong className="recipient-id">{preflight.recipientId}</strong></div>
              </div>
              {insufficientBalance ? (
                <div className="state-box state-error balance-error" role="alert" data-testid="status-insufficient-balance">
                  <CircleAlert size={16} />
                  <div className="state-copy">
                    <strong>Insufficient verified bot balance</strong>
                    <span>Telegram reports {stars(preflight.botBalanceStars)} Stars available against a {stars(preflight.totalStars)} Stars total.</span>
                  </div>
                </div>
              ) : null}
              {(!preflight.ready || !preflightMatchesGift || !preflight.confirmationNonce || preflight.totalStars === null) && !insufficientBalance ? (
                <div className="state-box state-warn" role="status" data-testid="status-preflight-not-ready">
                  <CircleAlert size={16} />
                  <div className="state-copy">
                    <strong>{preflight.gift ? 'This listing cannot be confirmed.' : 'The listing is no longer current.'}</strong>
                    <span>{preflight.message}</span>
                  </div>
                  <button className="button button-outline button-small" onClick={refreshQueue} data-testid="button-refresh-stale-listing">
                    <RefreshCw size={13} /> Refresh
                  </button>
                </div>
              ) : null}
              {actionError ? (
                <div className="inline-error" role="alert" data-testid="status-resale-action-error">
                  <CircleAlert size={15} /> <span>{actionError}</span>
                </div>
              ) : null}
              <div className="confirmation-row">
                <label className="confirm-check">
                  <input
                    type="checkbox"
                    checked={confirmedIntent}
                    onChange={(event) => setConfirmedIntent(event.target.checked)}
                    disabled={!preflight.ready || insufficientBalance || !preflightMatchesGift}
                    data-testid="input-confirm-purchase-intent"
                  />
                  <span className="custom-check"><Check size={12} /></span>
                  <span>I have reviewed the verified total and authorize this purchase.</span>
                </label>
                <button
                  className="button button-purchase"
                  onClick={confirmPurchase}
                  disabled={!canConfirm}
                  data-testid="button-confirm-purchase"
                >
                  {purchaseMutation.isPending ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={15} />}
                  {purchaseMutation.isPending ? 'Sending to Telegram' : `Confirm purchase${preflight.totalStars === null ? '' : ` · ${stars(preflight.totalStars)} Stars`}`}
                </button>
              </div>
              <button className="text-button" onClick={clearPreflight} disabled={purchaseMutation.isPending} data-testid="button-cancel-preflight">
                Cancel confirmation
              </button>
            </div>
          )}
        </>
      ) : null}

      {authorized && purchaseResult?.finished ? (
        <div className="finished-stage" data-testid="status-resale-finished">
          <div className="finished-mark"><CheckCircle2 size={29} /></div>
          <span className="empty-eyebrow">DELIVERY RUN COMPLETE</span>
          <h3>{purchaseResult.message}</h3>
          <p>{purchaseResult.completedCount} of {purchaseResult.requestedCount} successful deliveries reported by Telegram.</p>
          <div className="final-balance">
            <span>Bot balance</span>
            <strong>
              {purchaseResult.botBalanceVerified
                ? purchaseResult.botBalanceStars === null ? 'Not reported' : `${stars(purchaseResult.botBalanceStars)} Stars`
                : 'Not verified'}
            </strong>
          </div>
        </div>
      ) : null}

      {authorized && queue && !purchaseResult?.finished ? (
        <div className="balance-strip" data-testid="status-bot-balance">
          <div className="balance-icon"><Wallet size={16} /></div>
          <div className="balance-copy"><span>Bot Stars balance</span><strong>
            {queue.botBalanceVerified
              ? queue.botBalanceStars === null ? 'Not reported' : `${stars(queue.botBalanceStars)} Stars`
              : 'Not verified'}
          </strong></div>
          <span className={`balance-verification ${queue.botBalanceVerified ? 'is-verified' : ''}`}>
            {queue.botBalanceVerified ? <><CheckCircle2 size={13} /> Verified</> : <><Clock3 size={13} /> Unverified</>}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function Home() {
  const healthQuery = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), retry: 1 },
  });
  const authQuery = useGetTelegramAuthStatus({
    query: { queryKey: getGetTelegramAuthStatusQueryKey(), retry: 1 },
  });
  const auth = authQuery.data;

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <div className="brand-lockup" data-testid="text-product-name">
          <div className="brand-symbol"><Gem size={18} strokeWidth={1.6} /></div>
          <span>gift<span className="brand-slash">/</span>flow</span>
          <span className="brand-label">OWNER CONSOLE</span>
        </div>
        <div className="topbar-right">
          <div className="api-health" data-testid="status-api-availability">
            <span className={`health-dot ${healthQuery.isError ? 'health-down' : healthQuery.isSuccess ? 'health-up' : ''}`} />
            <span>{healthQuery.isLoading ? 'Checking API' : healthQuery.isError ? 'API unavailable' : 'API available'}</span>
          </div>
          <span className="owner-tag"><LockKeyhole size={12} /> Owner only</span>
        </div>
      </header>

      <section className="intro-band enter">
        <div className="intro-copy">
          <div className="eyebrow"><span className="eyebrow-rule" /> TELEGRAM COLLECTIBLE RESALE</div>
          <h1>Discover carefully.<br /><em>Confirm deliberately.</em></h1>
          <p>Authorize once. Review each live collectible. Every payment gets a fresh Telegram check and your separate approval.</p>
        </div>
        <div className="workflow-stamp" aria-label="One verified collectible at a time">
          <div className="stamp-ring"><span>ONE AT A TIME</span><Gem size={23} /><span>SERVER VERIFIED</span></div>
          <div className="stamp-small">NO AUTOMATIC PURCHASES</div>
        </div>
      </section>

      <div className="workflow-line" aria-hidden="true">
        <span className={auth?.authorized ? 'workflow-complete' : ''}><i>01</i> Authorize</span>
        <b />
        <span className={auth?.authorized ? 'workflow-active' : ''}><i>02</i> Review listing</span>
        <b />
        <span><i>03</i> Confirm purchase</span>
      </div>

      <div className="content-grid">
        <AuthPanel
          authorized={auth?.authorized ?? false}
          configured={auth?.configured ?? false}
          pending={auth?.pending ?? false}
          needsPassword={auth?.needsPassword ?? false}
          phoneNumber={auth?.phoneNumber ?? null}
          message={auth?.message ?? ''}
          loading={authQuery.isLoading}
          queryError={authQuery.error}
          onRetry={() => { void authQuery.refetch(); }}
        />
        <ResalePanel authorized={auth?.authorized ?? false} />
      </div>

      <footer className="page-footer">
        <span>GIFT / FLOW</span>
        <span>Telegram-discovered listings · server-reported facts only</span>
        <span className="footer-secure"><LockKeyhole size={12} /> Private session storage</span>
      </footer>
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;