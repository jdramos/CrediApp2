import { credimasterGet } from "./credimasterClient";

// ¿Mi usuario está exento de la ubicación obligatoria? ({ ok, location_exempt })
// La excepción se administra desde la web (Usuarios → Ubicación en la app).
export const getLocationPolicy = (token) => credimasterGet("/api/tracking/location-policy", token);
