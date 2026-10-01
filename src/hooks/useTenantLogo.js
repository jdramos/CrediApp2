import { useEffect, useState } from "react";
import { getCompanyLogo } from "../api/companyApi";

// Best-effort: si no hay logo subido, o falla la petición (sin conexión,
// etc.), simplemente no se muestra nada -- igual que useBusinessDayStatus.
export function useTenantLogo(token) {
  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLogoUrl(null);
      return undefined;
    }
    getCompanyLogo(token)
      .then((res) => {
        if (!cancelled) setLogoUrl(res?.logo_url || null);
      })
      .catch(() => {
        if (!cancelled) setLogoUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return logoUrl;
}
