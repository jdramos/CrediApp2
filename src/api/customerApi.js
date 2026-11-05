import { credimasterGet, credimasterPost, credimasterPut } from "./credimasterClient";

// Búsqueda liviana por nombre o identificación (GET /getCustomerList,
// permiso clientes.ver) — pensada para autocompletar, no trae todos los
// campos del cliente. `app=1`: el servidor solo devuelve los clientes del
// usuario (su cartera, los que supervisa, los que registró) salvo que tenga
// el permiso clientes.ver.todos (nivel gerencial).
export const searchCustomers = (token, query) =>
  credimasterGet(`/api/customers/getCustomerList?app=1&query=${encodeURIComponent(query || "")}`, token);

// Registro completo del cliente (GET /:customerId, permiso clientes.ver).
// Necesario antes de guardar una ubicación: el backend espera el objeto
// `customer` COMPLETO en el PUT (no admite parches parciales), así que
// hay que traer todo primero y solo cambiar home_lat/home_lng/
// business_lat/business_lng antes de reenviarlo.
export const getCustomer = (token, customerId) =>
  credimasterGet(`/api/customers/${customerId}`, token);

const LOCATION_KEYS = ["home_lat", "home_lng", "business_lat", "business_lng"];
const sameCoord = (a, b) =>
  (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 1e-6);

// Guarda la ubicación de casa y/o negocio. `fullCustomer` es el objeto
// `customer` tal como vino de getCustomer(); `location` trae solo los
// campos que cambian.
//
// Después de guardar se vuelve a leer el cliente y se comprueba que las
// coordenadas quedaron en el servidor: el 3-nov-2026 un guardado respondió
// "ok" y la ficha siguió sin ubicación, y la app decía "Ubicación guardada".
// El error lleva `status` para que no se confunda con falta de señal (que
// encola el guardado para reintentarlo).
export const saveCustomerLocation = async (token, customerId, fullCustomer, location) => {
  const res = await credimasterPut(
    `/api/customers/${customerId}`,
    { customer: { ...fullCustomer, ...location } },
    token,
  );

  const check = await credimasterGet(`/api/customers/${customerId}`, token).catch(() => null);
  const stored = check?.data?.customer;
  if (stored && LOCATION_KEYS.some((k) => k in location && !sameCoord(stored[k], location[k]))) {
    throw Object.assign(
      new Error("El servidor respondió que guardó, pero la ubicación no quedó guardada. Avisá a la oficina."),
      { status: 422 },
    );
  }
  return res;
};

// Crea/actualiza las garantías del cliente (no existe un POST /api/
// guarantees dedicado — se hace a través del mismo PUT de cliente). El
// backend reconcilia por id: filas con `id` = actualizar, sin `id` =
// crear, las que falten del array = borrar (salvo que estén
// comprometidas con un crédito activo, ahí da 409). Por eso SIEMPRE hay
// que mandar la lista COMPLETA (existentes + la nueva), nunca solo la
// nueva. Requiere permiso clientes.editar (no garantias.insertar,
// porque técnicamente es un PUT de cliente).
export const saveCustomerGuarantees = (token, customerId, fullCustomer, guarantees) =>
  credimasterPut(
    `/api/customers/${customerId}`,
    { customer: fullCustomer, guarantees },
    token,
  );

// Expediente del cliente (actualización periódica por nivel de riesgo, solo
// alerta). GET trae el estado (vencido/por vencer/al día), los datos que se
// revisan y el historial; POST guarda la actualización (permiso
// clientes.expediente.actualizar o clientes.editar) — guardar sin cambios
// también cuenta: quedan confirmados los datos. Ver backend
// api/customer/customerInfoUpdate.js.
export const getCustomerInfoUpdate = (token, customerId) =>
  credimasterGet(`/api/customers/${customerId}/info-update`, token);

export const saveCustomerInfoUpdate = (token, customerId, payload) =>
  credimasterPost(`/api/customers/${customerId}/info-update`, { channel: "APP", ...payload }, token);

// Expedientes vencidos o por vencer de la cartera del usuario (app=1).
export const getInfoUpdatesDue = (token, status = "PENDING") =>
  credimasterGet(`/api/customers/info-updates/due?app=1&status=${encodeURIComponent(status)}`, token);
