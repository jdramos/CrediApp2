import { Platform } from "react-native";
import * as Sharing from "expo-sharing";

// Comparte una imagen PNG ya capturada (uri de captureRef).
// - iOS/Android: hoja de compartir del sistema (WhatsApp, correo, etc.).
// - Web: expo-sharing le pasa la imagen al navegador como "url" y navigator.share
//   la rechaza ("Invalid URL"). Aquí se comparte como ARCHIVO si el navegador
//   puede (móvil/Edge/Safari) y, si no, se descarga el PNG para adjuntarlo a mano.
export async function shareImage(uri, title) {
  if (Platform.OS !== "web") {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("Este dispositivo no permite compartir archivos.");
    }
    await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: title });
    return;
  }

  const blob = await (await fetch(uri)).blob();
  const fileName = `${title.replace(/[^\w]+/g, "_")}.png`;
  const file = new File([blob], fileName, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (e) {
      if (e?.name === "AbortError") return; // el usuario cerró el diálogo
      // otro fallo: se cae a la descarga
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
