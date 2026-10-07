"use client";

import { Check, CircleAlert, PackageCheck, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";
import { EmployeePicker } from "@/components/employee-picker";
import { QuantityStepper } from "@/components/quantity-stepper";
import type { PurchaseConstraints } from "@/lib/magento/catalogue";
import type { ConfigurableOption, ConfigurableVariant } from "@/lib/magento/product";
import type { EmployeeOrdering } from "@/lib/magento/employee";

function variantMatches(
  variant: ConfigurableVariant,
  selected: Record<string, string>,
) {
  const selectedUids = Object.values(selected).filter(Boolean);
  return selectedUids.every((uid) =>
    variant.attributes.some((attribute) => attribute.uid === uid),
  );
}

function isVariantInStock(variant: ConfigurableVariant) {
  return variant.product.css_stock_info?.available
    ?? variant.product.stock_status === "IN_STOCK";
}

export function ConfigurableProductControls({
  options,
  variants,
  constraints,
  canAdd,
  addLabel,
  employeeOrdering,
}: {
  options: ConfigurableOption[];
  variants: ConfigurableVariant[];
  constraints: PurchaseConstraints | null;
  canAdd: boolean;
  addLabel: string;
  employeeOrdering: EmployeeOrdering;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});

  const complete = options.length > 0
    && options.every((option) => Boolean(selected[option.uid]));

  const selectedVariant = useMemo(
    () => complete
      ? variants.find((variant) => variantMatches(variant, selected)) || null
      : null,
    [complete, selected, variants],
  );

  const selectedVariantAvailable = Boolean(
    selectedVariant && isVariantInStock(selectedVariant),
  );
  const canSubmit = canAdd && complete && selectedVariantAvailable;

  const remainingOptions = options
    .filter((option) => !selected[option.uid])
    .map((option) => option.label);

  function optionValueAvailable(optionUid: string, valueUid: string) {
    const candidate = {
      ...selected,
      [optionUid]: valueUid,
    };

    return variants.some(
      (variant) => isVariantInStock(variant) && variantMatches(variant, candidate),
    );
  }

  function choose(optionUid: string, valueUid: string) {
    setSelected((current) => ({
      ...current,
      [optionUid]: valueUid,
    }));
  }

  const minimum = Math.max(1, constraints?.minimum_quantity || 1);
  const singleOptionLabel = options.length === 1 ? options[0].label.toLowerCase() : null;
  const selectionPrompt = singleOptionLabel
    ? `Select a ${singleOptionLabel}`
    : "Choose options";

  return <div className="configurable-order-controls">
    <div className="configurable-option-stack">
      {options.map((option) => <section className="configurable-option-group" key={option.uid}>
        <div className="configurable-option-heading">
          <strong>{option.label}</strong>
          <span>Choose {option.label.toLowerCase()}</span>
        </div>

        <div
          className="configurable-value-grid"
          role="group"
          aria-label={option.label}
        >
          {option.values.map((value) => {
            const active = selected[option.uid] === value.uid;
            const available = optionValueAvailable(option.uid, value.uid);

            return <button
              className={[
                "configurable-value-tile",
                active ? "selected" : "",
                !available ? "unavailable" : "",
              ].filter(Boolean).join(" ")}
              type="button"
              aria-pressed={active}
              disabled={!available && !active}
              onClick={() => choose(option.uid, value.uid)}
              key={value.uid}
            >
              <span>{value.label}</span>
              {active ? <Check size={15} strokeWidth={2.5} aria-hidden="true"/> : null}
            </button>;
          })}
        </div>

        {selected[option.uid]
          ? <input type="hidden" name="selected_option" value={selected[option.uid]}/>
          : null}
      </section>)}
    </div>

    {selectedVariant ? <div
      className={[
        "configurable-variant-status",
        selectedVariantAvailable ? "available" : "unavailable",
      ].join(" ")}
      aria-live="polite"
    >
      {selectedVariantAvailable
        ? <PackageCheck size={16} strokeWidth={2.2} aria-hidden="true"/>
        : <CircleAlert size={16} strokeWidth={2.2} aria-hidden="true"/>}
      <strong>{selectedVariant.product.sku}</strong>
      <span aria-hidden="true">·</span>
      <span>{selectedVariantAvailable ? "In stock" : "Unavailable"}</span>
    </div> : <p className="configurable-selection-hint" aria-live="polite">
      {singleOptionLabel
        ? `${selectionPrompt} to continue.`
        : remainingOptions.length
          ? `Select ${remainingOptions.map((label) => label.toLowerCase()).join(" and ")} to continue.`
          : "Select an available option to continue."}
    </p>}

    {employeeOrdering.usesEmployee && employeeOrdering.multiEmployeeBasket ? <div className="configurable-employee">
      <EmployeePicker employees={employeeOrdering.employees}/>
    </div> : null}

    <div className="configurable-order-actions">
      <QuantityStepper
        name="quantity"
        label="Quantity"
        defaultValue={minimum}
        min={constraints?.minimum_quantity || 1}
        max={constraints?.maximum_quantity ?? undefined}
        step={constraints?.increments_enforced ? constraints.quantity_increment : "any"}
        disabled={!canSubmit}
      />

      <button
        className="button order-primary-action configurable-add-button"
        type="submit"
        disabled={!canSubmit}
      >
        <ShoppingCart size={19} aria-hidden="true"/>
        <span>{canSubmit ? addLabel : canAdd ? selectionPrompt : "Ordering unavailable"}</span>
      </button>
    </div>
  </div>;
}
