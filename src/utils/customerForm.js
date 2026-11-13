// Lógica del formulario "Nuevo cliente" (pantalla NewCustomerScreen): pasos, qué
// campos son obligatorios, validación y armado del cuerpo que recibe
// POST /api/customers. Sin React ni red, para poder probarlo aparte.
//
// Las reglas espejan las del servidor (middleware/validators/
// validateCustomerPayload.js) y las de la web (CustomerGeneralInfoTab /
// CustomerBusinessTab / CustomerReferencesTab). El servidor es quien manda:
// vuelve a validar todo y lo que rechace se muestra tal cual.
import { cedulaError, parseCedula } from "./nicaraguanId";

export const STEPS = [
  { key: "personal", title: "Datos personales" },
  { key: "home", title: "Domicilio y contacto" },
  { key: "activity", title: "Actividad económica" },
  { key: "refs", title: "Cónyuge y referencias" },
  { key: "confirm", title: "Cumplimiento y confirmación" },
];

// Estados civiles sin cónyuge (mismos ids que usa la web).
const NO_SPOUSE_MARITAL_IDS = [1, 3, 4];
export const CEDULA_TYPE_ID = 1;

// Campo -> [paso, etiqueta]. Sirve para llevar a la persona al paso correcto
// cuando falta algo y para nombrar el campo en los errores del servidor.
export const FIELD_INFO = {
  customer_name: [0, "Nombre y apellidos"],
  public_name: [0, "Nombre conocido públicamente"],
  genre_id: [0, "Género"],
  marital_status_id: [0, "Estado civil"],
  identity_type: [0, "Tipo de identificación"],
  identification: [0, "Identificación"],
  identity_issue_date: [0, "Fecha de emisión"],
  identity_expiration_date: [0, "Fecha de vencimiento"],
  identity_issue_country: [0, "País de emisión"],
  birth_date: [0, "Fecha de nacimiento"],
  age: [0, "Edad"],
  birth_country_id: [0, "País de nacimiento"],
  nationality_id: [0, "Nacionalidad"],
  customer_type: [0, "Tipo de cliente"],
  cellphone: [1, "Celular"],
  telephone: [1, "Teléfono"],
  email: [1, "Correo electrónico"],
  residence_country_id: [1, "País de residencia"],
  province_id: [1, "Departamento"],
  municipality_id: [1, "Municipio"],
  home_address: [1, "Dirección del domicilio"],
  economic_activity: [2, "Tipo de actividad"],
  conami_id_actividad_economica: [2, "Actividad económica CONAMI"],
  occupation: [2, "Profesión u oficio"],
  company: [2, "Empresa"],
  job_start_day: [2, "Fecha de inicio en el trabajo"],
  monthly_salary: [2, "Salario mensual"],
  job_telephone: [2, "Teléfono del trabajo"],
  business_name: [2, "Nombre del negocio"],
  business_type_id: [2, "Tipo de negocio"],
  business_address: [2, "Dirección del negocio"],
  business_telephone: [2, "Teléfono del negocio"],
  business_inventory: [2, "Inventario del negocio"],
  business_receivables: [2, "Cuentas por cobrar"],
  business_monthly_income: [2, "Ingresos mensuales del negocio"],
  business_license_entity: [2, "Licencia: entidad emisora"],
  business_license_issued: [2, "Licencia: fecha de emisión"],
  business_license_expiry: [2, "Licencia: fecha de vencimiento"],
  spouse_name: [3, "Cónyuge: nombre"],
  spouse_telephone: [3, "Cónyuge: teléfono"],
  spouse_position: [3, "Cónyuge: cargo u ocupación"],
  spouse_address: [3, "Cónyuge: dirección"],
  spouse_job_company: [3, "Cónyuge: empresa donde labora"],
  spouse_job_telephone: [3, "Cónyuge: teléfono del trabajo"],
  spouse_job_salary: [3, "Cónyuge: salario mensual"],
  reference_name: [3, "Referencia 1: nombre"],
  reference_relationship: [3, "Referencia 1: parentesco"],
  reference_telephone: [3, "Referencia 1: teléfono"],
  reference_known_time: [3, "Referencia 1: tiempo de conocerlo"],
  reference2_name: [3, "Referencia 2: nombre"],
  reference2_relationship: [3, "Referencia 2: parentesco"],
  reference2_telephone: [3, "Referencia 2: teléfono"],
  reference2_known_time: [3, "Referencia 2: tiempo de conocerlo"],
  is_pep: [4, "Persona expuesta políticamente"],
  pep_details: [4, "Cargo o relación con el cargo público"],
  funds_source: [4, "Origen de los fondos"],
  branch_id: [4, "Sucursal"],
};

