// Productos financieros en la solicitud de crédito (Configuración → Productos financieros de la web).
// Espejo de credimaster-frontend/src/components/loanProducts/loanProductLimits.js: avisa mientras se escribe;
// el servidor es quien decide (api/loanProducts/loanProductRules.js). Tasas en % MENSUAL.
// Un límite vacío (null) = rige la política general.

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";
const num = (v) => (isBlank(v) ? null : Number(v));
const fmt = (n) => Number(n).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Frecuencias permitidas del producto, como etiquetas ("S", "Q", "M"...).
export const frequenciesOf = (product) =>
  (Array.isArray(product?.allowed_frequencies) ? product.allowed_frequencies : []).map((f) => String(f).toUpperCase());

// Sucursales donde se ofrece (lista vacía = en todas).
export const productAllowsBranch = (product, branchId) => {
  const ids = Array.isArray(product?.branch_ids) ? product.branch_ids.map(Number) : [];
  return ids.length === 0 || isBlank(branchId) || ids.includes(Number(branchId));
};

// Productos que se pueden elegir hoy en la sucursal (el ya elegido siempre cuenta).
export const availableProductsFor = (products, branchId, selectedId) =>
  (products || []).filter(
    (p) => String(p.id) === String(selectedId) || (p.status === "ACTIVE" && productAllowsBranch(p, branchId)),
  );

// Devuelve { campo: mensaje } (el primero por campo). loan: { branch_id, amount, term, interest_rate, defaulted_rate, frequency_id (etiqueta) }.
export function productViolations(product, loan = {}) {
  const out = {};
  if (!product) return out;
  const add = (field, message) => {
    if (!out[field]) out[field] = message;
  };
  const label = `producto ${product.code}`;

  if (product.status && product.status !== "ACTIVE") add("product_id", `El ${label} está inactivo.`);
  if (!productAllowsBranch(product, loan.branch_id)) add("product_id", `El ${label} no se ofrece en la sucursal seleccionada.`);

  const amount = num(loan.amount);
  if (amount !== null) {
    if (num(product.min_amount) !== null && amount < Number(product.min_amount)) add("amount", `El monto es menor al mínimo del ${label}: C$ ${fmt(product.min_amount)}.`);
    if (num(product.max_amount) !== null && amount > Number(product.max_amount)) add("amount", `El monto excede el máximo del ${label}: C$ ${fmt(product.max_amount)}.`);
  }

  const term = num(loan.term);
  if (term !== null && term > 0) {
    if (num(product.min_term_months) !== null && term < Number(product.min_term_months)) add("term", `El plazo es menor al mínimo del ${label}: ${Number(product.min_term_months)} meses.`);
    if (num(product.max_term_months) !== null && term > Number(product.max_term_months)) add("term", `El plazo excede el máximo del ${label}: ${Number(product.max_term_months)} meses.`);
  }

  const rate = num(loan.interest_rate);
  if (rate !== null) {
    if (num(product.min_interest_rate) !== null && rate < Number(product.min_interest_rate) - 1e-9) add("interest_rate", `La tasa es menor a la mínima del ${label}: ${fmt(product.min_interest_rate)}% mensual.`);
    if (num(product.max_interest_rate) !== null && rate > Number(product.max_interest_rate) + 1e-9) add("interest_rate", `La tasa excede la máxima del ${label}: ${fmt(product.max_interest_rate)}% mensual.`);
  }

  const late = num(loan.defaulted_rate);
  if (late !== null && num(product.late_interest_rate) !== null && late > Number(product.late_interest_rate) + 1e-9) {
    add("defaulted_rate", `La tasa de mora excede la del ${label}: ${fmt(product.late_interest_rate)}%.`);
  }

  const freqs = frequenciesOf(product);
  if (freqs.length && !isBlank(loan.frequency_id) && !freqs.includes(String(loan.frequency_id).toUpperCase())) {
    add("frequency_id", `La frecuencia no está permitida en el ${label} (permitidas: ${freqs.join(", ")}).`);
  }

  return out;
}

// Mensaje único con todo lo que no cumple (null si cumple).
export function productViolationsMessage(product, loan) {
  const list = Object.values(productViolations(product, loan));
  return list.length ? list[0] : null;
}

// Prima del seguro asociado para un monto dado (null = el producto no trae seguro).
export function insurancePremium(product, amount) {
  if (!product?.insurance_product_id || product.insurance_premium_value === null || product.insurance_premium_value === undefined) return null;
  const value = Number(product.insurance_premium_value) || 0;
  if (product.insurance_premium_type === "PORCENTAJE_MONTO") return ((Number(amount) || 0) * value) / 100;
  return value;
}

// Comisión y otros cargos del producto en monto (la app los captura en monto; la web, en % o monto).
// null = el producto no los fija.
export function chargeFromProduct(product, field, amount) {
  const pct = field === "fee" ? product?.fee_percentage : product?.other_charges_percentage;
  if (isBlank(pct)) return null;
  return ((Number(amount) || 0) * Number(pct)) / 100;
}

// Columnas de la solicitud que fija el producto (y que el formulario bloquea).
export function lockedValues(product) {
  if (!product) return {};
  const out = {};
  if (!isBlank(product.loan_group_id)) out.id_tipo_agrupacion_credito = product.loan_group_id;
  if (!isBlank(product.conami_tipo_credito_id)) out.id_tipo_credito = product.conami_tipo_credito_id;
  if (!isBlank(product.currency_id)) out.id_moneda = product.currency_id;
  return out;
}

export const lockedFieldsFor = (product) => Object.keys(lockedValues(product));

// Valores que el producto prellena (el usuario los ajusta dentro de los límites).
// current: { amount (número), term (número) }. Devuelve texto listo para los campos de la app.
export function productPrefill(product, current = {}) {
  if (!product) return {};
  const next = {};
  if (num(product.default_interest_rate) !== null) next.interestRate = Number(product.default_interest_rate).toFixed(2);
  if (num(product.late_interest_rate) !== null) next.defaultedRate = Number(product.late_interest_rate).toFixed(2);
  const term = num(current.term);
  if (num(product.min_term_months) !== null && (term === null || term < Number(product.min_term_months))) next.term = String(Number(product.min_term_months));
  const amount = num(current.amount);
  if (num(product.min_amount) !== null && (amount === null || amount < Number(product.min_amount))) next.amount = Number(product.min_amount).toFixed(2);
  return next;
}
