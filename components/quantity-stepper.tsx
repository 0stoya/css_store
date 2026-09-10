"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import { useId, useState } from "react";

export function QuantityStepper({
  name,
  label = "Quantity",
  ariaLabel,
  defaultValue,
  min = 0,
  max,
  step = 1,
  firstPositiveValue,
  disabled = false,
  compact = false,
  submitControl,
}: {
  name: string;
  label?: string;
  ariaLabel?: string;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number | "any";
  firstPositiveValue?: number;
  disabled?: boolean;
  compact?: boolean;
  submitControl?: {
    name: string;
    value: string;
    label?: string;
    disabled?: boolean;
  };
}) {
  const id = useId();
  const [value, setValue] = useState(String(defaultValue));
  const controlLabel = ariaLabel || label;
  const buttonStep = typeof step === "number" && Number.isFinite(step) && step > 0 ? step : 1;
  const numericValue = Number(value);
  const firstPositive = typeof firstPositiveValue === "number" && Number.isFinite(firstPositiveValue) && firstPositiveValue > 0
    ? firstPositiveValue
    : null;

  function adjust(direction: -1 | 1) {
    if (disabled) return;

    const current = Number.isFinite(numericValue) ? numericValue : defaultValue || 0;
    const lower = Number.isFinite(min) ? min : 0;
    const upper = typeof max === "number" && Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;

    let raw: number;
    if (firstPositive !== null && direction === 1 && current <= 0) {
      raw = firstPositive;
    } else if (firstPositive !== null && direction === -1 && current <= firstPositive) {
      raw = 0;
    } else {
      raw = current + (buttonStep * direction);
    }

    raw = Math.min(upper, Math.max(lower, raw));
    const precision = Math.max(
      String(buttonStep).split(".")[1]?.length || 0,
      String(lower).split(".")[1]?.length || 0,
      String(firstPositive ?? 0).split(".")[1]?.length || 0,
    );
    const next = precision ? Number(raw.toFixed(precision)) : raw;
    setValue(String(next));
  }

  const addDisabled = disabled
    || submitControl?.disabled === true
    || !Number.isFinite(numericValue)
    || numericValue <= 0;

  return <div className={`quantity-control ${compact ? "compact" : ""} ${submitControl ? "with-submit" : ""}`}>
    <label htmlFor={id}>{label}</label>
    <div className="quantity-control-row">
      <div className="quantity-stepper">
        <button type="button" onClick={() => adjust(-1)} disabled={disabled} aria-label={`Decrease ${controlLabel.toLowerCase()}`}>
          <Minus size={16} strokeWidth={2.2}/>
        </button>
        <input
          id={id}
          name={name}
          type="number"
          inputMode="decimal"
          aria-label={ariaLabel}
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          required={!disabled}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="button" onClick={() => adjust(1)} disabled={disabled} aria-label={`Increase ${controlLabel.toLowerCase()}`}>
          <Plus size={16} strokeWidth={2.2}/>
        </button>
      </div>

      {submitControl ? <button
        className="button quantity-line-add"
        type="submit"
        name={submitControl.name}
        value={submitControl.value}
        disabled={addDisabled}
      >
        <ShoppingCart size={16} aria-hidden="true"/>
        <span>{submitControl.label || "Add"}</span>
      </button> : null}
    </div>
  </div>;
}
