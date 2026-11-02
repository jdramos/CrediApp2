import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

const buildFile = (asset) => {
  const uri = asset.uri;
  const name = asset.fileName || uri.split("/").pop() || `foto_${Date.now()}.jpg`;
  const ext = name.split(".").pop()?.toLowerCase();
  const type = asset.mimeType || (ext === "png" ? "image/png" : "image/jpeg");
  return { uri, name, type };
};

async function launchCamera() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("Se necesita permiso de cámara para tomar la foto.");
  const res = await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ["images"] });
  if (res.canceled || !res.assets?.[0]) return null;
  return buildFile(res.assets[0]);
}

async function launchLibrary() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Se necesita permiso para acceder a tus fotos.");
  const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ["images"] });
  if (res.canceled || !res.assets?.[0]) return null;
  return buildFile(res.assets[0]);
}

// Abre directo la cámara (sin galería) para comprobantes que deben ser una
// foto del momento, como el recibido de la entrega de un desembolso. Devuelve
// { uri, name, type } o null si el usuario cancela.
export function takePhoto() {
  return launchCamera();
}

// Muestra "Cámara / Galería / Cancelar" y devuelve { uri, name, type } listo
// para meter en un FormData, o null si el usuario cancela.
export function pickImage() {
  return new Promise((resolve, reject) => {
    Alert.alert(
      "Agregar foto",
      "¿Cómo querés agregarla?",
      [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(null) },
        { text: "Galería", onPress: () => launchLibrary().then(resolve).catch(reject) },
        { text: "Cámara", onPress: () => launchCamera().then(resolve).catch(reject) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

// Arma el FormData listo para credimasterUpload. El nombre del campo del
// archivo varía por endpoint: "file" en garantías/documentos de cliente,
// "image" en la entrega de desembolsos — por eso es configurable.
export function buildImageFormData(file, extraFields = {}, fieldName = "file") {
  const form = new FormData();
  if (Platform.OS === "web") {
    // En el navegador FormData no acepta el objeto { uri, name, type } (lo
    // vuelve texto y el servidor responde "falta la imagen"); necesita un Blob
    // real. Como armarlo es asíncrono, se deja anotado y credimasterUpload lo
    // completa justo antes de enviar.
    form.__webFile = { fieldName, file };
  } else {
    form.append(fieldName, { uri: file.uri, name: file.name, type: file.type });
  }
  Object.entries(extraFields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, String(value));
  });
  return form;
}
