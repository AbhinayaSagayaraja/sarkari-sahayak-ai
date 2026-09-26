// Shared helpers: JSX-free rendering (htm), API calls, formatting, profile flow.
import React from "react";
import htm from "htm";

export const html = htm.bind(React.createElement);

export async function api(path, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: isForm || body === undefined ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

// Display order of the profile card.
export const PROFILE_FIELDS = [
  "name", "age", "gender", "state", "occupation", "annual_income", "family_size", "house_type",
  "owns_land", "land_acres", "enrolled_post_matric", "income_tax_payer", "govt_employee", "existing_benefits",
];

// Order in which Sahayak asks for missing information.
const QUESTION_ORDER = ["name", "age", "state", "occupation", "annual_income", "family_size", "house_type"];

/** Next field to ask about, or null when the profile is complete enough to evaluate. */
export function nextField(p) {
  const missing = QUESTION_ORDER.find((f) => p[f] === undefined);
  if (missing) return missing;
  if (p.occupation === "farmer" && p.owns_land === undefined) return "owns_land";
  if (p.occupation === "student" && p.enrolled_post_matric === undefined) return "enrolled_post_matric";
  return null;
}

/** Human-readable, localised value of one profile field. */
export function showValue(t, field, v) {
  if (v === undefined || v === null) return "—";
  if (typeof v === "boolean") return v ? t("values.yes") : t("values.no");
  if (field === "annual_income") return inr(v);
  if (["occupation", "house_type", "gender"].includes(field)) return t(`values.${field}.${v}`);
  if (field === "existing_benefits") return v.length ? v.map(t.scheme).join(", ") : t("values.none");
  return String(v);
}

/** Leaf criteria of a rules-engine result (flattens any_of groups). */
export const leaves = (criteria) => criteria.flatMap((c) => c.any_of || [c]);

export function storage(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
export function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode: ignore */ }
}
