"use client";

import { ArrowRight, LoaderCircle, Search, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StoreProductSuggestion } from "@/lib/magento/catalogue";
import { ProductImage } from "@/components/product-image";

export function CatalogueSearch({
  defaultValue = "",
  action = "/catalogue",
  categoryUid,
  placeholder = "Search products by name or SKU",
  autoFocus = false,
}: {
  defaultValue?: string;
  action?: string;
  categoryUid?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `catalogue-suggestions-${useId().replace(/:/g, "")}`;
  const inputId = "catalogue-search";
  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<StoreProductSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const cleanValue = value.trim();
  const hasSearchableValue = cleanValue.length >= 2;

  useEffect(() => {
    if (!hasSearchableValue) {
      setSuggestions([]);
      setLoading(false);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: cleanValue });
        if (categoryUid) params.set("category", categoryUid);
        const response = await fetch(`/api/catalogue/suggest?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Suggestion request failed");
        const data = await response.json() as { suggestions?: StoreProductSuggestion[] };
        if (!controller.signal.aborted) {
          setSuggestions(data.suggestions || []);
          setActiveIndex(-1);
          setOpen(true);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setActiveIndex(-1);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [categoryUid, cleanValue, hasSearchableValue]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function searchHref(term: string) {
    const clean = term.trim();
    return clean ? `${action}?q=${encodeURIComponent(clean)}` : action;
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOpen(false);
    router.push(searchHref(value));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!open || !suggestions.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => current >= suggestions.length - 1 ? 0 : current + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => current <= 0 ? suggestions.length - 1 : current - 1);
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const suggestion = suggestions[activeIndex];
      setOpen(false);
      router.push(`/product/${encodeURIComponent(suggestion.sku)}`);
    }
  }

  function clearSearch() {
    setValue("");
    setSuggestions([]);
    setActiveIndex(-1);
    setOpen(false);
    inputRef.current?.focus();
  }

  const showPanel = open && hasSearchableValue;

  return <div className="catalogue-search-autocomplete" ref={rootRef}>
    <form className="catalogue-search-form" role="search" onSubmit={submitSearch}>
      <Search className="catalogue-search-icon" size={21} strokeWidth={2} aria-hidden="true"/>
      <label className="sr-only" htmlFor={inputId}>Search products</label>
      <input
        id={inputId}
        ref={inputRef}
        className="catalogue-search-input"
        type="search"
        name="q"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showPanel}
        aria-controls={`${listId}-listbox`}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          setActiveIndex(-1);
          if (event.target.value.trim().length >= 2) setOpen(true);
        }}
        onFocus={() => {
          if (hasSearchableValue) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {loading ? <LoaderCircle className="catalogue-search-loading" size={18} strokeWidth={2} aria-label="Searching"/> : null}
      {value ? <button className="catalogue-search-clear" type="button" onClick={clearSearch} aria-label="Clear search">
        <X size={18} strokeWidth={2}/>
      </button> : null}
      <button className="catalogue-search-submit" type="submit">
        <Search size={17} strokeWidth={2.2} aria-hidden="true"/>
        <span>Search</span>
      </button>
    </form>

    {showPanel ? <div className="catalogue-suggestions" id={`${listId}-listbox`} role="listbox" aria-label="Product suggestions">
      {suggestions.length ? <div className="catalogue-suggestion-list">
        {suggestions.map((suggestion, index) => <Link
          className={`catalogue-suggestion${activeIndex === index ? " is-active" : ""}`}
          href={`/product/${encodeURIComponent(suggestion.sku)}`}
          id={`${listId}-option-${index}`}
          role="option"
          aria-selected={activeIndex === index}
          key={suggestion.uid}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => setOpen(false)}
        >
          <span className="catalogue-suggestion-image">
            <ProductImage src={suggestion.small_image?.url} alt={suggestion.small_image?.label || suggestion.name}/>
          </span>
          <span className="catalogue-suggestion-copy">
            <strong>{suggestion.name}</strong>
            <small>SKU {suggestion.sku}</small>
          </span>
          <ArrowRight size={17} strokeWidth={2} aria-hidden="true"/>
        </Link>)}
      </div> : !loading ? <p className="catalogue-suggestion-empty">No matching products found.</p> : null}

      <Link className="catalogue-suggestion-all" href={searchHref(value)} onClick={() => setOpen(false)}>
        <span>Search all products for “{cleanValue}”</span>
        <ArrowRight size={17} strokeWidth={2} aria-hidden="true"/>
      </Link>
    </div> : null}
  </div>;
}
