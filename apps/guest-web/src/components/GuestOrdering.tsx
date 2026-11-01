"use client";

import { formatMenuPrice } from "@/lib/menu";
import { orderStatusLabel, orderingMessages } from "@/lib/ordering-i18n";
import { useGuestSession } from "./GuestSession";

/** The order number carries Spring's restaurant-local business date. */
export function receiptOrderDate(orderNumber: string): string | null {
  const match = /^ORD-(\d{4})(\d{2})(\d{2})-/.exec(orderNumber);
  if (!match) return null;
  const day = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
}

export function GuestOrdering({ currency }: { currency: string }) {
  const { locale, state, actions } = useGuestSession();
  const text = orderingMessages[locale];
  const { phase, context, receipt, tracking } = state;
  const locked = phase !== "ready";
  const errorText = state.error ? {
    "invalid-qr": text.invalid, unavailable: text.orderingUnavailable, selection: text.selection,
    conflict: text.conflict, retry: text.retryError, configuration: text.configuration, expired: text.expired,
  }[state.error] : null;

  if (phase === "confirmed" && receipt) {
    const queue = receipt.queue;
    const day = receiptOrderDate(receipt.orderNumber);
    return <section className="order-panel order-confirmation" id="guest-order" aria-labelledby="confirmation-title">
      <div className="order-confirmation-heading"><span aria-hidden="true" className="order-check">✓</span><h2 id="confirmation-title">{text.confirmed}</h2></div>
      <dl className="order-facts">
        <div><dt>{text.orderNumber}</dt><dd>{receipt.orderNumber}</dd></div>
        <div><dt>{text.orderStatus}</dt><dd role="status">{orderStatusLabel(tracking?.orderStatus ?? receipt.status, locale)}</dd></div>
        {state.kind === "TABLE_QR" && context?.tableNumber && <div><dt>{text.table}</dt><dd>{context.tableNumber}</dd></div>}
      </dl>
      {queue ? <>
        <div className="queue-ticket" aria-live="polite">
          <span>{text.queue}</span><strong>{tracking?.displayCode ?? queue.displayCode}</strong>
          {day && <p>{text.queueDate}: <time dateTime={day}>{new Intl.DateTimeFormat(locale === "my" ? "my-MM" : "en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`))}</time></p>}
          <p>{text.queueStatus}: <b>{orderStatusLabel(tracking?.queueStatus ?? queue.status, locale)}</b></p>
        </div>
        <p className="muted">{text.dateScoped}</p>
        <p className="muted">{text.liveStatus}</p>
        {state.trackingError && <p className="ordering-error" role="status">{text.trackingError}</p>}
        <div className="order-actions">
          <button type="button" className="order-secondary-button" onClick={() => void actions?.refresh()} disabled={!actions}>{text.refresh}</button>
          <button type="button" className="order-secondary-button" onClick={() => void actions?.enableSound()} disabled={!actions || state.sound === "on"}>
            {state.sound === "on" ? text.soundOn : text.sound}
          </button>
        </div>
        <p className="muted">{state.sound === "unavailable" ? text.soundUnavailable : text.soundHint}</p>
        {state.notifications.length > 0 && <section className="order-notifications" aria-labelledby="pickup-notifications">
          <h3 id="pickup-notifications">{text.notifications}</h3>
          <ul aria-live="polite">{state.notifications.map(notification => <li key={notification.id}><strong>{notification.title}</strong><p>{notification.body}</p></li>)}</ul>
        </section>}
      </> : <p className="muted">{text.tableStatus}</p>}
      <dl className="order-totals">
        <div><dt>{text.subtotal}</dt><dd>{formatMenuPrice(receipt.subtotal, receipt.currency, locale)}</dd></div>
        {receipt.deliveryFee > 0 && <div><dt>{text.deliveryFee}</dt><dd>{formatMenuPrice(receipt.deliveryFee, receipt.currency, locale)}</dd></div>}
        {receipt.discountAmount > 0 && <div><dt>{text.discount}</dt><dd>−{formatMenuPrice(receipt.discountAmount, receipt.currency, locale)}</dd></div>}
        <div className="order-total"><dt>{text.total}</dt><dd>{formatMenuPrice(receipt.totalAmount, receipt.currency, locale)}</dd></div>
      </dl>
      <p className="muted">{text.keepOpen}</p>
    </section>;
  }

  const banner = phase === "browse" ? text.scan : phase === "validating" ? text.validating : phase === "invalid" ? text.invalid
    : phase === "error" ? text.error : phase === "submitting" ? text.submitting : phase === "uncertain" ? (state.error === "expired" ? text.expired : text.uncertain) : text.ready;
  return <section className="order-panel" id="guest-order" aria-labelledby="guest-order-title">
    <div className="ordering-context">
      <h2 id="guest-order-title">{text.cart}</h2>
      {state.kind && <span className="choice-label">{state.kind === "TABLE_QR" ? text.dineIn : text.takeaway}</span>}
      {state.kind === "TABLE_QR" && context?.tableNumber && <span>{text.table} {context.tableNumber}</span>}
    </div>
    <p role={phase === "invalid" || phase === "error" ? "alert" : "status"}>{banner}</p>
    {phase === "error" && <button type="button" className="order-secondary-button" disabled={!actions} onClick={() => void actions?.retryValidation()}>{text.retry}</button>}
    {errorText && phase !== "invalid" && errorText !== banner && <p className="ordering-error" role="alert">{errorText}</p>}
    {state.cart.length > 0 ? <ul className="order-cart-lines">
      {state.cart.map(line => <li key={line.id}>
        <div className="order-line-copy"><strong>{line.name}</strong>{line.variantName && <span>{line.variantName}</span>}
          {line.modifierNames.length > 0 && <span>{line.modifierNames.map((name, index) => `${name} × ${line.modifiers[index]?.quantity ?? 1}`).join(", ")}</span>}
          {line.specialInstruction && <p>{line.specialInstruction}</p>}
        </div>
        <label className="order-line-quantity"><span>{text.quantity}</span>
          <input type="number" inputMode="numeric" min={1} max={999} step={1} value={line.quantity}
            aria-label={`${text.quantity}: ${line.name}`} disabled={locked || !actions}
            onChange={event => actions?.setQuantity(line.id, Number(event.target.value))} />
        </label>
        <button type="button" className="order-remove" disabled={locked || !actions} aria-label={`${text.remove}: ${line.name}`} onClick={() => actions?.remove(line.id)}>{text.remove}</button>
      </li>)}
    </ul> : <p className="muted">{text.emptyCart}</p>}
    <p className="muted">{text.finalPrices}</p>
    <button type="button" className="button" disabled={!actions || state.error === "expired" || state.cart.length === 0 || (phase !== "ready" && phase !== "uncertain")}
      onClick={() => void actions?.checkout()}>{phase === "submitting" ? text.submitting : phase === "uncertain" ? text.safeRetry : text.submit}</button>
    {state.cart.length > 0 && <p className="muted order-session-note">{text.keepOpen}</p>}
    <span className="visually-hidden">{currency}</span>
  </section>;
}
