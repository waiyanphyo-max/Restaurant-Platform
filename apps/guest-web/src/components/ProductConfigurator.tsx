"use client";

import { useId, useState, type FormEvent } from "react";
import type { MenuProductDto } from "@restaurant-platform/shared-types";
import { validateCartSelection } from "@/lib/guest-order";
import { formatMenuPrice, isProductAvailable } from "@/lib/menu";
import { orderingMessages } from "@/lib/ordering-i18n";
import { useGuestSession } from "./GuestSession";

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
  const canAdd = state.phase === "ready" && !!actions && available;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selection = {
      variantId: variantId || null, quantity, specialInstruction: notes,
      modifiers: Object.entries(options).filter(([, count]) => count > 0)
        .map(([modifierOptionId, count]) => ({ modifierOptionId, quantity: count })),
    };
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
          <select id={`${formId}-variant`} value={variantId} required onChange={event => setVariantId(event.target.value)}>
            <option value="">{text.chooseVariant}</option>
            {product.variants.map(variant => <option key={variant.id} value={variant.id} disabled={!variant.available || variant.price === null}>
              {variant.name}{variant.price === null ? "" : ` · ${formatMenuPrice(variant.price, currency, locale)}`}{variant.available ? "" : ` · ${text.unavailable}`}
            </option>)}
          </select>
        </label>}
        {product.modifierGroups.map(group => <fieldset key={group.id} className="order-modifier-group">
          <legend>{group.name} <span className="choice-label">{group.required ? text.required : text.optional}</span></legend>
          <p className="muted">{text.selections}: {group.minSelections}–{group.maxSelections}</p>
          {group.options.map(option => <div className="order-option" key={option.id}>
            <label htmlFor={`${formId}-${option.id}`}>
              <span>{option.name}</span>
              <small>{option.available ? `+${formatMenuPrice(option.additionalPrice, currency, locale)}` : text.unavailable}</small>
            </label>
            <input id={`${formId}-${option.id}`} type="number" inputMode="numeric" min={0} max={10} step={1}
              value={options[option.id] ?? 0} disabled={!option.available}
              aria-label={`${text.modifierQuantity}: ${option.name}`}
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
        <button className="button" type="submit">{text.add}</button>
      </fieldset>
      {feedback && <p role={feedback === "invalid" ? "alert" : "status"} className={feedback === "invalid" ? "ordering-error" : "ordering-success"}>
        {feedback === "invalid" ? text.invalidSelection : <>{text.added} <a href="#guest-order">{text.cart}</a></>}
      </p>}
    </form>
  </section>;
}
