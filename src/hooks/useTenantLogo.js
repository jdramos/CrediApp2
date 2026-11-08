import { useEffect, useState } from "react";
import { getCompanyLogo } from "../api/companyApi";

// Logo de la empresa para recibos, estados de cuenta y demás imágenes que se
// comparten. Se descarga UNA vez por sesión y se incrusta como data URI: si la
// imagen se bajara de la red en el momento de capturar (react-native-view-shot),
// la captura podía salir sin logo (aún no cargaba, URL firmada vencida o señal
// débil). Si no se puede incrustar, se usa la URL tal cual (como antes).
//
// Best-effort: si no hay logo subido, o falla la petición (sin conexión,
// etc.), simplemente no se muestra nada -- igual que useBusinessDayStatus.
const cache = new Map(); // token -> Promise<string|null>

const blobToDataUri = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const loadLogo = async (token) => {
  const res = await getCompanyLogo(token);
  const url = res?.logo_url || null;
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return url;
    const dataUri = await blobToDataUri(await r.blob());
    return dataUri && dataUri.startsWith("data:image") ? dataUri : url;
  } catch {
    return url;
  }
};

export function useTenantLogo(token) {
  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLogoUrl(null);
      return undefined;
    }
    if (!cache.has(token)) {
      const p = loadLogo(token).catch(() => {
        cache.delete(token); // que el próximo intento vuelva a probar
        return null;
      });
      cache.set(token, p);
    }
    const p = cache.get(token);
    p.then((v) => {
      if (!v && cache.get(token) === p) cache.delete(token); // sin logo: se vuelve a preguntar en la próxima pantalla
      if (!cancelled) setLogoUrl(v);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return logoUrl;
}
