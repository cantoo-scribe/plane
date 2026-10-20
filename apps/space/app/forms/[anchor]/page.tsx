/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState, type FormEvent } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { SitesFormService } from "@plane/services";
import type { TIssueFormPublic, TIssueFormPublicField, TIssueFormSubmitResult } from "@plane/types";
import { LogoSpinner } from "@/components/common/logo-spinner";
import type { Route } from "./+types/page";

const formService = new SitesFormService();

export const headers: Route.HeadersFunction = () => ({
  "X-Frame-Options": "SAMEORIGIN",
});

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: TIssueFormPublicField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.target_kind === "CORE") {
    if (field.core_key === "description_html") {
      return (
        <textarea
          className="text-sm min-h-24 w-full rounded-md border border-subtle-1 bg-transparent px-3 py-2"
          value={typeof value === "string" ? value.replace(/^<p>|<\/p>$/g, "") : ""}
          onChange={(e) => onChange(`<p>${e.target.value}</p>`)}
          required={field.is_required}
          placeholder={field.label}
        />
      );
    }
    if (field.core_key === "priority") {
      return (
        <select
          className="text-sm w-full rounded-md border border-subtle-1 bg-transparent px-3 py-2"
          value={typeof value === "string" ? value : "none"}
          onChange={(e) => onChange(e.target.value)}
          required={field.is_required}
        >
          <option value="none">None</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      );
    }
    return (
      <input
        className="text-sm w-full rounded-md border border-subtle-1 bg-transparent px-3 py-2"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        required={field.is_required}
        placeholder={field.label}
      />
    );
  }

  switch (field.property_type) {
    case "NUMBER":
      return (
        <input
          type="number"
          className="text-sm w-full rounded-md border border-subtle-1 bg-transparent px-3 py-2"
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          required={field.is_required}
        />
      );
    case "BOOLEAN":
      return (
        <select
          className="text-sm w-full rounded-md border border-subtle-1 bg-transparent px-3 py-2"
          value={value == null ? "" : value ? "true" : "false"}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "true")}
          required={field.is_required}
        >
          <option value="">—</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    case "DATE":
      return (
        <input
          type="date"
          className="text-sm w-full rounded-md border border-subtle-1 bg-transparent px-3 py-2"
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
          required={field.is_required}
        />
      );
    case "DROPDOWN": {
      const isMulti = field.settings?.is_multi_select;
      const selected = Array.isArray(value) ? value : [];
      if (isMulti) {
        return (
          <select
            multiple
            className="text-sm min-h-24 w-full rounded-md border border-subtle-1 bg-transparent px-3 py-2"
            value={selected.map(String)}
            onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((option) => option.value))}
            required={field.is_required}
          >
            {(field.options ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        );
      }
      return (
        <select
          className="text-sm w-full rounded-md border border-subtle-1 bg-transparent px-3 py-2"
          value={selected[0] ? String(selected[0]) : ""}
          onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
          required={field.is_required}
        >
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      );
    }
    default:
      return (
        <input
          className="text-sm w-full rounded-md border border-subtle-1 bg-transparent px-3 py-2"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.is_required}
          placeholder={field.label}
        />
      );
  }
}

const PublicFormPage = observer(function PublicFormPage() {
  const params = useParams<{ anchor: string }>();
  const anchor = params.anchor;

  const [form, setForm] = useState<TIssueFormPublic | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TIssueFormSubmitResult | null>(null);

  useEffect(() => {
    if (!anchor) return;
    setLoading(true);
    formService
      .retrieve(anchor)
      .then((data) => {
        setForm(data);
        setError(null);
        return data;
      })
      .catch(() => {
        setError("This form is unavailable.");
        return null;
      })
      .finally(() => setLoading(false));
  }, [anchor]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || !anchor || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const field of form.fields) {
        const raw = answers[field.id];
        if (field.target_kind === "CUSTOM") {
          if (field.property_type === "TEXT") payload[field.id] = { value_text: raw };
          else if (field.property_type === "NUMBER") payload[field.id] = { value_number: raw };
          else if (field.property_type === "BOOLEAN") payload[field.id] = { value_boolean: raw };
          else if (field.property_type === "DATE") payload[field.id] = { value_datetime: raw };
          else if (field.property_type === "DROPDOWN")
            payload[field.id] = { value_option_ids: Array.isArray(raw) ? raw : [] };
          else payload[field.id] = raw;
        } else {
          payload[field.id] = raw;
        }
      }
      const res = await formService.submit(anchor, payload);
      setResult(res);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "errors" in err
          ? "Please fill in all required fields."
          : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-1">
        <LogoSpinner />
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-1 px-4">
        <p className="text-sm text-tertiary">{error}</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-1 px-4">
        <div className="w-full max-w-lg space-y-3 rounded-lg border border-subtle-1 bg-surface-2 p-6 text-center">
          <h1 className="text-xl font-semibold">Thanks for your submission</h1>
          <p className="text-sm text-tertiary">
            Created {result.project_identifier}-{result.sequence_id}: {result.name}
          </p>
        </div>
      </div>
    );
  }

  if (!form) return null;

  return (
    <div className="min-h-screen bg-surface-1 px-4 py-10">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="shadow-sm mx-auto w-full max-w-lg space-y-6 rounded-lg border border-subtle-1 bg-surface-2 p-6"
      >
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{form.name}</h1>
          {form.description && <p className="text-sm whitespace-pre-wrap text-tertiary">{form.description}</p>}
        </div>

        {/* honeypot */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

        {form.fields.map((field) => (
          <div key={field.id} className="space-y-1.5">
            <label className="text-sm block font-medium">
              {field.label}
              {field.is_required && <span className="text-danger-primary"> *</span>}
            </label>
            {field.help_text && <p className="text-xs text-tertiary">{field.help_text}</p>}
            <FieldInput
              field={field}
              value={answers[field.id]}
              onChange={(next) => setAnswers((prev) => ({ ...prev, [field.id]: next }))}
            />
          </div>
        ))}

        {error && <p className="text-sm text-danger-primary">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="text-sm w-full rounded-md bg-accent-primary px-4 py-2 font-medium text-on-color disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </form>
    </div>
  );
});

export default PublicFormPage;