// Mínimo que exige el servidor aun a empresas no normadas por la CONAMI
// (UNREGULATED_REQUIRED_FIELDS del backend).
const UNREGULATED_REQUIRED = [
  "customer_name",
  "identification",
  "birth_date",
  "age",
  "birth_country_id",
  "genre_id",
  "home_address",
  "reference_name",
];

const MONEY_FIELDS = [
  "business_inventory",
  "business_monthly_income",
  "business_receivables",
  "monthly_salary",
  "other_incomes",
  "spouse_job_salary",
];

export const EMPTY_FORM = {
  customer_name: "",
  public_name: "",
  genre_id: null,
  marital_status_id: null,
  identity_type: null,
  identification: "",
  identity_issue_date: "",
  identity_expiration_date: "",
  identity_issue_country: null,
  birth_date: "",
  age: "",
  birth_country_id: null,
  nationality_id: null,
  customer_type: "DEUDOR", // DEUDOR | FIADOR | AMBOS (Fiador/Ambos permite elegirlo como fiador de un crédito)

  cellphone: "",
  telephone: "",
  email: "",
  residence_country_id: null,
  province_id: null,
  municipality_id: null,
  home_address: "",

  economic_activity: null, // 1 = negocio propio, 2 = empleado
  conami_id_actividad_economica: null,
  occupation: "",
  company: "",
  job_start_day: "",
  monthly_salary: "",
  job_telephone: "",
  business_name: "",
  business_type_id: null,
  business_address: "",
  business_telephone: "",
  business_inventory: "",
  business_receivables: "",
  business_monthly_income: "",
  business_license_entity: "",
  business_license_issued: "",
  business_license_expiry: "",
  other_incomes: "",

  spouse_name: "",
  spouse_telephone: "",
  spouse_position: "",
  spouse_address: "",
  spouse_job_company: "",
  spouse_job_telephone: "",
  spouse_job_salary: "",
  reference_name: "",
  reference_identity: "",
  reference_address: "",
  reference_workplace: "",
  reference_telephone: "",
  reference_relationship: "",
  reference_known_time: "",
  reference2_name: "",
  reference2_identity: "",
  reference2_address: "",
  reference2_workplace: "",
  reference2_telephone: "",
  reference2_relationship: "",
  reference2_known_time: "",

  is_pep: null, // true / false
  pep_details: "",
  funds_source: "",
  branch_id: null,
};

const isEmpty = (v) => v === null || v === undefined || String(v).trim() === "";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CUSTOMER_TYPES = [
  { id: "DEUDOR", label: "Deudor" },
  { id: "FIADOR", label: "Fiador" },
  { id: "AMBOS", label: "Ambos" },
];

export const needsSpouse = (form) =>
  !isEmpty(form.marital_status_id) && !NO_SPOUSE_MARITAL_IDS.includes(Number(form.marital_status_id));

// ---- Fechas (texto AAAA-MM-DD) ------------------------------------------

