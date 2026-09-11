import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

type PageItem = number | "ellipsis-left" | "ellipsis-right";

function paginationItems(currentPage: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: PageItem[] = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) items.push("ellipsis-left");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < totalPages - 1) items.push("ellipsis-right");
  items.push(totalPages);

  return items;
}

export function CataloguePagination({
  currentPage,
  totalPages,
  href,
  label = "Product pages",
}: {
  currentPage: number;
  totalPages: number;
  href: (page: number) => string;
  label?: string;
}) {
  if (totalPages <= 1) return null;

  const items = paginationItems(currentPage, totalPages);

  return <nav className="catalogue-pagination" aria-label={label}>
    <div className="catalogue-pagination-pages">
      {currentPage > 1 ? <Link className="catalogue-pagination-control" href={href(currentPage - 1)} rel="prev">
        <ChevronLeft size={17} strokeWidth={2.1} aria-hidden="true"/>
        <span>Previous</span>
      </Link> : <span className="catalogue-pagination-control is-disabled" aria-disabled="true">
        <ChevronLeft size={17} strokeWidth={2.1} aria-hidden="true"/>
        <span>Previous</span>
      </span>}

      <div className="catalogue-pagination-numbers">
        {items.map((item) => typeof item === "number"
          ? item === currentPage
            ? <span className="catalogue-pagination-page is-current" aria-current="page" key={item}>{item}</span>
            : <Link className="catalogue-pagination-page" href={href(item)} key={item}>{item}</Link>
          : <span className="catalogue-pagination-ellipsis" aria-hidden="true" key={item}>…</span>)}
      </div>

      {currentPage < totalPages ? <Link className="catalogue-pagination-control" href={href(currentPage + 1)} rel="next">
        <span>Next</span>
        <ChevronRight size={17} strokeWidth={2.1} aria-hidden="true"/>
      </Link> : <span className="catalogue-pagination-control is-disabled" aria-disabled="true">
        <span>Next</span>
        <ChevronRight size={17} strokeWidth={2.1} aria-hidden="true"/>
      </span>}
    </div>
    <p>Page {currentPage} of {totalPages}</p>
  </nav>;
}
