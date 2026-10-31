import { cloneElement, type AriaAttributes, type ReactElement } from "react";

type ControlProps = AriaAttributes & { id?: string; required?: boolean };

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactElement<ControlProps>;
}

/** A shared label and description contract for input, select, and textarea controls. */
export function Field({ id, label, hint, error, required, children }: FieldProps) {
  const descriptions = [children.props["aria-describedby"], hint && `${id}-hint`, error && `${id}-error`]
    .filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field${error ? " field--invalid" : ""}`}>
      <label className="field-label" htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      {cloneElement(children, {
        id,
        required: required ?? children.props.required,
        "aria-describedby": descriptions,
        "aria-invalid": error ? true : children.props["aria-invalid"],
      })}
      {hint && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}