// Mientras se escribe: solo dígitos y los guiones se ponen solos.
export function maskDate(text) {
  const d = String(text || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

export function isValidISODate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ""));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function addYears(iso, years) {
  if (!isValidISODate(iso)) return "";
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y + years, mo - 1, d));
  // 29 de febrero + años no bisiestos: se corre al 28.
  if (dt.getUTCMonth() !== mo - 1) dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}

export function ageFromBirth(iso, today = new Date()) {
  if (!isValidISODate(iso)) return "";
  const [y, mo, d] = iso.split("-").map(Number);
  let age = today.getFullYear() - y;
  const before = today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d);
  if (before) age -= 1;
  return age >= 0 ? String(age) : "";
}

// Fecha de nacimiento que lleva la cédula (ddmmaa). El siglo no viene en la
// cédula: igual que la web, 00-30 es 20aa y el resto 19aa.
export function birthFromCedula(cedula) {
  const parts = parseCedula(cedula);
  if (!parts) return "";
  const year = parts.yy + (parts.yy <= 30 ? 2000 : 1900);
  const iso = `${year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return isValidISODate(iso) ? iso : "";
}

export const normalizeCedula = (v) => String(v || "").replace(/[\s-]/g, "").toUpperCase().slice(0, 14);

// ---- Obligatorios y validación ------------------------------------------

export function requiredFields(form, { regulated = true, compliance = false } = {}) {
  if (!regulated) {
    const list = [...UNREGULATED_REQUIRED];
    if (compliance) list.push("is_pep");
    return list;
  }
  const employee = Number(form.economic_activity) === 2;
  const list = [
    "customer_name", "public_name", "genre_id", "marital_status_id",
    "identity_type", "identification", "identity_issue_date", "identity_expiration_date", "identity_issue_country",
    "birth_date", "age", "birth_country_id", "nationality_id",
    "cellphone", "residence_country_id", "province_id", "municipality_id", "home_address",
    "economic_activity", "conami_id_actividad_economica",
    ...(employee
      ? ["occupation", "company", "job_start_day", "monthly_salary"]
      : ["business_name", "business_type_id", "business_address", "business_inventory", "business_receivables", "business_monthly_income"]),
    "reference_name", "reference_relationship", "reference_telephone", "reference_known_time",
    "reference2_name", "reference2_relationship", "reference2_telephone", "reference2_known_time",
  ];
  if (needsSpouse(form)) list.push("spouse_name", "spouse_telephone", "spouse_position");
  if (compliance) list.push("is_pep");
  return list;
}

export const isRequired = (field, form, opts) => requiredFields(form, opts).includes(field);

// { campo: mensaje } con lo que falta o está mal. `onlyStep` limita la
// revisión a un paso (al tocar "Siguiente"); sin él se revisa todo.
export function validateForm(form, opts = {}, onlyStep = null) {
  const errors = {};
  const inScope = (field) => onlyStep === null || (FIELD_INFO[field] && FIELD_INFO[field][0] === onlyStep);

  for (const field of requiredFields(form, opts)) {
    if (!inScope(field)) continue;
    if (field === "is_pep") {
      if (form.is_pep !== true && form.is_pep !== false) errors.is_pep = "Indique si es una persona expuesta políticamente";
      continue;
    }
    if (isEmpty(form[field])) errors[field] = "Campo requerido";
  }

  // Fechas con formato.
  for (const field of ["birth_date", "identity_issue_date", "identity_expiration_date", "job_start_day", "business_license_issued", "business_license_expiry"]) {
    if (!inScope(field) || errors[field] || isEmpty(form[field])) continue;
    if (!isValidISODate(form[field])) errors[field] = "Fecha inválida (AAAA-MM-DD)";
  }

  // Correo: opcional, pero si se escribe debe ser válido (el servidor lo vuelve a revisar).
  if (inScope("email") && !isEmpty(form.email) && !EMAIL_PATTERN.test(String(form.email).trim())) {
    errors.email = "Correo electrónico no válido";
  }

  // Cédula: formato, fecha y que coincida con la de nacimiento.
  if (inScope("identification") && !errors.identification && Number(form.identity_type) === CEDULA_TYPE_ID && !isEmpty(form.identification)) {
    const birth = isValidISODate(form.birth_date) ? form.birth_date : null;
    const message = cedulaError(form.identification, birth);
    if (message) errors.identification = message;
  }

  // PEP: si es sí, describir el cargo.
  if (inScope("pep_details") && opts.compliance && form.is_pep === true && isEmpty(form.pep_details)) {
    errors.pep_details = "Describa el cargo o la relación con el cargo público";
  }

  // Montos: números no negativos.
  for (const field of MONEY_FIELDS) {
    if (!inScope(field) || errors[field] || isEmpty(form[field])) continue;
    const n = Number(String(form[field]).replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) errors[field] = "Monto inválido";
  }

  return errors;
}

// Paso más temprano que tiene un error (para saltar a él).
export function firstStepWithError(errors) {
  const steps = Object.keys(errors).map((f) => (FIELD_INFO[f] ? FIELD_INFO[f][0] : 4));
  return steps.length ? Math.min(...steps) : null;
}

// ---- Cuerpo para POST /api/customers -------------------------------------

const num = (v) => {
  if (isEmpty(v)) return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const str = (v) => (isEmpty(v) ? "" : String(v).trim());
const idOrEmpty = (v) => (isEmpty(v) ? "" : v);
const dateOrNull = (v) => (isValidISODate(v) ? v : null);

// Igual que la web: los montos van como número (0 si están vacíos) y los
// textos vacíos como "" (el servidor los guarda como NULL).
export function buildCustomerPayload(form) {
  const employee = Number(form.economic_activity) === 2;
  const monthlyIncome = num(form.business_monthly_income);
  const salary = num(form.monthly_salary);
  const pep = form.is_pep === true;

  const customer = {
    customer_name: str(form.customer_name),
    public_name: str(form.public_name) || str(form.customer_name),
    genre_id: idOrEmpty(form.genre_id),
    marital_status_id: idOrEmpty(form.marital_status_id),
    identity_type: idOrEmpty(form.identity_type),
    identification: str(form.identification),
    identity_issue_date: dateOrNull(form.identity_issue_date),
    identity_expiration_date: dateOrNull(form.identity_expiration_date),
    identity_issue_country: idOrEmpty(form.identity_issue_country),
    birth_date: dateOrNull(form.birth_date),
    age: isEmpty(form.age) ? "" : Number(form.age),
    birth_country_id: idOrEmpty(form.birth_country_id),
    nationality_id: idOrEmpty(form.nationality_id),
    customer_type: CUSTOMER_TYPES.some((t) => t.id === form.customer_type) ? form.customer_type : "DEUDOR",

    cellphone: str(form.cellphone),
    telephone: str(form.telephone),
    email: str(form.email),
    residence_country_id: idOrEmpty(form.residence_country_id),
    province_id: idOrEmpty(form.province_id),
    municipality_id: idOrEmpty(form.municipality_id),
    home_address: str(form.home_address),

    economic_activity: employee ? 2 : 1,
    conami_id_actividad_economica: idOrEmpty(form.conami_id_actividad_economica),

    // Empleado
    occupation: employee ? str(form.occupation) : "",
    company: employee ? str(form.company) : "",
    job_start_day: employee ? dateOrNull(form.job_start_day) : null,
    monthly_salary: employee ? salary : 0,
    annual_salary: employee ? salary * 12 : 0,
    job_telephone: employee ? str(form.job_telephone) : "",

    // Negocio propio
    business_name: employee ? "" : str(form.business_name),
    business_type_id: employee ? "" : idOrEmpty(form.business_type_id),
    business_address: employee ? "" : str(form.business_address),
    business_telephone: employee ? "" : str(form.business_telephone),
    business_inventory: employee ? 0 : num(form.business_inventory),
    business_receivables: employee ? 0 : num(form.business_receivables),
    business_monthly_income: employee ? 0 : monthlyIncome,
    business_annual_income: employee ? 0 : monthlyIncome * 12,
    business_license_entity: employee ? "" : str(form.business_license_entity),
    business_license_issued: employee ? null : dateOrNull(form.business_license_issued),
    business_license_expiry: employee ? null : dateOrNull(form.business_license_expiry),
    other_incomes: num(form.other_incomes),

    spouse_name: str(form.spouse_name),
    spouse_telephone: str(form.spouse_telephone),
    spouse_position: str(form.spouse_position),
    spouse_address: str(form.spouse_address),
    spouse_job_company: str(form.spouse_job_company),
    spouse_job_telephone: str(form.spouse_job_telephone),
    spouse_job_salary: num(form.spouse_job_salary),

    reference_name: str(form.reference_name),
    reference_identity: str(form.reference_identity),
    reference_address: str(form.reference_address),
    reference_workplace: str(form.reference_workplace),
    reference_telephone: str(form.reference_telephone),
    reference_relationship: str(form.reference_relationship),
    reference_known_time: str(form.reference_known_time),
    reference2_name: str(form.reference2_name),
    reference2_identity: str(form.reference2_identity),
    reference2_address: str(form.reference2_address),
    reference2_workplace: str(form.reference2_workplace),
    reference2_telephone: str(form.reference2_telephone),
    reference2_relationship: str(form.reference2_relationship),
    reference2_known_time: str(form.reference2_known_time),

    funds_source: str(form.funds_source),
    is_pep: pep,
    pep_details: pep ? str(form.pep_details) : null,
  };

  if (!isEmpty(form.branch_id)) customer.branch_id = form.branch_id;
  return { customer };
}

// Errores del servidor ([{ field: "customer.identification", message }]) ->
// { campo: mensaje } y los que no son de un campo (lista aparte).
export function mapServerErrors(list) {
  const fields = {};
  const general = [];
  for (const e of Array.isArray(list) ? list : []) {
    const field = String(e?.field || "").replace(/^customer\./, "");
    const message = e?.message || "Error";
    if (field && field !== "_" && FIELD_INFO[field]) fields[field] = message;
    else general.push(field && field !== "_" ? `${field}: ${message}` : message);
  }
  return { fields, general };
}

// ---- Ficha existente -> formulario (edición) ----------------------------

const dateText = (v) => {
  const t = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && !t.startsWith("0000") ? t : "";
};
const moneyText = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? String(n) : "";
};
const DATE_FORM_FIELDS = ["identity_issue_date", "identity_expiration_date", "birth_date", "job_start_day", "business_license_issued", "business_license_expiry"];

// Llena el formulario con la ficha que devuelve GET /api/customers/:id (campo `customer`).
export function formFromCustomer(customer) {
  const c = customer || {};
  const form = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    const v = c[key];
    if (v === undefined || v === null) continue;
    if (DATE_FORM_FIELDS.includes(key)) form[key] = dateText(v);
    else if (MONEY_FIELDS.includes(key)) form[key] = moneyText(v);
    else if (typeof EMPTY_FORM[key] === "string") form[key] = String(v);
    else form[key] = v;
  }
  form.age = c.age == null ? ageFromBirth(form.birth_date) : String(c.age);
  form.economic_activity = c.economic_activity == null || c.economic_activity === "" ? null : Number(c.economic_activity);
  form.customer_type = CUSTOMER_TYPES.some((t) => t.id === c.customer_type) ? c.customer_type : "DEUDOR";
  form.is_pep = c.is_pep === 1 || c.is_pep === true ? true : c.is_pep === 0 || c.is_pep === false ? false : null;
  form.branch_id = c.branch_id ?? null;
  return form;
}
