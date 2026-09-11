"use client";

import { ChevronDown, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MenuCategory } from "@/lib/magento/menu-categories";

function categoryHref(category: Pick<MenuCategory, "uid" | "url_key">) {
  return `/catalogue/category/${encodeURIComponent(category.url_key || category.uid)}`;
}

function ProductCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return <small>{count} product{count === 1 ? "" : "s"}</small>;
}

function MobileCategoryTree({ categories }: { categories: MenuCategory[] }) {
  return <ul className="mega-menu-mobile-level mega-menu-mobile-root">
    {categories.map((category) => <li key={category.uid}>
      <Link href={categoryHref(category)}>
        <span>
          <strong>{category.name}</strong>
          <ProductCount count={category.product_count}/>
        </span>
      </Link>
      {category.children.length ? <ul className="mega-menu-mobile-level">
        {category.children.map((child) => <li key={child.uid}>
          <Link href={categoryHref(child)}>
            <span>
              <strong>{child.name}</strong>
              <ProductCount count={child.product_count}/>
            </span>
          </Link>
          {child.children.length ? <ul className="mega-menu-mobile-level">
            {child.children.map((grandchild) => <li key={grandchild.uid}>
              <Link href={categoryHref(grandchild)}>
                <span>
                  <strong>{grandchild.name}</strong>
                  <ProductCount count={grandchild.product_count}/>
                </span>
              </Link>
            </li>)}
          </ul> : null}
        </li>)}
      </ul> : null}
    </li>)}
  </ul>;
}

export function ProductMegaMenu({ categories }: { categories: MenuCategory[] }) {
  const [open, setOpen] = useState(false);
  const [activeRootUid, setActiveRootUid] = useState<string | null>(null);
  const [activeChildUid, setActiveChildUid] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressTriggerFocusRef = useRef(false);

  const activeRoot = categories.find((category) => category.uid === activeRootUid) || null;
  const activeChild = activeRoot?.children.find((child) => child.uid === activeChildUid) || null;

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openMenu() {
    clearCloseTimer();
    setOpen(true);
  }

  function closeMenu(restoreFocus = false) {
    clearCloseTimer();
    setOpen(false);
    setActiveRootUid(null);
    setActiveChildUid(null);
    if (restoreFocus) {
      suppressTriggerFocusRef.current = true;
      triggerRef.current?.focus();
    }
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => closeMenu(), 140);
  }

  function selectRoot(category: MenuCategory) {
    clearCloseTimer();
    setActiveRootUid(category.uid);
    setActiveChildUid(null);
  }

  function selectChild(child: MenuCategory) {
    clearCloseTimer();
    setActiveChildUid(child.uid);
  }

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu(true);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return <div
    className={`products-mega${open ? " is-open" : ""}`}
    ref={rootRef}
    onMouseEnter={openMenu}
    onMouseLeave={scheduleClose}
    onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleClose();
    }}
  >
    <button
      className="products-mega-trigger"
      type="button"
      aria-expanded={open}
      aria-controls="products-mega-menu"
      onFocus={() => {
        if (suppressTriggerFocusRef.current) {
          suppressTriggerFocusRef.current = false;
          return;
        }
        openMenu();
      }}
      onClick={() => open ? closeMenu() : openMenu()}
      ref={triggerRef}
    >
      <span>Products</span>
      <ChevronDown className="products-mega-chevron" size={15} strokeWidth={2.25} aria-hidden="true"/>
    </button>

    {open ? <div className="mega-menu" id="products-mega-menu" aria-label="Product categories">
      <div className="mega-menu-heading">
        <div>
          <strong>Shop by category</strong>
          <span>Hover a category to browse deeper levels.</span>
        </div>
        <button className="mega-menu-close" type="button" onClick={() => closeMenu(true)} aria-label="Close product menu">
          <X size={18} strokeWidth={2}/>
        </button>
      </div>

      {categories.length ? <>
        <div className="mega-menu-cascade">
          <div className="mega-menu-column mega-menu-column-root">
            <ul className="mega-menu-level">
              {categories.map((category) => <li
                className={activeRootUid === category.uid ? "is-active" : undefined}
                key={category.uid}
                onMouseEnter={() => selectRoot(category)}
                onFocusCapture={() => selectRoot(category)}
              >
                <Link className="mega-menu-entry" href={categoryHref(category)}>
                  <span>
                    <strong>{category.name}</strong>
                    <ProductCount count={category.product_count}/>
                  </span>
                  {category.children.length ? <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true"/> : null}
                </Link>
              </li>)}
            </ul>
          </div>

          <div className="mega-menu-column mega-menu-column-child">
            {activeRoot?.children.length ? <ul className="mega-menu-level">
              {activeRoot.children.map((child) => <li
                className={activeChildUid === child.uid ? "is-active" : undefined}
                key={child.uid}
                onMouseEnter={() => selectChild(child)}
                onFocusCapture={() => selectChild(child)}
              >
                <Link className="mega-menu-entry" href={categoryHref(child)}>
                  <span>
                    <strong>{child.name}</strong>
                    <ProductCount count={child.product_count}/>
                  </span>
                  {child.children.length ? <ChevronRight size={16} strokeWidth={2.1} aria-hidden="true"/> : null}
                </Link>
              </li>)}
            </ul> : null}
          </div>

          <div className="mega-menu-column mega-menu-column-grandchild">
            {activeChild?.children.length ? <ul className="mega-menu-level">
              {activeChild.children.map((grandchild) => <li key={grandchild.uid}>
                <Link className="mega-menu-entry" href={categoryHref(grandchild)}>
                  <span>
                    <strong>{grandchild.name}</strong>
                    <ProductCount count={grandchild.product_count}/>
                  </span>
                </Link>
              </li>)}
            </ul> : null}
          </div>
        </div>

        <div className="mega-menu-mobile-tree">
          <MobileCategoryTree categories={categories}/>
        </div>
      </> : <p className="mega-menu-empty">No product categories are currently available in the store menu.</p>}
    </div> : null}
  </div>;
}
