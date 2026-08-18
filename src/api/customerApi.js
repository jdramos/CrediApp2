import { credimasterGet, credimasterPut } from "./credimasterClient";

// Búsqueda liviana por nombre o identificación (GET /getCustomerList,
// permiso clientes.ver) — pensada para autocompletar, no trae todos los
// campos del cliente.
export const searchCustomers = (token, query) =>
  credimasterGet(`/api/customer/getCustomerList?query=${encodeURIComponent(query || "")}`, token);

// Registro completo del cliente (GET /:customerId, permiso clientes.ver).
// Necesario antes de guardar una ubicación: el backend espera el objeto
// `customer` COMPLETO en el PUT (no admite parches parciales), así que
// hay que traer todo primero y solo cambiar home_lat/home_lng/
// business_lat/business_lng antes de reenviarlo.
export const getCustomer = (token, customerId) =>
  credimasterGet(`/api/customer/${customerId}`, token);

// Guarda la ubicación de casa y/o negocio. `fullCustomer` es el objeto
// `customer` tal como vino de getCustomer(); `location` trae solo los
// campos que cambian.
export const saveCustomerLocation = (token, customerId, fullCustomer, location) =>
  credimasterPut(
    `/api/customer/${customerId}`,
    { customer: { ...fullCustomer, ...location } },
    token,
  );
