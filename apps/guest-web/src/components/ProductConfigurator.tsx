"use client";

import { useId, useState, type FormEvent } from "react";
import type { MenuProductDto } from "@restaurant-platform/shared-types";
import { validateCartSelection } from "@/lib/guest-order";
import { formatMenuPrice, isProductAvailable } from "@/lib/menu";
import { orderingMessages } from "@/lib/ordering-i18n";
import { messages } from "@/lib/i18n";
import { selectionEstimate } from "@/lib/guest-pricing";
import { useGuestSession } from "./GuestSession";
import { ProductMedia } from "./ProductMedia";

export function ProductConfigurator({ product, currency }: { product: MenuProductDto; currency: string }) {
  const { locale, state, actions } = useGuestSession();
  const text = orderingMessages[locale];
  const formId = useId();
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [options, setOptions] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<"added" | "invalid" | null>(null);
  const available = isProductAvailable(product);
  const selectedVariant = product.variants.find(variant => variant.id === variantId);
  const canAdd = state.phase === "ready" && !!actions && available;
  const selection = {
    variantId: variantId || null, quantity, specialInstruction: notes,
    modifiers: Object.entries(options).filter(([, count]) => count > 0)
      .map(([modifierOptionId, count]) => ({ modifierOptionId, quantity: count })),
  };
  const valid = validateCartSelection(product, selection, state.cart);
  const estimate = selectionEstimate(product, selection);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAdd || !validateCartSelection(product, selection, state.cart) || !actions?.add(product, selection)) {
      setFeedback("invalid");
      return;
    }
    setFeedback("added");
  }

  return <section className="order-configurator" aria-labelledby={`${formId}-title`}>
    <h2 id={`${formId}-title`}>{text.configure}</h2>
    {!available && <p className="ordering-error" role="status">{text.unavailable}</p>}
    {state.phase === "browse" && <p className="muted">{text.scan}</p>}
    <form onSubmit={submit} onChange={() => setFeedback(null)}>
      <fieldset disabled={!canAdd} className="order-fields">
        <legend className="visually-hidden">{product.name}</legend>
        {product.variants.length > 0 && <label className="order-field" htmlFor={`${formId}-variant`}>
          <span>{text.variant} <span className="choice-label">{text.required}</span></span>
          <select id={`${formId}-variant`} value={variantId} required aria-describedby={selectedVariant?.description ? `${formId}-variant-description` : undefined} onChange={event => setVariantId(event.target.value)}>
            <option value="">{text.chooseVariant}</option>
            {product.variants.map(variant => <option key={variant.id} value={variant.id} disabled={!variant.available || variant.price === null}>
              {variant.name}{variant.price === null ? "" : ` · ${formatMenuPrice(variant.price, currency, locale)}`}{variant.available ? "" : ` · ${text.unavailable}`}
            </option>)}
          </select>
          {selectedVariant?.description && <span id={`${formId}-variant-description`} className="variant-description">{selectedVariant.description}</span>}
          {selectedVariant && <span className="selected-variant-media"><ProductMedia src={selectedVariant.imageUrl} alt={selectedVariant.name}
            fallbackLabel={`${selectedVariant.name} · ${messages[locale].photoUnavailable}`} width={96} height={96} className="variant-image" /></span>}
        </label>}
        {product.modifierGroups.map(group => <fieldset key={group.id} className="order-modifier-group" aria-describedby={`${formId}-${group.id}-rules`}>
          <legend>{group.name} <span className="choice-label">{group.required ? text.required : text.optional}</span></legend>
          <p id={`${formId}-${group.id}-rules`} className="muted">{text.selections}: {group.minSelections}–{group.maxSelections}</p>
          {group.options.map(option => <div className="order-option" key={option.id}>
            <label htmlFor={`${formId}-${option.id}`}>
              <span>{option.name}</span>
              <small>{option.available ? `+${formatMenuPrice(option.additionalPrice, currency, locale)}` : text.unavailable}</small>
            </label>
            <input id={`${formId}-${option.id}`} type="number" inputMode="numeric" min={0} max={10} step={1}
              value={options[option.id] ?? 0} disabled={!option.available}
              aria-label={`${text.modifierQuantity}: ${option.name}`}
              aria-describedby={`${formId}-${group.id}-rules`}
              onChange={event => setOptions(previous => ({ ...previous, [option.id]: Number(event.target.value) }))} />
          </div>)}
        </fieldset>)}
        <label className="order-field" htmlFor={`${formId}-quantity`}>
          <span>{text.quantity}</span>
          <input id={`${formId}-quantity`} type="number" inputMode="numeric" min={1} max={product.trackStock ? Math.min(product.stockQuantity ?? 0, 999) : 999}
            step={1} required value={quantity} onChange={event => setQuantity(Number(event.target.value))} />
        </label>
        <label className="order-field" htmlFor={`${formId}-notes`}>
          <span>{text.notes}</span>
          <textarea id={`${formId}-notes`} maxLength={500} rows={3} value={notes}
            aria-describedby={`${formId}-notes-hint`} onChange={event => setNotes(event.target.value)} />
          <small id={`${formId}-notes-hint`} className="muted">{text.notesHint}</small>
        </label>
        <div className="configurator-summary">
          <p className="selection-total" aria-live="polite"><span>{text.itemEstimate}</span><strong>{estimate === null ? text.chooseRequired : formatMenuPrice(estimate, currency, locale)}</strong></p>
          <p id={`${formId}-selection-hint`} className="muted" role="status" aria-live="polite" aria-atomic="true">{!valid ? text.invalidSelection : text.finalPrices}</p>
          <button className="button" type="submit" disabled={!valid} aria-describedby={`${formId}-selection-hint`}>{text.add}</button>
        </div>
      </fieldset>
      {feedback && <p role={feedback === "invalid" ? "alert" : "status"} className={feedback === "invalid" ? "ordering-error" : "ordering-success"}>
        {feedback === "invalid" ? text.invalidSelection : <>{text.added} <a href="#guest-order">{text.cart}</a></>}
      </p>}
    </form>
  </section>;
}
