import React, { useCallback, useEffect, useRef, useState } from "react";
import InAppCameraModal from "./InAppCameraModal";

// Anfitrión único de la cámara dentro de la app (se monta una vez en App.js). Cualquier pantalla pide una foto con
// requestInAppPhoto() (lo hace utils/imagePicker.js al elegir «Cámara» o con takePhoto) y recibe { uri, name, type } o
// null si cancela. Así todas las fotos usan la cámara de la app en vez de abrir la de Samsung, que hacía que Android
// cerrara la app por falta de memoria (ver InAppCameraModal.js).

let opener = null;

export function inAppCameraAvailable() {
  return typeof opener === "function";
}

export function requestInAppPhoto() {
  return new Promise((resolve, reject) => {
    if (!opener) {
      reject(new Error("La cámara de la app no está lista"));
      return;
    }
    opener(resolve);
  });
}

export default function InAppCameraHost() {
  const [visible, setVisible] = useState(false);
  const resolveRef = useRef(null);

  const finish = useCallback((file) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setVisible(false);
    resolve?.(file || null);
  }, []);

  useEffect(() => {
    opener = (resolve) => {
      // Si quedó una petición abierta se cierra como cancelada antes de atender la nueva.
      resolveRef.current?.(null);
      resolveRef.current = resolve;
      setVisible(true);
    };
    return () => {
      opener = null;
      resolveRef.current?.(null);
      resolveRef.current = null;
    };
  }, []);

  return <InAppCameraModal visible={visible} onCapture={finish} onClose={() => finish(null)} />;
}
