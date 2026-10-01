import { credimasterGet } from "./credimasterClient";

// Perfil y logo del tenant actual -- cualquier usuario autenticado puede
// verlos (no requiere permiso de configuración), incluida la app móvil.
export const getCompanyProfile = (token) => credimasterGet("/api/company/profile", token);

// Aparte de getCompanyProfile porque la URL del logo está firmada y expira
// (24h) -- se pide fresca cada vez que una pantalla la necesita, en vez de
// cachearla en la sesión del login.
export const getCompanyLogo = (token) => credimasterGet("/api/company/logo", token);
