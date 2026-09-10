"use client";

import { Check, ChevronDown, UserRound } from "lucide-react";
import { useRef, useState } from "react";

type EmployeeOption = {
  employee_id: number;
  full_name: string;
  employee_code?: string | null;
  department?: string | null;
};

export function EmployeePicker({
  employees,
  name = "employee_id",
  label = "Employee",
  defaultSelectedId = null,
}: {
  employees: EmployeeOption[];
  name?: string;
  label?: string;
  defaultSelectedId?: number | null;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const validDefault = defaultSelectedId !== null && employees.some((employee) => employee.employee_id === defaultSelectedId)
    ? defaultSelectedId
    : null;
  const [selectedId, setSelectedId] = useState<number | null>(validDefault);
  const selected = employees.find((employee) => employee.employee_id === selectedId) || null;

  function choose(employee: EmployeeOption) {
    setSelectedId(employee.employee_id);
    if (detailsRef.current) detailsRef.current.open = false;
  }

  return <div className="employee-picker">
    <span className="employee-picker-label">{label}</span>
    <input type="hidden" name={name} value={selectedId ?? ""}/>
    <details ref={detailsRef}>
      <summary>
        <span className="employee-picker-trigger-copy">
          <UserRound size={18} aria-hidden="true"/>
          <span>
            <strong>{selected?.full_name || "Choose Employee"}</strong>
            {selected ? <small>{[selected.employee_code, selected.department].filter(Boolean).join(" · ")}</small> : <small>Select who this item is for</small>}
          </span>
        </span>
        <ChevronDown className="employee-picker-chevron" size={18} aria-hidden="true"/>
      </summary>

      <div className="employee-picker-menu" role="listbox" aria-label={label}>
        {employees.map((employee) => {
          const active = employee.employee_id === selectedId;
          const meta = [employee.employee_code, employee.department].filter(Boolean).join(" · ");
          return <button
            type="button"
            role="option"
            aria-selected={active}
            className={active ? "selected" : ""}
            onClick={() => choose(employee)}
            key={employee.employee_id}
          >
            <span>
              <strong>{employee.full_name}</strong>
              {meta ? <small>{meta}</small> : null}
            </span>
            {active ? <Check size={17} aria-hidden="true"/> : null}
          </button>;
        })}
      </div>
    </details>
  </div>;
}
