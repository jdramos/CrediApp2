import { credimasterGet, credimasterPut } from "./credimasterClient";

// Búsqueda liviana por nombre o identificación (GET /getCustomerList,
// permiso clientes.ver) — pensada para autocompletar, no trae todos los
// campos del cliente.
export const searchCustomers = (token, query) =>
  credimasterGet(`/api/customers/getCustomerList?query=${encodeURIComponent(query || "")}`, token);

// Registro completo del cliente (GET /:customerId, permiso clientes.ver).
// Necesario antes de guardar una ubicación: el backend espera el objeto
// `customer` COMPLETO en el PUT (no admite parches parciales), así que
// hay que traer todo primero y solo cambiar home_lat/home_lng/
// business_lat/business_lng antes de reenviarlo.
export const getCustomer = (token, customerId) =>
  credimasterGet(`/api/customers/${customerId}`, token);

// Guarda la ubicación de casa y/o negocio. `fullCustomer` es el objeto
// `customer` tal como vino de getCustomer(); `location` trae solo los
// campos que cambian.
export const saveCustomerLocation = (token, customerId, fullCustomer, location) =>
  credimasterPut(
    `/api/customers/${customerId}`,
    { customer: { ...fullCustomer, ...location } },
    token,
  );

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
