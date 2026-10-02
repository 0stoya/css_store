"use client";

import { CheckCircle2, Minus, PackageCheck, Plus } from "lucide-react";
import { useMemo, useState } from "react";

export type StarterKitBuilderItem = {
  index: number;
  sku: string;
  name: string;
  image: { url: string; label: string | null } | null;
  priceLabel: string | null;
  available: boolean;
  unavailableReason: string | null;
  defaultQuantity: number;
  minPositive: number;
  max: number | null;
  step: number;
  options: Array<{
    uid: string;
    label: string;
    values: Array<{ uid: string; label: string }>;
  }>;
};

function precision(value: number) {
  return String(value).split(".")[1]?.length || 0;
}

export function StarterKitBuilder({
  items,
  canAdd,
}: {
  items: StarterKitBuilderItem[];
  canAdd: boolean;
}) {
  const [quantities, setQuantities] = useState<Record<number, number>>(() =>
    Object.fromEntries(items.map((item) => [item.index, item.available ? item.defaultQuantity : 0])),
  );
  const [selections, setSelections] = useState<Record<string, string>>({});

  const progress = useMemo(() => {
    const selectedItems = items.filter((item) => item.available && (quantities[item.index] || 0) > 0);
    const incomplete = selectedItems.filter((item) =>
      item.options.some((option) => !selections[`${item.index}:${option.uid}`]),
    );
    return {
      selectedCount: selectedItems.length,
      readyCount: selectedItems.length - incomplete.length,
      incompleteCount: incomplete.length,
    };
  }, [items, quantities, selections]);

  const canSubmit = canAdd && progress.selectedCount > 0 && progress.incompleteCount === 0;

  function adjust(item: StarterKitBuilderItem, direction: -1 | 1) {
    setQuantities((current) => {
      const value = current[item.index] || 0;
      const safeStep = Number.isFinite(item.step) && item.step > 0 ? item.step : 1;
      const firstPositive = Number.isFinite(item.minPositive) && item.minPositive > 0
        ? item.minPositive
        : safeStep;
      const upper = typeof item.max === "number" && Number.isFinite(item.max)
        ? item.max
        : Number.POSITIVE_INFINITY;

      let next: number;
      if (direction === 1 && value <= 0) next = Math.min(upper, firstPositive);
      else if (direction === -1 && value <= firstPositive) next = 0;
      else next = Math.min(upper, Math.max(0, value + (safeStep * direction)));

      const places = Math.max(precision(safeStep), precision(firstPositive));
      return {
        ...current,
        [item.index]: places ? Number(next.toFixed(places)) : next,
      };
    });
  }

  function setQuantity(item: StarterKitBuilderItem, raw: string) {
    const parsed = Number(raw);
    const upper = typeof item.max === "number" && Number.isFinite(item.max)
      ? item.max
      : Number.POSITIVE_INFINITY;
    setQuantities((current) => ({
      ...current,
      [item.index]: Number.isFinite(parsed) ? Math.min(upper, Math.max(0, parsed)) : 0,
    }));
  }

  return (
    <div className="starter-kit-builder">
      <div className="starter-kit-progress">
        <div>
          <span className="starter-kit-progress-icon"><PackageCheck size={20} aria-hidden="true" /></span>
          <span>
            <strong>Build your kit</strong>
            <small>
              {progress.selectedCount
                ? `${progress.readyCount} of ${progress.selectedCount} selected items ready`
                : "Choose the items you need, then select their options."}
            </small>
          </span>
        </div>
        <span className={progress.incompleteCount ? "starter-kit-progress-status incomplete" : "starter-kit-progress-status"}>
          {progress.incompleteCount
            ? `${progress.incompleteCount} option${progress.incompleteCount === 1 ? "" : "s"} missing`
            : progress.selectedCount
              ? "Ready to add"
              : "Nothing selected"}
        </span>
      </div>

      <div className="starter-kit-items">
        {items.map((item, position) => {
          const quantity = quantities[item.index] || 0;
          const selected = quantity > 0;
          const complete = selected && item.options.every((option) =>
            Boolean(selections[`${item.index}:${option.uid}`]),
          );

          return (
            <article
              className={[
                "starter-kit-item",
                selected ? "selected" : "skipped",
                !item.available ? "unavailable" : "",
                complete ? "complete" : "",
              ].filter(Boolean).join(" ")}
              key={item.sku}
            >
              <input type="hidden" name={`child_${item.index}_sku`} value={item.sku} />

              <div className="starter-kit-item-media">
                {item.image?.url ? (
                  // Product images are remote Magento media URLs already allowed by Next config.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image.url} alt={item.image.label || item.name} />
                ) : (
                  <PackageCheck size={28} aria-hidden="true" />
                )}
              </div>

              <div className="starter-kit-item-copy">
                <span className="starter-kit-item-number">Kit item {position + 1}</span>
                <strong>{item.name}</strong>
                <span className="starter-kit-item-meta">
                  <code>{item.sku}</code>
                  {item.priceLabel ? <span>{item.priceLabel}</span> : null}
                </span>
                {!item.available && item.unavailableReason ? (
                  <small className="starter-kit-item-error">{item.unavailableReason}</small>
                ) : null}
              </div>

              <div className="starter-kit-item-options">
                {item.options.map((option) => {
                  const key = `${item.index}:${option.uid}`;
                  return (
                    <label className="field starter-kit-option" key={option.uid}>
                      <span>{option.label}</span>
                      <select
                        name={`child_${item.index}_option`}
                        value={selections[key] || ""}
                        disabled={!item.available}
                        required={selected}
                        onChange={(event) => setSelections((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))}
                      >
                        <option value="">Choose {option.label}</option>
                        {option.values.map((value) => (
                          <option value={value.uid} key={value.uid}>{value.label}</option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>

              <div className="starter-kit-quantity">
                <span>Quantity</span>
                <div className="starter-kit-quantity-control">
                  <button
                    type="button"
                    disabled={!item.available || quantity <= 0}
                    onClick={() => adjust(item, -1)}
                    aria-label={`Decrease ${item.name} quantity`}
                  >
                    <Minus size={16} aria-hidden="true" />
                  </button>
                  <input
                    name={`child_${item.index}_quantity`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={item.max ?? undefined}
                    step={item.step}
                    value={quantity}
                    disabled={!item.available}
                    onChange={(event) => setQuantity(item, event.target.value)}
                    aria-label={`${item.name} quantity`}
                  />
                  <button
                    type="button"
                    disabled={!item.available || (item.max !== null && quantity >= item.max)}
                    onClick={() => adjust(item, 1)}
                    aria-label={`Increase ${item.name} quantity`}
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="starter-kit-item-state">
                {complete ? (
                  <span className="ready"><CheckCircle2 size={15} aria-hidden="true" /> Ready</span>
                ) : selected ? (
                  <span>Choose options</span>
                ) : item.available ? (
                  <span>Not included</span>
                ) : (
                  <span>Unavailable</span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="starter-kit-submit">
        <div>
          <strong>{progress.selectedCount} kit item{progress.selectedCount === 1 ? "" : "s"} selected</strong>
          <small>Items with quantity 0 are left out of this basket addition.</small>
        </div>
        <button className="button starter-kit-primary-action" type="submit" disabled={!canSubmit}>
          <PackageCheck size={18} aria-hidden="true" />
          <span>{canAdd ? "Add starter kit to basket" : "Ordering unavailable"}</span>
        </button>
      </div>
    </div>
  );
}
