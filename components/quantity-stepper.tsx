"use client";

import { Minus, Plus } from "lucide-react";
import { useId, useRef } from "react";

export function QuantityStepper({
  name,
  label = "Quantity",
  defaultValue,
  min = 0,
  max,
  step = 1,
  disabled = false,
  compact = false,
}: {
  name: string;
  label?: string;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number | "any";
  disabled?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonStep = typeof step === "number" && Number.isFinite(step) && step > 0 ? step : 1;

  function adjust(direction: -1 | 1) {
    const input = inputRef.current;
    if (!input || disabled) return;

    const current = Number(input.value || defaultValue || 0);
    const lower = Number.isFinite(min) ? min : 0;
    const upper = typeof max === "number" && Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;
    const raw = Math.min(upper, Math.max(lower, current + (buttonStep * direction)));
    const precision = Math.max(
      String(buttonStep).split(".")[1]?.length || 0,
      String(lower).split(".")[1]?.length || 0,
    );
    const next = precision ? Number(raw.toFixed(precision)) : raw;

    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return <div className={`quantity-control ${compact ? "compact" : ""}`}>
    <label htmlFor={id}>{label}</label>
    <div className="quantity-stepper">
      <button type="button" onClick={() => adjust(-1)} disabled={disabled} aria-label={`Decrease ${label.toLowerCase()}`}>
        <Minus size={16} strokeWidth={2.2}/>
      </button>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="number"
        inputMode="decimal"
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        required={!disabled}
      />
      <button type="button" onClick={() => adjust(1)} disabled={disabled} aria-label={`Increase ${label.toLowerCase()}`}>
        <Plus size={16} strokeWidth={2.2}/>
      </button>
    </div>
  </div>;
}
