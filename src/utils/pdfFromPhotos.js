// En SDK 54+ la API clásica de archivos vive en /legacy (ver filePersist.js).
import * as FileSystem from "expo-file-system/legacy";
import { base64ToBytes, bytesToBase64, buildPdfFromJpegs, isJpeg } from "./pdfBuilder";

// Junta varias fotos (JPEG) en UN solo PDF de varias páginas, guardado en el
// caché de la app, y devuelve { uri, name, type } listo para subir como
// cualquier otro archivo. Lanza un Error con mensaje para el usuario si alguna
// foto no es JPEG (la cámara siempre da JPEG; algunas fotos de galería pueden
// venir en PNG o HEIC y no se pueden incrustar tal cual).
export async function buildPdfFromPhotos(files, nameBase = "documento") {
  const pages = [];
  for (let i = 0; i < files.length; i += 1) {
    const b64 = await FileSystem.readAsStringAsync(files[i].uri, { encoding: FileSystem.EncodingType.Base64 });
    const bytes = base64ToBytes(b64);
    if (!isJpeg(bytes)) {
      throw new Error(
        `La foto de la página ${i + 1} no está en formato JPG. Tomala con la cámara o elegí otra de la galería.`,
      );
    }
    pages.push({ bytes });
  }
  const pdf = buildPdfFromJpegs(pages);
  const uri = `${FileSystem.cacheDirectory}${nameBase}_${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(pdf), { encoding: FileSystem.EncodingType.Base64 });
  return { uri, name: `${nameBase}.pdf`, type: "application/pdf" };
}
