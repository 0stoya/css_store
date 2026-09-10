"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import { useId, useState } from "react";

export function GroupedQuantityControl({
  name,
  productName,
  childSku,
  minPositive = 1,
  max,
  step = 1,
  disabled = false,
}: {
  name: string;
  productName: string;
  childSku: string;
  minPositive?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const [value, setValue] = useState(0);
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const firstPositive = Number.isFinite(minPositive) && minPositive > 0 ? minPositive : safeStep;
  const upper = typeof max === "number" && Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;

  function adjust(direction: -1 | 1) {
    if (disabled) return;

    if (direction === 1 && value <= 0) {
      setValue(Math.min(upper, firstPositive));
      return;
    }

    if (direction === -1 && value <= firstPositive) {
      setValue(0);
      return;
    }

    const next = Math.min(upper, Math.max(0, value + (safeStep * direction)));
    const precision = Math.max(
      String(safeStep).split(".")[1]?.length || 0,
      String(firstPositive).split(".")[1]?.length || 0,
    );
    setValue(precision ? Number(next.toFixed(precision)) : next);
  }

  return <div className="grouped-quantity-control">
    <label htmlFor={id}>Quantity</label>
    <div className="grouped-quantity-row">
      <div className="quantity-stepper">
        <button type="button" onClick={() => adjust(-1)} disabled={disabled || value <= 0} aria-label={`Decrease ${productName} quantity`}>
          <Minus size={16} strokeWidth={2.2}/>
        </button>
        <input
          id={id}
          name={name}
          type="number"
          inputMode="decimal"
          aria-label={`${productName} quantity`}
          value={value}
          min={0}
          max={max}
          step={safeStep}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value);
            setValue(Number.isFinite(next) ? Math.min(upper, Math.max(0, next)) : 0);
          }}
        />
        <button type="button" onClick={() => adjust(1)} disabled={disabled || value >= upper} aria-label={`Increase ${productName} quantity`}>
          <Plus size={16} strokeWidth={2.2}/>
        </button>
      </div>
      <button
        className="button grouped-line-add"
        type="submit"
        name="grouped_child_sku"
        value={childSku}
        disabled={disabled || value <= 0}
      >
        <ShoppingCart size={16} aria-hidden="true"/>
        <span>Add</span>
      </button>
    </div>
  </div>;
}
